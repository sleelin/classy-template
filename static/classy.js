// Hook in tiny nav toggle's orphaned checkboxes
document.addEventListener("DOMContentLoaded", () => {
    const source = document.querySelector("#tiny-page-nav-toggle");
    const targets = [...document.querySelectorAll(".tiny-page-nav-target")];
    
    source.addEventListener("change", (event) => {
        for (let target of targets) target.checked = event.target.checked;
    });
});

// Hook in table of contents smooth scroll behaviour
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById(document.location.hash.substring(1))?.scrollIntoView({behavior: "smooth"});
    window.addEventListener("hashchange", () => 
        document.getElementById(document.location.hash.substring(1))?.scrollIntoView({behavior: "smooth"}));
    
    const toc = document.querySelector(".toc-tiny details");
    const links = document.querySelectorAll(".toc a");
    
    for (let a of links) {
        const target = a.getAttribute("href");
        
        a.addEventListener("click", (e) => {
            e.preventDefault();
            toc?.removeAttribute("open");
            document.getElementById(target.substring(1))?.scrollIntoView({behavior: "smooth"});
            window.history.pushState(null, null, target);
        });
    }
});