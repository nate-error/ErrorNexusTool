const $ = (id) => document.getElementById(id);

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

    // delay between requests
    const { requestDelay } = await storageGet("local", { requestDelay: DEFAULT_DELAY_MS });
    $("delay").value = requestDelay;

    // save handling
    $("saveSites").addEventListener("click", async () => {
        const sites = toLines($("sites").value);
        const origins = sites.map(toMatchPattern).filter(Boolean);

        // grant access to what's in the list (must be the first await after the click)
        const ok = origins.length ? await permissionsRequest(origins) : true;

        // revoke access to sites that were in the saved list but were removed
        const { allowedSites: previous } = await storageGet("sync", { allowedSites: DEFAULT_ALLOWED_SITES });
        const removed = previous.map(toMatchPattern).filter((o) => o && !origins.includes(o));
        if (removed.length) await permissionsRemove(removed);

        await storageSet("sync", { allowedSites: sites });
        flash($("statusSites"), ok ? "Settings saved!" : "Saved, but access was denied");
    });
    
    $("saveDelay").addEventListener("click", async () => {
        const n = Math.round(Number($("delay").value));
        const value = Number.isFinite(n) && n >= 0 ? Math.min(n, MAX_DELAY_MS) : DEFAULT_DELAY_MS;
        await storageSet("local", { requestDelay: value });
        $("delay").value = value;
        flash($("statusDelay"), "Delay saved!");
    });

    $("saveExtensions").addEventListener("click", async () => {
        const list = normalizeExtensions(toLines($("extensions").value));
        await storageSet("local", { extensions: list });
        $("extensions").value = list.join("\n");
        flash($("statusExtensions"), "Extensions saved!");
    });

    // reset handling
    $("resetPanel").addEventListener("click", async () => {
        await storageRemove("local", "panelState");
        flash($("statusPanel"), "Panel reset!");
    });

    $("resetExtensions").addEventListener("click", async () => {
        await storageRemove("local", "extensions");
        $("extensions").value = (await loadBundledExtensions()).join("\n");
        flash($("statusExtensions"), "Reset to default!");
    });

        $("resetDelay").addEventListener("click", async () => {
        await storageRemove("local", "requestDelay");
        $("delay").value = DEFAULT_DELAY_MS;
        flash($("statusDelay"), "Reset to default!");
    });

});