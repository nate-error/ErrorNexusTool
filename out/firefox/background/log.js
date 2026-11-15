// Logging (background -> content script of the given tab)
// level: info | found | notfound | error | meta | warn | bad
function sendToTab(tabId, message) {
    try {
        const p = browserAPI.tabs.sendMessage(tabId, message);
        
        if (p && p.catch)
            p.catch(() => {});
    } catch (e) {
        // tab closed / content script not there
    }
}

function sendLog(tabId, text, level = "info", href = null) {
    sendToTab(tabId, { type: "log", text, level, href });
}

function logFailure(tabId, kind, url, status) {
    if (status === 404) {
        sendLog(tabId, `${kind} not found: ${url} (status 404)`, "notfound");
    } else {
        sendLog(tabId, `${kind} unavailable: ${url} (status ${status})`, "warn");
    }
}
