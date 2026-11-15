(async function init() {
    const { panelState } = await storageGet("local", { panelState: {} });
    const ui = createPanel({ ...DEFAULT_PANEL, ...panelState }, (state) =>
        storageSet("local", { panelState: state }),
    );

    browserAPI.runtime.onMessage.addListener((msg) => {
        if (msg.type === "log")
            ui.addLog(msg);
        if (msg.type === "progress")
            ui.setProgress(msg);
    });

    // The options page clears panelState to reset the panel
    browserAPI.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.panelState && !changes.panelState.newValue)
            ui.reset();
    });

    const html = document.documentElement.innerHTML;
    const matches = [...html.matchAll(/([a-zA-Z0-9_\-]+)\.(png|jpg|gif)/gi)];
    const baseNames = [...new Set(matches.map((m) => m[1]))];

    ui.addLog({ text: "Found image bases: " + JSON.stringify(baseNames) });
    browserAPI.runtime.sendMessage({ type: "imageNames", data: baseNames });
})();
