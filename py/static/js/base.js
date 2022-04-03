async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

async function hash_password(pwd) {
    return await sha256(pwd + "0fba614860ead3da8537e7a3b8ed4f2c");
}

function error(explanation) {
    console.error(explanation);
}

$(() => {
    $(".a-nav").each(function () {
        if ($(this).attr("href") == window.location.pathname) {
            $(this).addClass("current-link");
        }
    });
    $("#submit-with-pw").click(async function () {
        const pw = $("#user_password").val();
        if ($("#user_password_2")) {
            if ($("#user_password_2").val() != pw) {
                error("Пароли не совпадают!");
                return;
            }
        }
        $("#user_password").val('');
        $("#user_password_2").val('');
        $("#user_pass_hash").val(await hash_password(pw));
        $(this).parent().submit();
    });
});

