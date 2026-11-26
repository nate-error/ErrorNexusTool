// registers the content scripts only on sites the user allowed and granted permission for
const CONTENT_FILES = [
    "shared/browser.js",
    "content/style.js",
    "content/ui.js",
    "content/console.js",
    "content/gallery.js",
    // playground: pure logic first, then the pieces, then the shell that assembles them
    "content/playground/pixels.js",
    "content/playground/bytes.js",
    "content/playground/controls.js",
    "content/playground/stage.js",
    "content/playground/tab-adjust.js",
    "content/playground/tab-bits.js",
    "content/playground/tab-colors.js",
    "content/playground/tab-hex.js",
    "content/playground/tab-info.js",
    "content/playground/tab-draw.js",
    "content/playground/playground.js",
    "content/shortcuts.js",
    "content/main.js",
];
let firefoxHandle = null;

async function doSync() {
    const { allowedSites } = await storageGet("sync", { allowedSites: DEFAULT_ALLOWED_SITES });

    // only sites the user actually granted permission for
    const granted = [];
    for (const m of allowedSites.map(toMatchPattern).filter(Boolean)) {
        if (await permissionsContains([m]))
            granted.push(m);
    }

    if (IS_FIREFOX) {
        if (firefoxHandle) {
            await firefoxHandle.unregister();
            firefoxHandle = null;
        }
        if (granted.length) {
            firefoxHandle = await browser.contentScripts.register({
                matches: granted,
                js: CONTENT_FILES.map((file) => ({ file })),
                runAt: "document_idle",
            });
        }
    } else {
        try {
            await chrome.scripting.unregisterContentScripts({ ids: ["nexus"] });
        } catch (e) {
            // nothing registered yet
        }
        if (granted.length)
            await chrome.scripting.registerContentScripts([
                { id: "nexus", matches: granted, js: CONTENT_FILES, runAt: "document_idle", persistAcrossSessions: true },
            ]);
    }
}

// run one sync at a time, so overlapping events can't register the scripts twice
let syncChain = Promise.resolve();
function syncContentScripts() {
    syncChain = syncChain.then(doSync).catch((e) => console.error("content script sync failed", e));
    return syncChain;
}

syncContentScripts();
browserAPI.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.allowedSites) syncContentScripts();
});

browserAPI.permissions.onAdded.addListener(syncContentScripts);
browserAPI.permissions.onRemoved.addListener(syncContentScripts);