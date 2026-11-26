// Bottom console: collapsed to a thin progress bar by default
// Bar states: blue = searching, striped orange = paused by a rate limit (with countdown), green = done
// It blinks amber when something is found, until the console is opened
function createConsole(saved, onSave) {
    let open = false;
    let hideNotFound = true;
    let hidden = 0;
    let found = 0;
    let pauses = 0;
    let wasActive = false;
    let stopped = false;
    let last = { active: false, done: 0, total: 0 };
    let throttle = null; // { until, why }
    let timer = 0;
    let height = saved.height || DEFAULT_CONSOLE.height;

    const grip = el("div", "grip");
    const body = el("div", "cbody scroll");
    const chev = el("span", "chev", "\u25B2");
    const progress = el("div", "progress");
    const fill = el("div", "fill");
    progress.append(fill);

    const statusText = el("span", "cstatus", "Idle");
    const stopBtn = el("button", "", "Stop");
    stopBtn.title = "Cancel the current scan";
    stopBtn.style.display = "none";

    const toggleNF = el("button"); // always visible, so hidden 404s are never a mystery
    const clearBtn = el("button", "only-open", "Clear");
    const bar = el("div", "cbar");

    // Open options
    const optionsBtn = el("button", "options-btn", "⚙");
    optionsBtn.title = "Open options";
    optionsBtn.setAttribute("aria-label", "Open options");
    optionsBtn.addEventListener("click", (e) => {
        e.stopPropagation();

        browserAPI.runtime.sendMessage({
            type: "OPEN_OPTIONS"
        });
    });
    
    bar.append(chev, el("span", "ctitle", "Console"), progress, statusText, stopBtn, toggleNF, clearBtn, optionsBtn);

    const box = el("div", "console hide-notfound");
    box.append(grip, body, bar);
    UI.root.append(box);

    body.style.height = height + "px";

    const renderToggle = () => { toggleNF.textContent = `${hideNotFound ? "Show" : "Hide"} not found (${hidden})`; };
    renderToggle();

    function renderStatus() {
        const { active, done, total } = last;
        const now = Date.now();
        const paused = !!throttle && throttle.until > now;
        progress.classList.toggle("done", !active && !stopped);
        progress.classList.toggle("throttled", active && paused);
        stopBtn.style.display = active ? "" : "none";

        if (active) {
            statusText.textContent = paused
                ? `Paused: ${throttle.why}, resuming in ${Math.ceil((throttle.until - now) / 1000)}s \u00B7 ${done}/${total || "?"}`
                : `Searching\u2026 ${done}/${total || "?"} \u00B7 ${found} found`;
        } else {
            statusText.textContent = `${stopped ? "Stopped" : "Done"} (${done} URLs checked) \u00B7 ${found} found` +
                (pauses ? ` \u00B7 ${pauses} rate-limit pause${pauses > 1 ? "s" : ""}` : "");
        }
    }

    function setThrottle({ until, why }) {
        pauses++;
        throttle = { until, why };
        if (!timer)
        {
            timer = setInterval(() => {
                if (!throttle || throttle.until <= Date.now()) { clearInterval(timer); timer = 0; }
                renderStatus();
            }, 250);
        }

        renderStatus();
    }

    function setOpen(v) {
        open = v;
        box.classList.toggle("open", v);
        chev.textContent = v ? "\u25BC" : "\u25B2";
        if (v) {
            bar.classList.remove("alert-found");
            body.scrollTop = body.scrollHeight;
        }
    }

    // blink amber when something is found (until the console is opened)
    function flash() {
        if (open) return;

        bar.classList.remove("alert-found");
        void bar.offsetWidth; // restart the animation
        bar.classList.add("alert-found");
    }

    bar.addEventListener("click", (e) => {
        if (!e.target.closest("button")) setOpen(!open);
    });
    stopBtn.addEventListener("click", () => {
        stopped = true;
        askBackground({ type: "cancelScan" });
    });
    toggleNF.addEventListener("click", () => {
        hideNotFound = !hideNotFound;
        box.classList.toggle("hide-notfound", hideNotFound);
        renderToggle();
        body.scrollTop = body.scrollHeight;
    });
    clearBtn.addEventListener("click", () => {
        body.replaceChildren();
        hidden = 0;
        renderToggle();
    });

    // drag the top edge to resize
    grip.addEventListener("pointerdown", (e) => {
        const startY = e.clientY;
        const startH = height;
        grip.setPointerCapture(e.pointerId);

        const move = (ev) => {
            height = clamp(startH + (startY - ev.clientY), 60, window.innerHeight * 0.85);
            body.style.height = height + "px";
        };

        const up = () => {
            grip.removeEventListener("pointermove", move);
            grip.removeEventListener("pointerup", up);
            onSave({ height: Math.round(height) });
        };

        grip.addEventListener("pointermove", move);
        grip.addEventListener("pointerup", up);
    });

    function push(row, level) {
        const stick = body.scrollTop + body.clientHeight >= body.scrollHeight - 30;
        if (level === "notfound") {
            hidden++;
            renderToggle();
        }

        body.appendChild(row);

        while (body.childElementCount > 3000)
            body.firstElementChild.remove();
        
        if (stick)
            body.scrollTop = body.scrollHeight;

    }

    function addLog({ text, level = "info", href = null }) {
        const row = el("div", `row logrow ${level}`);
        row.append(text);
        if (href) {
            const a = el("a", "", href);
            a.href = href;
            a.target = "_blank";
            a.rel = "noopener";
            row.append(a);
        }

        push(row, level);
    }

    // entry = { kind, url, status, level, contentType, size, note }
    function addEntry(e) {
        const row = el("div", `row ${e.level}`);
        row.append(el("span", "st", e.status != null ? String(e.status) : ""), el("span", "kd", e.kind || ""));

        const a = el("a", "u", e.url);
        a.href = e.url;
        a.target = "_blank";
        a.rel = "noopener";
        row.append(a);

        const tail = [e.contentType, e.size != null ? formatByteSize(e.size) : null, e.note].filter(Boolean).join(" \u00B7 ");
        if (tail)
            row.append(el("span", "tail", tail));
        
        push(row, e.level);

        if (e.level === "found") {
            found++;
            flash();
        }
    }

    function setProgress({ active, done, total }) {
        if (active && !wasActive) {
            found = 0;
            pauses = 0;
            stopped = false;
        }

        last = { active, done, total };
        fill.style.width = (total ? Math.round((done / total) * 100) : 0) + "%";
        if (!active)
            throttle = null;
        
        wasActive = active;
        renderStatus();
    }

    function reset() {
        height = DEFAULT_CONSOLE.height;
        body.style.height = height + "px";
    }

    return { addLog, addEntry, setProgress, setThrottle, reset, toggle: () => setOpen(!open), isOpen: () => open };
}
