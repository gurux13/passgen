$(() => {
    $(".a-nav").each(function () {
        if ($(this).attr("href") == window.location.pathname) {
            $(this).addClass("current-link");
        }

    });
});