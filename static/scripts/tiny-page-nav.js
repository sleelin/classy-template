document.addEventListener("DOMContentLoaded", () => {
    let source = document.querySelector("#tiny-page-nav-toggle"),
        targets = [...document.querySelectorAll(".tiny-page-nav-target")];
    
    source.addEventListener("change", (event) => {
        for (let target of targets) target.checked = event.target.checked;
    });
});