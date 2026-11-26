// Section / slider / select / checkbox builders bound to ctx.params. Every change calls ctx.schedule()
function createControls(ctx) {
    // A titled card that groups related controls
    function addSection(parent, title) {
        const section = el("div", "sec");
        if (title) section.append(el("div", "sec-title", title));
        parent.append(section);

        return section;
    }

    // Generic slider: label on the left, clickable value on the right (click it, or double click the slider, to reset).
    // Returns a sync() function that refreshes the UI from get().
    function addRange(parent, label, min, max, step, { get, set, def, onChange }) {
        const row = el("div", "ctl");
        const input = el("input");
        input.type = "range";
        input.min = min;
        input.max = max;
        input.step = step;

        const valueEl = el("span", "val");
        valueEl.title = "Click to reset";

        const sync = () => {
            const value = get();
            input.value = value;
            valueEl.textContent = value;
            valueEl.classList.toggle("changed", value !== def);
            input.style.setProperty("--p", `${((value - min) / (max - min)) * 100}%`); // filled part of the track
        };

        const reset = () => {
            set(def);
            sync();
            if (onChange) onChange();
        };

        input.addEventListener("input", () => {
            set(Number(input.value));
            sync();
            if (onChange) onChange();
        });
        input.addEventListener("dblclick", reset);
        valueEl.addEventListener("click", reset);

        row.append(el("span", "", label), input, valueEl);
        parent.append(row);

        return sync;
    }

    function addSlider(parent, label, key, min, max, step) {
        const sync = addRange(parent, label, min, max, step, {
            get: () => ctx.params[key],
            set: (value) => { ctx.params[key] = value; },
            def: PARAM_DEFAULTS()[key],
            onChange: ctx.schedule,
        });

        ctx.syncers.push(sync);
    }

    function addSelect(parent, label, key, options, onChange) {
        const row = el("div", "ctl");
        const wrap = el("div", "selwrap");
        const select = el("select");

        for (const [value, text] of options) {
            const option = el("option", "", text);
            option.value = value;
            select.append(option);
        }

        select.addEventListener("change", () => {
            ctx.params[key] = select.value;
            (onChange || ctx.schedule)();
        });

        ctx.syncers.push(() => { select.value = ctx.params[key]; });
        wrap.append(select);
        row.append(el("span", "", label), wrap);
        parent.append(row);
    }

    function addCheck(parent, label, key) {
        const row = el("div", "row2");
        const labelEl = el("label");
        const checkbox = el("input");
        checkbox.type = "checkbox"; // drawn as a switch by the stylesheet

        checkbox.addEventListener("change", () => {
            ctx.params[key] = checkbox.checked;
            ctx.schedule();
        });

        ctx.syncers.push(() => { checkbox.checked = !!ctx.params[key]; });

        labelEl.append(checkbox, label);
        row.append(labelEl);
        parent.append(row);
    }

    return { addSection, addRange, addSlider, addSelect, addCheck };
}