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
    // let resourceName = all_resources[0]?.name;
    // if (userinfo.last_resource_id != null) {
    //     resourceName = all_resources.filter(x => x.id == userinfo.last_resource_id)[0]?.name;
    // }
    // $("#resource-name").val(resourceName ?? "");
    $("#resource-name").val("");
    $("#account-name").val("");
    // last_search = undefined;
    if ($("#resource-foldable .foldee").is(":visible")) {
        last_search = undefined;
        searchResources();
    }
    // searchResources();
    if (unsaved_resource?.id) {
        selected_resource = all_resources.filter(x => x.id === unsaved_resource.id)[0];
        if (selected_resource) {
            reloadResource();
        }
    }
    if (unsaved_account?.id && selected_resource) {
        selected_account = selected_resource.accounts.filter(x => x.id === unsaved_account.id)[0];
        if (selected_account) {
            reloadAccount();
        }
    }
}

function processData(data) {
    if (!data.resources || !data.userinfo) {
        window.alert("Bad data received!");
        return;
    }
    all_resources = data.resources;
    userinfo = data.userinfo;
    if (data.this_resource_id != null) {
        unsaved_resource.id = data.this_resource_id;
    }
    if (data.this_account_id != null) {
        unsaved_account.id = data.this_account_id;
    }
    onDataLoaded();
    last_search = null;
    searchResources();
    last_account_search = null;
    searchAccounts();
}

function load_resources() {
    $.ajax({
        url: 'batchresources', success: processData
    });
}

function makeNewAccount(name) {
    return {
        "id": null, "pass_part": null, "human_readable": name, "revision": "0", "last_hash": null, "last_used_on": null,
    }
}

function makeNewResource(name) {
    return {
        "name": name,
        "id": null,
        "last_account_id": null,
        "accounts": [makeNewAccount(null),],
        "url": "https://" + name,
        "comment": "",
        "length": 12,
        "letters": true,
        "digits": true,
        "symbols": true,
        "underscore": true,
    }
}

function ensureResourceContainsDefaultAccount(resource) {
    if (resource.accounts.find(x => x.human_readable == null)) {
        return;
    }
    resource.accounts.push(makeNewAccount(null));
}

function searchAccounts(unlimited = false) {
    if (!selected_resource) {
        return;
    }
    const new_text = $("#account-name").val();
    if (new_text == last_account_search && !unlimited) {
        return;
    }
    last_account_search = new_text;
    ensureResourceContainsDefaultAccount(selected_resource);
    const matching = selected_resource.accounts.filter(account => account.pass_part?.includes(new_text) || (account.human_readable ?? '').includes(new_text));
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
    const matching = all_resources.filter(resource => resource.name.toLowerCase().includes(new_text.toLowerCase()) || resource.comment?.toLowerCase()?.includes(new_text.toLowerCase()));
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
    $("#selected-account").show();
    $("#selected-params").show();
    $("#hash-account-for").show();
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
    if (selected_resource?.name != null) {
        $("#selected-resource").show();
    }
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
    unsaved_resource.accounts = undefined;
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
    onSelectionChanged();
}

function selectDefaultAccount() {
    if (selected_resource.accounts.length === 1) {
        $("#matching-accounts .resource-found").click();
    } else {
        const account = selected_resource.accounts.find(x => x.human_readable == null);
        if (account != null) {
            onAccountSelected(account.human_readable, account.human_readable == null, false);
        }
    }
}

function onSelectionChanged() {
    if ($("#result").prop('data-pwd') && unsaved_account?.id != null && unsaved_resource?.id != null) {
        generate_click();
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
        $("#resource-url").css('visibility', 'hidden');

        onSelectionChanged();
    });
}

function getParamString(resource, account) {
    const revision = account.revision;
    const length = resource.length;
    const letters = resource.letters ? 'A' : '';
    const digits = resource.digits ? '0' : '';
    const symbols = resource.symbols ? '@' : '';
    const underscore = resource.underscore ? '_' : '';
    let allowed = letters + digits + symbols + underscore;
    if (allowed.length == 0) {
        allowed = '????';
    }
    const paramString = '|' + length + '| #' + revision + ' ' + allowed;
    return paramString;
}

function recalcUnsavedParams() {
    if (getParamString(selected_resource, selected_account) !== getParamString(unsaved_resource, unsaved_account)) {
        $("#selected-params-changed").show();
    } else {
        $("#selected-params-changed").hide();
    }
    $("#selected-params").text(getParamString(unsaved_resource, unsaved_account));
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

async function saveUrl() {
    if (unsaved_resource.id == null) {
        return;
    }
    await withSaveLoader(async() => {
        return $.ajax("newurl", {
            method: "post", data: JSON.stringify({
                resource_id: unsaved_resource.id, url: unsaved_resource.url
            }), dataType: 'json', contentType: "application/json; charset=utf-8", async: true
        });
    });
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
    $("#url-edit").click(async function () {
        if ($("#resource-a").is(":visible")) {
            $("#resource-a").hide();
            $("#resource-url").val($("#resource-a").attr('href'));
            $("#resource-url").css('visibility', 'visible');
        } else {
            let url = $("#resource-url").val();
            if (!url.includes('://')) {
                url = 'https://' + url;
            }
            $("#resource-a").attr('href', url);
            $("#resource-a").text(url);
            $("#resource-a").show();
            $("#resource-url").css('visibility', 'hidden');
            if (unsaved_resource.url != url) {
                unsaved_resource.url = url;
                await saveUrl();
            }
        }
    });
    $("#result-label").click(() => {
        postponeCleanup();
    });
    $("#save-global-sha").click(() => {
        saveSha(true);
    });
    $("#save-local-sha").click(() => {
        saveSha(false);
    });
    $(".gen-input").keypress(function (event) {
        postponeCleanup();
        if (event.charCode == 13) {
            generate_click();
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
    $("#result").prop('data-pwd', '').text('');
    $("button.reset").click();
    resetmaster();
    stopCleanup();
}

let remaining = 0;

function stopCleanup() {
    window.clearInterval(resetTimeout);
    resetTimeout = null;
}

function cleanup(keep) {
    resetall();
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
    if ($("#result").text() == $("#result").prop('data-pwd')) {
        $("#result").text($("#result").prop('data-pwd').replaceAll(/./g, '*'));
    } else {
        $("#result").text($("#result").prop('data-pwd'));
    }
}

async function saveSha(isGlobal) {
    const theSha = $("#master-sha").text();
    if (!theSha) {
        return;
    }
    if (unsaved_resource.id == null || unsaved_account.id == null) {
        return;
    }
    return $.ajax("newsha", {
        method: "post", data: JSON.stringify({
            resource_id: unsaved_resource.id, account_id: unsaved_account.id, sha: theSha, global: isGlobal,
        }), dataType: 'json', contentType: "application/json; charset=utf-8", success: (data) => {
            processData(data);
            setShaColors();
        }, async: true,
    });
}

async function withLoader(func) {
    $("#loader").show();
    await func();
    $("#loader").hide();
}

async function withSaveLoader(func) {
    $("#saving-wait").slideDown();
    try {
        await func();
    } finally {
        $("#saving-wait").slideUp();
    }
}

function setShaColors() {
    const theSha = $("#master-sha").text();
    const expected_sha = selected_account?.last_hash ?? userinfo.last_hash;
    const expected_sha_from_account = selected_account?.last_hash != null;
    if (expected_sha === theSha) {
        $("#master-sha").addClass("sha-correct");
        $("#master-sha").removeClass("sha-incorrect");
        $("#when-sha-error").css('visibility', 'hidden');
    } else {
        $("#master-sha").addClass("sha-incorrect");
        $("#master-sha").removeClass("sha-correct");
        $("#when-sha-error").css('visibility', 'visible');
    }
    $("#hash-from-account").toggle(expected_sha_from_account);
    $("#hash-account-for").text(selected_account?.human_readable ?? DEFAULT_ACCOUNT_NAME);
}

async function generate_click() {
    enqueueCleanup();
    setFold($("#params-foldable"), true);
    resource = unsaved_resource.name;

    length = unsaved_resource.length;
    revision = unsaved_account.revision;

    letters = unsaved_resource.letters;
    digits = unsaved_resource.digits;
    symbols = unsaved_resource.symbols;
    underscore = unsaved_resource.underscore;

    master = $("#master-input").val();
    pass = generate(resource, unsaved_account.pass_part ?? unsaved_account.human_readable, length, revision, master, letters, digits, symbols, underscore);
    $("#result").text(pass.replaceAll(/./g, '*'));
    $("#result").prop('data-pwd', pass);
    const theSha = sha1hex(master).substr(0, 4).toUpperCase();
    $("#master-sha").text(theSha);
    setShaColors();
    $("div.res").slideDown(300);
    await withSaveLoader(() => {
        return $.ajax("generated", {
            method: "post", data: JSON.stringify({
                resource: unsaved_resource, account: unsaved_account,
            }), dataType: 'json', contentType: "application/json; charset=utf-8", success: processData, async: true,
        });
    });

}

known_resources = [];

function closeResList() {
    $("#resources-list").hide();
    $("#cover").hide();
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
    $(".gen-input").keypress(async function (event) {
        postponeCleanup();
        if (event.charCode == 13) {
            await generate_click();
        }
    });
    $(".gen-input").change(function () {
        postponeCleanup();

    });
    $(".reset").click(function () {
        postponeCleanup();
    });

});
