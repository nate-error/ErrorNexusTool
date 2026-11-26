// Messages: background -> content script of the given tab
//   { type: "log", text, level, href }      free text (warnings, errors, info)
//   { type: "entry", entry }                one result per probed URL (console rows)
//   { type: "image", image }                a found image (gallery cards)
//   { type: "progress", active, done, total }
// level: info | found | notfound | error | meta | warn | bad
function sendToTab(tabId, message) {
    try {
        const p = browserAPI.tabs.sendMessage(tabId, message);
        if (p && p.catch) p.catch(() => {});
    } catch (e) {
        // tab closed / content script not there
    }
}

function sendLog(tabId, text, level = "info", href = null) {
    sendToTab(tabId, { type: "log", text, level, href });
}

// entry = { kind, url, status?, level, contentType?, size?, note? }
function sendEntry(tabId, entry) {
    sendToTab(tabId, { type: "entry", entry });
}

function sendImage(tabId, image) {
    sendToTab(tabId, { type: "image", image });
}

function logFailure(tabId, kind, url, status) {
    sendEntry(tabId, { kind, url, status, level: status === 404 ? "notfound" : "warn" });
}