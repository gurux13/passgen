$(function () {
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
});

function setFold(foldable, folded) {
    const isFolded = foldable[0].classList.contains('folded');
    if (isFolded == folded) {
        return;
    }
    $(".form-label", foldable).click();
}
