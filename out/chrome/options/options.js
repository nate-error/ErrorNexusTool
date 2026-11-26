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
    $("extensions").value = (Array.isArray(extensions) ? extensions : await loadBundledExtensions()).join("\n");

    // delay between requests
    const { requestDelay } = await storageGet("local", { requestDelay: DEFAULT_DELAY_MS });
    $("delay").value = requestDelay;

    // shortcuts
    const { shortcuts } = await storageGet("sync", { shortcuts: {} });
    let combos = { ...DEFAULT_SHORTCUTS, ...shortcuts };

    function renderShortcuts() {
        const box = $("shortcutList");
        box.replaceChildren();
        for (const [id, def] of Object.entries(SHORTCUT_ACTIONS)) {
            const row = document.createElement("div");
            row.className = "sc-row";
            const label = document.createElement("span");
            label.textContent = def.label;
            const btn = document.createElement("button");
            btn.className = "kbd";
            btn.textContent = prettyCombo(combos[id]);
            btn.addEventListener("click", () => record(id, btn));
            row.append(label, btn);
            box.append(row);
        }
    }

    function record(id, btn) {
        btn.textContent = "Press keys\u2026";
        const finish = () => {
            window.removeEventListener("keydown", onKey, true);
            renderShortcuts();
        };
        const onKey = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "Escape") return finish();
            const combo = comboFromEvent(e);
            if (!combo) return; // modifier only: keep waiting
            const clash = Object.keys(combos).find((k) => k !== id && combos[k] === combo);
            if (clash) flash($("statusShortcuts"), `Already used by "${SHORTCUT_ACTIONS[clash].label}"`);
            else combos[id] = combo;
            finish();
        };
        window.addEventListener("keydown", onKey, true);
    }
    renderShortcuts();

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

    $("saveShortcuts").addEventListener("click", async () => {
        await storageSet("sync", { shortcuts: combos });
        flash($("statusShortcuts"), "Shortcuts saved!");
    });

    // reset handling
    $("resetPanel").addEventListener("click", async () => {
        await storageRemove("local", ["galleryState", "consoleState"]);
        flash($("statusPanel"), "Panels reset!");
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

    $("resetShortcuts").addEventListener("click", async () => {
        await storageRemove("sync", "shortcuts");
        combos = { ...DEFAULT_SHORTCUTS };
        renderShortcuts();
        flash($("statusShortcuts"), "Reset to default!");
    });
});