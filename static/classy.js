// Hook in tiny nav toggle's orphaned checkboxes
document.addEventListener("DOMContentLoaded", () => {
    let source = document.querySelector("#tiny-page-nav-toggle"),
        targets = [...document.querySelectorAll(".tiny-page-nav-target")];
    
    source.addEventListener("change", (event) => {
        for (let target of targets) target.checked = event.target.checked;
    });
});

// Hook in table of contents smooth scroll behaviour
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById(document.location.hash.substring(1))?.scrollIntoView({behavior: "smooth"});
    window.addEventListener("hashchange", () => 
        document.getElementById(document.location.hash.substring(1))?.scrollIntoView({behavior: "smooth"}));
    
    let toc = document.querySelector(".content-toc"),
        links = [
            ...(document.querySelector(".content-nav")?.querySelectorAll("a") ?? []),
            ...(toc?.querySelectorAll("a") ?? [])
        ];
    
    for (let a of links) {
        let target = a.getAttribute("href");
        
        a.addEventListener("click", (e) => {
            e.preventDefault();
            toc?.removeAttribute("open");
            document.getElementById(target.substring(1))?.scrollIntoView({behavior: "smooth"});
            window.history.pushState(null, null, target);
        });
    }
});