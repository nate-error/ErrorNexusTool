const browserAPI = typeof browser !== "undefined" ? browser : chrome;

document.addEventListener("DOMContentLoaded", () => {
    browserAPI.storage.sync.get({ allowedSites: ["nekoweb.org", "example.com"] }, (result) => {
        document.getElementById("sites").value = result.allowedSites.join("\n");
    });

    document.getElementById("save").addEventListener("click", () => {
        const rawInput = document.getElementById("sites").value;
        const allowedSites = rawInput.split("\n").map(s => s.trim()).filter(s => s.length > 0);

        browserAPI.storage.sync.set({ allowedSites }, () => {
            const status = document.getElementById("status");
            status.textContent = "Settings saved!";
            setTimeout(() => { status.textContent = ""; }, 2000);
        });
    });
});