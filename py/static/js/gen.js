function copyToClipboard(text) {
    input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    input.setSelectionRange(0, 9999);
    document.execCommand('copy');
    document.body.removeChild(input);
}

function copyResultToClipboard() {
    copyToClipboard(document.getElementById('result').innerText);
    snackbar("Скопировано в буфер обмена");
    return false;
}

let all_resources = [];
let selected_resource = undefined;
let selected_account = undefined;
let unsaved_account = undefined;
let unsaved_resource = undefined;

function load_resources() {
    $.ajax({
        url: 'batchresources', success: (data) => {
            all_resources = data;
            searchResources();
        }
    });
}

let last_search = undefined;
const default_account_name = "По умолчанию";
function makeNewAccount(name) {
    return {
        "id": null,
        "pass_part": "",
        "human_readable": name,
        "length": 12,
        "letters": true,
        "digits": true,
        "symbols": true,
        "underscore": true,
        "revision": "0"
    }
}

function makeNewResource(name) {
    return {
        "name": name,
        "id": null,
        "default_account_id": null,
        "accounts": [
            makeNewAccount(default_account_name),
        ],
        "url": "https://" + name,
        "comment": "",
    }
}

let last_account_search = null;

function searchAccounts(unlimited = false) {
    const new_text = $("#account-name").val();
    if (new_text == last_account_search && !unlimited) {
        return;
    }
    last_account_search = new_text;
    const matching = selected_resource.accounts.filter(account => account.pass_part?.includes(new_text) || account.human_readable?.includes(new_text));
    const shouldShowNew = new_text && !matching.some(x => x.human_readable?.toLowerCase() === new_text.toLowerCase());
    const matchingDiv = $("#matching-accounts");
    matchingDiv.html('');

    let increases = 0;
    const max_lines = 4;
    let last_height = matchingDiv.height();
    $("#matching-accounts-extender").hide();
    if (shouldShowNew) {
        const element = $.parseHTML("<div title='Создать новый аккаунт' class='resource-found new-resource'><span class='new-resource-label'><img height='15' width='15' src='/static/img/create.png'/></span>" + new_text + "</div>");
        matchingDiv.append(element);
    }
    for (const match of matching) {
        const element = $.parseHTML("<div class='resource-found" + ((match.human_readable == null) ? " default-account" : "") +  "'>" + (match.human_readable ?? default_account_name) + "</div>");
        matchingDiv.append(element);
        if (last_height != matchingDiv.height()) {
            ++increases;
            last_height = matchingDiv.height();
            if (increases == max_lines) {

                $("#matching-accounts-extender").show();
                if (!unlimited) {
                    $("#matching-accounts-extender").text('▼');
                    element[0].remove();
                    break;
                } else {
                    $("#matching-accounts-extender").text('▲');
                }
            }
        }
    }
}

function searchResources(unlimited = false) {
    const new_text = $("#resource-name").val();
    if (new_text == last_search && !unlimited) {
        return;
    }
    last_search = new_text;
    const matching = all_resources.filter(resource => resource.name.includes(new_text) || resource.comment.includes(new_text));
    const shouldShowNew = new_text && !matching.some(x => x.name.toLowerCase() === new_text.toLowerCase());
    const matchingDiv = $("#matching-resources");
    matchingDiv.html('');

    let increases = 0;
    const max_lines = 4;
    let last_height = matchingDiv.height();
    $("#matching-resources-extender").hide();
    if (shouldShowNew) {
        const element = $.parseHTML("<div title='Создать новый ресурс' class='resource-found new-resource'><span class='new-resource-label'><img height='15' width='15' src='/static/img/create.png'/></span>" + new_text + "</div>");
        matchingDiv.append(element);
    }
    for (const match of matching) {
        if (match.name == '') {
            match.name = '&nbsp;';
        }
        const element = $.parseHTML("<div class='resource-found'>" + match.name + "</div>");
        matchingDiv.append(element);
        if (last_height != matchingDiv.height()) {
            ++increases;
            last_height = matchingDiv.height();
            if (increases == max_lines) {

                $("#matching-resources-extender").show();
                if (!unlimited) {
                    $("#matching-resources-extender").text('▼');
                    element[0].remove();
                    break;
                } else {
                    $("#matching-resources-extender").text('▲');
                }
            }
        }
    }
}
function reloadAccount() {
    $("#selected-account").text(selected_account.human_readable ?? default_account_name);
    const isNew = selected_account.id === null;
    if (isNew) {
        $("#selected-account-new").show();
    } else {
        $("#selected-account-new").hide();
    }
    unsaved_account = structuredClone(selected_account);
    setHtmlParamsFromSelection();
    recalcUnsavedParams();
}
function reloadResource() {
    $("#selected-resource").text(selected_resource.name);
    const isNew = selected_resource.id === null;
    if (isNew) {
        $("#selected-resource-new").show();
    } else {
        $("#selected-resource-new").hide();
    }
    $("#resource-url").val(selected_resource.url);
    $("#resource-a").attr('href', selected_resource.url);
    $("#resource-a").text(selected_resource.url);
    unsaved_resource = structuredClone(selected_resource);

}

function onAccountSelected(account, isDefault, isNew) {
    let theaccount = undefined;
    if (!isDefault && !isNew) {
        theaccount = selected_resource.accounts.filter(a => a.human_readable === account)[0];
    }
    if (isDefault) {
        theaccount = selected_resource.accounts.filter(a => a.human_readable == null)[0];
    }
    if (theaccount === undefined && !isNew) {
        window.alert("WTF?!");
        return;
    }
    if (isNew) {
        theaccount = makeNewAccount(account);
    }
    selected_account = theaccount;
    if ($("#account-foldable")[0].classList.contains("unfolded")) {
        $("#account-foldable .form-label").click();
    }
    reloadAccount();
}

function onResourceSelected(resource, isNew) {
    let theresource = all_resources.filter(r => r.name === resource)[0];
    if (theresource === undefined && !isNew) {
        window.alert("WTF?!");
        return;
    }
    if (isNew) {
        theresource = makeNewResource(resource);
    }
    selected_resource = theresource;
    last_account_search = undefined;
    selected_account = undefined;
    $("#when-resource-selected").slideUp("fast", complete = () => {
        reloadResource();
        searchAccounts();
        if (selected_resource.accounts.length == 1) {
            $("#matching-accounts .resource-found").click();
        }
        $("#when-resource-selected").slideDown("fast");
        $("#resource-foldable .form-label").click();
        $("#resource-a").show();
        $("#resource-url").hide();
    });
}

function recalcUnsavedParams() {
    if (JSON.stringify(unsaved_resource) !== JSON.stringify(selected_resource) ||
    JSON.stringify(unsaved_account) !== JSON.stringify(selected_account)) {
        $("#selected-params-changed").show();
    } else {
        $("#selected-params-changed").hide();
    }
}

function onParamsChangeInHtml() {
    unsaved_account.revision = $("#revision-input").val();
    unsaved_resource.length = parseInt($("#length-input").val());
    unsaved_resource.letters = !!$("#letters-input").prop("checked");
    unsaved_resource.digits = !!$("#digits-input").prop("checked");
    unsaved_resource.symbols = !!$("#symbols-input").prop("checked");
    unsaved_resource.underscore = !!$("#underscore-input").prop("checked");
    recalcUnsavedParams();
}

function setHtmlParamsFromSelection() {

    $("#revision-input").val(selected_account.revision);
    $("#length-input").val(selected_resource.length);
    $("#letters-input").prop("checked", selected_resource.letters ? "checked" : "");
    $("#digits-input").prop("checked", selected_resource.digits ? "checked" : "");
    $("#symbols-input").prop("checked", selected_resource.symbols ? "checked" : "");
    $("#underscore-input").prop("checked", selected_resource.underscore ? "checked" : "");
    recalcUnsavedParams();
}

$(function () {
    $(".gen-input").change(() => onParamsChangeInHtml());
    $(".gen-input").keyup(() => onParamsChangeInHtml());
    $("#resource-name").keyup(() => searchResources());
    $("#resource-name").change(() => searchResources());
    $("#account-name").keyup(() => searchAccounts());
    $("#account-name").change(() => searchAccounts());
    $("#matching-accounts-extender").click(() => {
        last_search = undefined;
        searchAccounts($("#matching-accounts-extender").text() == '▼');
    });
    $("#matching-resources").on('click', ".resource-found", function () {
        // window.alert($(this).text());
        onResourceSelected($(this).text(), $(this)[0].classList.contains('new-resource'));
    });
    $("#matching-accounts").on('click', ".resource-found", function () {
        // window.alert($(this).text());
        onAccountSelected($(this).text(), $(this)[0].classList.contains('default-account'), $(this)[0].classList.contains('new-resource'));
    });
    $("#matching-resources-extender").click(() => {
        last_search = undefined;
        searchResources($("#matching-resources-extender").text() == '▼');
    });
    $(".foldable .form-label").click(function () {
        const parent = $(this).parent();
        const isFolded = parent[0].classList.contains("folded");
        if (isFolded) {
            $("div.foldee", parent).slideDown("fast");
            $(parent).addClass("unfolded");
            $(parent).removeClass("folded");
        } else {
            $("div.foldee", parent).slideUp("fast");
            $(parent).addClass("folded");
            $(parent).removeClass("unfolded");
        }

    });
    $("#resource-url").on('keypress', function (ev) {
        if (ev.key === "Enter") {
            $("#url-edit").click();
        }
    });
    $("#url-edit").click(function () {
        if ($("#resource-a").is(":visible")) {
            $("#resource-a").hide();
            $("#resource-url").val($("#resource-a").attr('href'));
            $("#resource-url").show();
        } else {
            let url = $("#resource-url").val();
            if (!url.includes('://')) {
                url = 'https://' + url;
            }
            $("#resource-a").attr('href', url);
            $("#resource-a").text(url);
            $("#resource-a").show();
            $("#resource-url").hide();

        }
    });
    load_resources();
});


function snackbar(text) {
    // Get the snackbar DIV
    let x = document.getElementById("snackbar");
    x.className = x.className.replace("show", "");
    const key = Math.random();
    x.snack_id = key;

    setTimeout(function () {
        x.innerText = text;
        // Add the "show" class to DIV
        x.className = "show";
    }, 10);


    // After 3 seconds, remove the show class from DIV
    setTimeout(function () {
        if (x.snack_id == key) {
            x.className = x.className.replace("show", "");
        }
    }, 3000);
}

function resetresource() {
    $("#resource-input").val("");
    return true;
}

function resetlength() {
    $("#length-input").val("12");
    return true;
}

function resetrev() {
    $("#revision-input").val("0");
    return true;
}

function resetmaster() {
    $("#master-input").val("");
    return true;
}

function resetlimits() {
    $("input[type=checkbox]").prop("checked", "checked");

    return true;
}

function resetall() {
    $("div.res").slideUp(300);
    $("button.reset").click();
    stopCleanup();
}

function nextChar(c) {
    return String.fromCharCode(c.charCodeAt(0) + 1);
}

function sha1(s) {
    js = new jsSHA("SHA-1", "BYTES");
    js.update(s);
    rv = js.getHash("BYTES");

    return rv;
}

function sha1hex(s) {
    js = new jsSHA("SHA-1", "BYTES");
    js.update(s);
    rv = js.getHash("HEX");

    return rv;
}

function sha512(s) {
    js = new jsSHA("SHA-512", "BYTES");
    js.update(s);
    rv = js.getHash("BYTES");

    return rv;
}

function sha256(s) {
    js = new jsSHA("SHA-256", "BYTES");
    js.update(s);
    rv = js.getHash("BYTES");

    return rv;
}

function base64_encode(data) {	// Encodes data with MIME base64
    //
    // +   original by: Tyler Akins (http://rumkin.com)
    // +   improved by: Bayron Guevara

    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var o1, o2, o3, h1, h2, h3, h4, bits, i = 0, enc = '';

    do { // pack three octets into four hexets
        o1 = data.charCodeAt(i++);
        o2 = data.charCodeAt(i++);
        o3 = data.charCodeAt(i++);

        bits = o1 << 16 | o2 << 8 | o3;

        h1 = bits >> 18 & 0x3f;
        h2 = bits >> 12 & 0x3f;
        h3 = bits >> 6 & 0x3f;
        h4 = bits & 0x3f;

        // use hexets to index into b64, and append result to encoded string
        enc += b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
    } while (i < data.length);

    switch (data.length % 3) {
        case 1:
            enc = enc.slice(0, -2) + '==';
            break;
        case 2:
            enc = enc.slice(0, -1) + '=';
            break;
    }

    return enc;
}

String.prototype.replaceAt = function (index, character) {
    character = character + "";
    return this.substr(0, index) + character + this.substr(index + character.length);
}

function generate(resource, length, revision, master, letters, digits, symbols, underscore) {
    salt = "The very special salt for passwords that will be generated by gurux13 special super puper crypto soft";
    if (revision == 0)
        revision = "";
    pass = salt + revision + master + salt + resource + length;
    allowedSymbols = "";
    c = '0';
    if (digits) {

        for (c = '0'; c <= '9'; c = nextChar(c))
            allowedSymbols += c;
    }
    if (letters) {

        for (c = 'a'; c <= 'z'; c = nextChar(c)) {
            allowedSymbols += c;
            allowedSymbols += c.toUpperCase();
        }
    }
    if (underscore)
        allowedSymbols += "_";
    symbols_string = "-+_=!@#$%^&*(),./:;";
    if (symbols) {
        allowedSymbols += symbols_string;
    }
    if (allowedSymbols == "" || length <= 0)
        return "-- invalid settings --";

    for (i = 0; i < 20; i = i + 1) {
        pass += sha1(pass);
    }
    if (!letters) {
        pass = sha512(pass);
    } else {
        pass = sha256(pass);
    }
    pass_b64 = base64_encode(pass);
    pass_final = "";

    for (var i in pass_b64) {
        ch = pass_b64[i];
        if (pass_final.length >= length)
            break;
        if (allowedSymbols.indexOf(ch) != -1)
            pass_final += ch;
        else if (underscore && c == '+') {
            pass_final += '_';
        }
    }
    info_data = sha256(pass_final);
    idx = 0;
    while (pass_final.length < length) {
        pass_final += allowedSymbols[pass.charCodeAt(pass.length - idx - 1) % allowedSymbols.length];
        ++idx;
    }
    digit_pos = info_data.charCodeAt(0) % length;
    digit = info_data.charCodeAt(1) % 10
    if (digits)
        pass_final = pass_final.replaceAt(digit_pos, digit);
    symbol_pos = info_data.charCodeAt(2) % length;
    idx = 3;
    while (symbol_pos == digit_pos && idx < 32) {
        symbol_pos = info_data.charCodeAt(idx) % length;
        ++idx;
    }
    symbol_idx = info_data.charCodeAt(3) % symbols_string.length;
    symbol = symbols_string[symbol_idx];
    if (symbols || symbol == '_' && underscore) {
        pass_final = pass_final.replaceAt(symbol_pos, symbol);
    }
    x = "";
    for (i = 0; i < info_data.length; ++i) {
        x += info_data.charCodeAt(i) + " ";
    }
    console.warn(x);
    return pass_final;
    /*



                int symbol_pos = info_data [2] % length;
                idx = 3;
                while (symbol_pos == digit_pos && idx < 32) {
                    symbol_pos = info_data [idx] % length;
                    ++idx;
                }
                int symbol_idx = info_data [3] % symbols.Length;
                if (limits.Symbols || (symbols [symbol_idx] == '_' && limits.Underscore))
                    pass_final [symbol_pos] = symbols [symbol_idx];
                return pass_final.ToString ();
    */
}

let remaining = 0;

function stopCleanup() {
    window.clearInterval(resetTimeout);
    resetTimeout = null;
}

function cleanup() {
    resetall();
    update();

}

function cleanupTick() {
    --remaining;
    if (remaining <= 0) {
        cleanup();
    } else {
        $("#time-remaining").html(remaining + "s");

    }
}

function enqueueCleanup() {
    if (resetTimeout) {
        window.clearTimeout(resetTimeout);
    }
    remaining = 61;
    cleanupTick();
    resetTimeout = window.setInterval(cleanupTick, 1000);
}

function postponeCleanup() {
    if (resetTimeout) {
        window.clearInterval(resetTimeout);
        enqueueCleanup();
    }
}


function generate_click() {
    enqueueCleanup();
    resource = $("#resource-input").val();
    length = $("#length-input").val();
    revision = $("#revision-input").val();

    letters = $("#letters-input").prop("checked") ? true : false;
    digits = $("#digits-input").prop("checked") ? true : false;
    symbols = $("#symbols-input").prop("checked") ? true : false;
    underscore = $("#underscore-input").prop("checked") ? true : false;
    master = $("#master-input").val();
    pass = generate(resource, length, revision, master, letters, digits, symbols, underscore);
    $("#result").text(pass);
    $("#master-sha").text(sha1hex(master).substr(0, 4).toUpperCase());
    $("div.res").slideDown(300);
    $.ajax("remote.php", {
        method: "post",
        data: {
            resource: resource,
            length: length,
            revision: revision,
            letters: letters,
            digits: digits,
            symbols: symbols,
            underscore: underscore
        },
        complete: function () {
            update();
        }
    });

}

known_resources = new Array();

function closeResList() {
    $("#resources-list").hide();
    $("#cover").hide();
}

function update() {
    $.ajax("remote.php?all=1", {
        complete: function (data) {
            text = data.responseText;
            obj = JSON.parse(text);
            if (obj.Status == "OK") {
                $("#resources").html("");
                $("#resources-table").html("");

                for (var i = 0; i < obj.all.length; i++) {
                    item = obj.all[i];
                    known_resources[item.resource] = item;

                    $("#resources").append("<option value='" + item.resource + "'>");
                    $("#resources-table").append("<tr><td><a href='#' class='res'>" + item.resource + "</a></td><td><button type='button' class='rm-resource'>X</button></td></tr>");
                }
                $("a.res").click(function () {
                    $("#resource-input").val($(this).text());
                    $("#resource-input").trigger("input");
                    closeResList();
                });
                $(".rm-resource").click(function () {
                    resource = $("a", $(this).parent().parent()).text();
                    $.ajax("remote.php",
                        {
                            method: "post",
                            data: {
                                resource: resource,
                                rm: true
                            },
                            complete: function () {
                                update();
                            }
                        }
                    );
                });

                if ((obj.resource) !== undefined)
                    setfields(obj, true);
            }


        }
    });
}

function setfields(variant, change_resource) {
    if (change_resource)
        $("#resource-input").val(variant.resource);
    $("#length-input").val(variant.length);
    $("#revision-input").val(variant.revision);

    $("#letters-input").prop("checked", variant.letters ? "checked" : "");
    $("#digits-input").prop("checked", variant.digits ? "checked" : "");
    $("#symbols-input").prop("checked", variant.symbols ? "checked" : "");
    $("#underscore-input").prop("checked", variant.underscore ? "checked" : "");

}

let resetTimeout = null;

$(document).ready(function () {
    return;
    resetall();
    update();
    $("#resource-input").bind('input', function () {
        name = $("#resource-input").val();
        if ((known_resources[name] !== undefined)) {
            setfields(known_resources[name], false);
        }
    });
    $("span.cb").click(function () {

        $(this).prev("input").click();
        return true;
    })
    $("#res-control").click(function () {
        $("#resources-list").toggle();
        $("#cover").show();
    });
    $("#cover").click(function () {
        closeResList();
    });
    $(".gen-input").keypress(function (event) {
        postponeCleanup();
        if (event.charCode == 13) {
            generate_click();
        }
    });
    $(".gen-input").change(function () {
        postponeCleanup();

    });
    $(".reset").click(function () {
        postponeCleanup();
    });

});
