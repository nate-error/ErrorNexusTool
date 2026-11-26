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
browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "openOptions") {
        browserAPI.runtime.openOptionsPage();
        return;
    }

    // "Stop" button in the console
    if (msg.type === "cancelScan" && sender.tab) {
        const scan = activeScans.get(sender.tab.id);
        if (scan) {
            scan.cancelled = true;
            activeScans.delete(sender.tab.id);
            reportProgress(scan, false);
        }
        
        return;
    }

    // thumbnails / playground ask for the bytes of a found image
    if (msg.type === "getImage" && sender.tab) {
        fetchImageData(sender.tab.url, msg.url).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
        return true; // async response
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

// Open extension options page
browserAPI.runtime.onMessage.addListener((message) => {
    if (message?.type === "OPEN_OPTIONS") {
        browserAPI.runtime.openOptionsPage();
    }
});