// Hook in tiny nav toggle's orphaned checkboxes
document.addEventListener("DOMContentLoaded", () => {
    let source = document.querySelector("#tiny-page-nav-toggle"),
        targets = [...document.querySelectorAll(".tiny-page-nav-target")];
    
    source.addEventListener("change", (event) => {
        for (let target of targets) target.checked = event.target.checked;
    });
});

// Highlight targeted line in source files 
document.addEventListener("DOMContentLoaded", () => {
    let source = document.querySelector("#source > .source"),
        anchorHash = document.location.hash.substring(1),
        lines = (source ? source.getElementsByTagName("li") : false);
    
    if (lines) {
        for (let i = 0, line = 1; i < lines.length; ++i, ++line) {
            let lineId = (lines[i].id = `line${line}`);
            if (lineId === anchorHash) lines[i].classList.add("selected");
        }
    }
});