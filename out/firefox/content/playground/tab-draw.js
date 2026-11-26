// Simple annotations (pen / line / rect / ellipse). Strokes live in ctx.strokes
function tabDraw(ctx, pane) {
    const controls = ctx.controls;
    const TOOLS = [["pan", "Pan"], ["pen", "Pen"], ["line", "Line"], ["rect", "Rect"], ["ellipse", "Ellipse"]];

    const toolSection = controls.addSection(pane, "Tool");
    const toolRow = el("div", "row2 seg");
    const buttons = {};

    for (const [id, label] of TOOLS) {
        buttons[id] = el("button", "", label);
        buttons[id].addEventListener("click", () => ctx.setTool(id));
        toolRow.append(buttons[id]);
    }

    toolSection.append(toolRow);

    ctx.onTool = (tool) => {
        for (const id in buttons)
            buttons[id].classList.toggle("on", id === tool);
    };

    const styleSection = controls.addSection(pane, "Style");
    const colorInput = el("input");
    colorInput.type = "color";
    colorInput.value = ctx.draw.color;
    colorInput.addEventListener("input", () => { ctx.draw.color = colorInput.value; });

    const colorRow = el("div", "row2");
    colorRow.append(el("span", "", "Color"), colorInput);
    styleSection.append(colorRow);

    controls.addRange(styleSection, "Width (px)", 1, 30, 1, {
        get: () => ctx.draw.width,
        set: (value) => { ctx.draw.width = value; },
        def: 2,
    })();

    const actions = controls.addSection(pane, "Actions");
    const actionRow = el("div", "row2");
    const undoButton = el("button", "", "Undo");
    const clearButton = el("button", "", "Clear all");
    undoButton.addEventListener("click", () => ctx.undoStroke());
    clearButton.addEventListener("click", () => { ctx.strokes = []; ctx.redrawAnn(); });
    actionRow.append(undoButton, clearButton);
    actions.append(actionRow);

    pane.append(el("div", "hint", "Annotations sit on top of the image and are included in Save PNG. Pan with right/middle mouse in any tool."));
    ctx.setTool("pan");
}