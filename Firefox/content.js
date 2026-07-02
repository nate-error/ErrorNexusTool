const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// =======================
// CREATE FLOATING PANEL
// =======================
(function() {
    function createPanel() {
        let hideNotFound = true;

        const panel = document.createElement("div");
        panel.id = "errorNexusPanel";
        Object.assign(panel.style, {
            position: "fixed",
            bottom: "10px",
            right: "10px",
            width: "350px",
            maxHeight: "300px",
            overflowY: "auto",
            background: "rgba(0,0,0,0.85)",
            color: "white",
            fontSize: "12px",
            padding: "10px",
            borderRadius: "8px",
            zIndex: "999999",
            fontFamily: "monospace"
        });

        const header = document.createElement("div");
        header.innerHTML = "<b>Error Nexus Tools</b><br>Scanning...";
        panel.appendChild(header);
        

        // Hide/show "notfound" button
        const toggleButton = document.createElement("button");
        toggleButton.textContent = "Show Not Found";
        Object.assign(toggleButton.style, {
            position: "fixed", // float above all content
            top: "10px",
            right: "10px",
            zIndex: "1000000", // make sure it's above everything
            fontSize: "12px",
            padding: "4px 8px",
            cursor: "pointer",
            borderRadius: "4px",
            background: "rgba(0,0,0,0.85)",
            color: "white",
            border: "1px solid #555"
        });

        toggleButton.onclick = () => {
            hideNotFound = !hideNotFound;
            toggleButton.textContent = hideNotFound ? "Show Not Found" : "Hide Not Found";

            document.querySelectorAll('[data-level="notfound"]').forEach(el => {
                el.style.display = hideNotFound ? "none" : "block";
            });
        };

        // Append to body
        document.body.appendChild(toggleButton);

        
        // Log container
        const logContainer = document.createElement("div");
        logContainer.style.textAlign = "right";
        logContainer.style.wordBreak = "break-word";
        panel.appendChild(logContainer);

        window.__addNexusLog = function(msgText, level="info", color="#4af", bg="#111") {
            const el = document.createElement("div");
            el.dataset.level = level;

            // styling
            el.style.borderTop = "1px solid #555";
            el.style.marginTop = "4px";
            el.style.paddingTop = "2px";
            el.style.wordBreak = "break-word";
            el.style.fontFamily = "monospace";
            el.style.color = color;
            el.style.background = bg;
            el.style.paddingLeft = "4px"; // optional for readability

            // parse limited HTML manually if you want to allow <a> and <b>
            // for plain text logs, just append a text node
            const parser = new DOMParser();
            const doc = parser.parseFromString(msgText, "text/html");
            
            doc.body.childNodes.forEach(node => {
                if (node.nodeName === "A") {
                    const a = document.createElement("a");
                    a.href = node.href;
                    a.textContent = node.textContent;
                    a.target = "_blank";
                    a.style.color = "#4af";
                    el.appendChild(a);
                } else if (node.nodeName === "B") {
                    const b = document.createElement("b");
                    b.textContent = node.textContent;
                    el.appendChild(b);
                } else {
                    el.appendChild(document.createTextNode(node.textContent));
                }
            });

            if (hideNotFound && el.dataset.level === "notfound") {
                el.style.display = "none";
            }

            document.getElementById("errorNexusPanel").appendChild(el);
            document.getElementById("errorNexusPanel").scrollTop = document.getElementById("errorNexusPanel").scrollHeight;
        };

        document.body.appendChild(panel);
    }

    if (document.body) createPanel();
    else document.addEventListener("DOMContentLoaded", createPanel);
})();


// =======================
// SCAN HTML FOR IMAGE BASE NAMES
// =======================
(function() {
    let html = document.documentElement.innerHTML;
    let matches = [...html.matchAll(/([a-zA-Z0-9_\-\/]+)\.(png|jpg|gif)/gi)];
    let baseNames = [...new Set(matches.map(m => m[1]))];

    window.__addNexusLog("Found image bases: " + JSON.stringify(baseNames));

    // Send base names to background script
    browserAPI.runtime.sendMessage({
        type: "imageNames",
        data: baseNames
    });
})();

// =======================
// RECEIVE LOG MESSAGES FROM BACKGROUND
// =======================
browserAPI.runtime.onMessage.addListener((msg) => {
    if (msg.type === "log") {
        window.__addNexusLog(msg.msg, msg.level, msg.color, msg.bg);
    }
});