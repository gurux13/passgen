function copyToClipboard(text) {
    input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    input.setSelectionRange(0, 9999);
    document.execCommand('copy');
    document.body.removeChild(input);
}


let all_resources = [];
let userinfo = undefined;
let selected_resource = undefined;
let selected_account = undefined;
let unsaved_account = undefined;
let unsaved_resource = undefined;

let last_account_search = null;
let last_search = undefined;
const DEFAULT_ACCOUNT_NAME = "По умолчанию";


function onDataLoaded() {
    let resourceName = all_resources[0]?.name;
    if (userinfo.last_resource_id != null) {
        resourceName = all_resources.filter(x => x.id == userinfo.last_resource_id)[0]?.name;

    }
    $("#resource-name").val(resourceName ?? "");
    searchResources();
}

function load_resources() {
    $.ajax({
        url: 'batchresources', success: (data) => {
            all_resources = data.resources;
            userinfo = data.userinfo;
            onDataLoaded();
        }
    });
}

function makeNewAccount(name) {
    return {
        "id": null,
        "pass_part": "",
        "human_readable": name,
        "revision": "0"
    }
}

function makeNewResource(name) {
    return {
        "name": name,
        "id": null,
        "default_account_id": null,
        "accounts": [
            makeNewAccount(DEFAULT_ACCOUNT_NAME),
        ],
        "url": "https://" + name,
        "comment": "",
        "length": 12,
        "letters": true,
        "digits": true,
        "symbols": true,
        "underscore": true,
    }
}


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
        const element = $.parseHTML("<div class='resource-found" + ((match.human_readable == null) ? " default-account" : "") + "'>" + (match.human_readable ?? DEFAULT_ACCOUNT_NAME) + "</div>");
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
    $("#selected-account").text(selected_account.human_readable ?? DEFAULT_ACCOUNT_NAME);
    const isNew = selected_account.id === null;
    if (isNew) {
        $("#selected-account-new").show();
        setFold($("#params-foldable"), false);
    } else {
        $("#selected-account-new").hide();
        setFold($("#params-foldable"), true);
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

function selectDefaultAccount() {
    if (selected_resource.accounts.length == 1) {
        $("#matching-accounts .resource-found").click();
    } else {
        const account = selected_resource.accounts.filter(x => x.id == selected_resource.default_account_id)[0];
        if (account != null) {
            onAccountSelected(account.human_readable, account.human_readable == null, false);
        }
    }
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
        selectDefaultAccount();
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
    const revision = $("#revision-input").val();
    const length = parseInt($("#length-input").val());
    const letters = !!$("#letters-input").prop("checked") ? 'A' : '';
    const digits = !!$("#digits-input").prop("checked") ? '0' : '';
    const symbols = !!$("#symbols-input").prop("checked") ? '@' : '';
    const underscore = !!$("#underscore-input").prop("checked") ? '_' : '';
    let allowed = letters + digits + symbols + underscore;
    if (allowed.length == 0) {
        allowed = '????';
    }
    const paramString = '|' + length + '| #' + revision + ' ' + allowed;
    $("#selected-params").text(paramString);
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
    $("#result-label").click(() => {
        postponeCleanup();
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
    $("#result").prop('data-pwd', '').text('');
    $("button.reset").click();
    stopCleanup();
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

let cleanupScheduledAt = undefined;

function cleanupTick() {
    remaining = 60000 - (new Date().getTime() - cleanupScheduledAt);
    if (remaining <= 0) {
        cleanup();
    } else {
        // $("#time-remaining").html(remaining + "s");
        $(".progress").css("right", (100 - remaining / 60000.0 * 100) + "%");
        // progress.value = remaining;
    }
}

let progress = undefined;

function enqueueCleanup() {
    // progress = new CircleProgress('.progress', {
    //     max: 60,
    //     value: 60,
    //     textFormat: 'value',
    // });
    if (resetTimeout) {
        window.clearTimeout(resetTimeout);
    }
    cleanupScheduledAt = new Date().getTime();
    cleanupTick();
    resetTimeout = window.setInterval(cleanupTick, 10);
}

function postponeCleanup() {
    if (resetTimeout) {
        window.clearInterval(resetTimeout);
        enqueueCleanup();
    }
}

function copyResultToClipboard() {
    copyToClipboard($('#result').prop('data-pwd'));
    snackbar("Скопировано в буфер обмена");
    return false;
}

function revealPassword() {
    $("#result").text($("#result").prop('data-pwd'));
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
    $("#result").text(pass.replaceAll(/./g, '*'));
    $("#result").prop('data-pwd', pass);
    const theSha = sha1hex(master).substr(0, 4).toUpperCase();
    $("#master-sha").text(theSha);
    const expected_sha = selected_account.last_hash ?? userinfo.last_hash;
    if (expected_sha === theSha) {
        $("#master-sha").addClass("sha-correct");
        $("#master-sha").removeClass("sha-incorrect");
    } else {
        $("#master-sha").addClass("sha-incorrect");
        $("#master-sha").removeClass("sha-correct");
    }
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
