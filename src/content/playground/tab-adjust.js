function tabAdjust(ctx, pane) {
    const controls = ctx.controls;

    const view = controls.addSection(pane, "View");
    controls.addSelect(view, "Channel", "mode", [
        ["normal", "Normal"], ["r", "Red only"], ["g", "Green only"], ["b", "Blue only"],
        ["gr", "Red (gray)"], ["gg", "Green (gray)"], ["gb", "Blue (gray)"], ["ga", "Alpha (gray)"], ["luma", "Luminance (gray)"],
    ]);

    const tone = controls.addSection(pane, "Tone");
    controls.addSlider(tone, "Gamma", "gamma", 0.1, 5, 0.05);
    controls.addSlider(tone, "Light", "bright", -255, 255, 1);
    controls.addSlider(tone, "Contrast", "contrast", -100, 100, 1);

    const color = controls.addSection(pane, "Color");
    controls.addSlider(color, "Saturation %", "saturation", 0, 400, 1);
    controls.addSlider(color, "Hue shift", "hue", 0, 360, 1);

    const cutoff = controls.addSection(pane, "Threshold & invert");
    controls.addCheck(cutoff, "Threshold", "thresholdEnabled");
    controls.addSlider(cutoff, "Level", "threshold", 0, 255, 1);
    controls.addCheck(cutoff, "Invert", "invert");

    pane.append(el("div", "hint", "Click a value (or double click a slider) to reset it. Edits never touch the original file. Big images show a fast low res preview while you drag."));
}