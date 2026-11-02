const browserAPI = typeof browser !== "undefined" ? browser : chrome;
const IS_FIREFOX = typeof browser !== "undefined";

const DEFAULT_ALLOWED_SITES = ["nekoweb.org"];

const storageGet = (area, defaults) =>
    IS_FIREFOX ? browser.storage[area].get(defaults) : new Promise((resolve) => chrome.storage[area].get(defaults, resolve));

const storageSet = (area, items) =>
    IS_FIREFOX ? browser.storage[area].set(items) : new Promise((resolve) => chrome.storage[area].set(items, resolve));

const storageRemove = (area, keys) =>
    IS_FIREFOX ? browser.storage[area].remove(keys) : new Promise((resolve) => chrome.storage[area].remove(keys, resolve));

const $ = (id) => document.getElementById(id);
const toLines = (text) =>
    text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

const normalizeExtensions = (list) => [
    ...new Set(list.map((s) => s.trim().replace(/^\./, "").toLowerCase()).filter(Boolean)),
];

function flash(el, message) {
    el.textContent = message;
    setTimeout(() => {
        el.textContent = "";
    }, 2000);
}

async function loadBundledExtensions() {
    try {
        const res = await fetch(browserAPI.runtime.getURL("extensions.txt"));
        return res.ok ? normalizeExtensions(toLines(await res.text())) : [];
    } catch (e) {
        return [];
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    // allowed domains
    const { allowedSites } = await storageGet("sync", { allowedSites: DEFAULT_ALLOWED_SITES });
    $("sites").value = allowedSites.join("\n");

    // variant extensions: user list if it exists, bundled file otherwise
    const { extensions } = await storageGet("local", { extensions: null });
    $("extensions").value = (Array.isArray(extensions) ? extensions : await loadBundledExtensions()).join(
        "\n",
    );

    $("saveSites").addEventListener("click", async () => {
        await storageSet("sync", { allowedSites: toLines($("sites").value) });
        flash($("statusSites"), "Settings saved!");
    });

    $("saveExtensions").addEventListener("click", async () => {
        const list = normalizeExtensions(toLines($("extensions").value));
        await storageSet("local", { extensions: list });
        $("extensions").value = list.join("\n");
        flash($("statusExtensions"), "Extensions saved!");
    });

    $("resetPanel").addEventListener("click", async () => {
        await storageRemove("local", "panelState");
        flash($("statusPanel"), "Panel reset!");
    });

    $("resetExtensions").addEventListener("click", async () => {
        await storageRemove("local", "extensions");
        $("extensions").value = (await loadBundledExtensions()).join("\n");
        flash($("statusExtensions"), "Reset to default!");
    });
});