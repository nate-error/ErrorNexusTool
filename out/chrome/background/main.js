browserAPI.tabs.onRemoved.addListener((tabId) => {
    const scan = activeScans.get(tabId);
    if (scan) {
        scan.cancelled = true;
        activeScans.delete(tabId);
    }
});

// First install: no sites are allowed by default, so open the options page
browserAPI.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install")
        browserAPI.runtime.openOptionsPage();
});

// Messages from the content script
browserAPI.runtime.onMessage.addListener((msg, sender) => {
    if (msg.type === "openOptions") {
        browserAPI.runtime.openOptionsPage();
        return;
    }

    if (msg.type === "imageNames" && sender.tab) {
        const { id, url } = sender.tab;
        const origin = new URL(url).origin + "/*";

        permissionsContains([origin]).then((ok) => {
            if (ok)
                scanTab(id, url, msg.data);
        });
    }
});
