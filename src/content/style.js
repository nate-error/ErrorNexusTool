const DEFAULT_GALLERY = { left: 12, top: 12, width: 320, height: 420 };
const DEFAULT_CONSOLE = { height: 220 };
const MIN_W = 240;
const MIN_H = 80;

const UI_CSS = `
:host { all: initial; }
- { box-sizing: border-box; }
a { color: #4af; }

button, select, input, textarea {
    font: 11px monospace; color: #fff; background: rgba(0,0,0,.6);
    border: 1px solid #555; border-radius: 4px; padding: 3px 7px;
}
button { cursor: pointer; }
button:hover { background: #222; }
button.on { background: #123a55; border-color: #4af; }

input[type=range] { padding: 0; width: 100%; }
input[type=number], input[type=text] { width: 100%; }
input[type=color] { padding: 0; width: 34px; height: 22px; }

.scroll { scrollbar-width: thin; scrollbar-color: #444 #111; }
.scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.scroll::-webkit-scrollbar-track { background: #111; }
.scroll::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; border: 2px solid #111; }

.info, .notfound-text { color: #4af; }
.found { color: #0f0; }
.meta { color: #0af; }
.warn { color: #aa0; }
.bad { color: #f00; }
.error { color: #f66; }
.notfound { color: #5a82a8; }

/* ---------- Console (bottom) ---------- */
.console {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483640;
    display: flex; flex-direction: column;
    background: rgba(10,10,12,.96); color: #fff; font: 12px monospace;
    border-top: 1px solid #333;
}
.grip { display: none; flex: none; height: 6px; cursor: ns-resize; background: #1c1c20; }
.console.open .grip { display: block; }
.cbody { display: none; overflow-y: auto; padding: 4px 10px; min-height: 0; }
.console.open .cbody { display: block; }

.cbar {
    flex: none; height: 28px; display: flex; align-items: center; gap: 10px;
    padding: 0 10px; cursor: pointer; user-select: none;
}
.cbar .chev { color: #888; width: 12px; }
.cbar .ctitle { font-weight: bold; }
.cstatus { color: #aaa; white-space: nowrap; }
.only-open { display: none; }
.console.open .only-open { display: inline-block; }

.progress { flex: 1; height: 8px; background: #222; border-radius: 4px; overflow: hidden; }
.progress .fill { height: 100%; width: 0; background: #4af; transition: width .15s; }
.progress.done .fill { background: #3a6; }
.progress.throttled .fill {
    background: repeating-linear-gradient(45deg, #f80 0 8px, #a50 8px 16px);
    background-size: 22.6px 22.6px; animation: stripe .8s linear infinite;
}
@keyframes stripe { to { background-position: 22.6px 0; } }
@media (prefers-reduced-motion: reduce) { .progress.throttled .fill { animation: none; } }

@keyframes flashFound { 0%,100% { background: transparent; } 50% { background: rgba(255,170,0,.45); } }
.cbar.alert-found { animation: flashFound .3s ease-in-out 2; }
@media (prefers-reduced-motion: reduce) { .cbar.alert-found { animation: none; } }

.row { display: flex; gap: 10px; padding: 1px 0; border-bottom: 1px solid #1a1a1d; }
.row .st { flex: none; width: 30px; color: #777; }
.row .kd { flex: none; width: 54px; color: #777; }
.row .u { flex: 1; min-width: 0; word-break: break-all; color: inherit; }
.row .tail { flex: none; max-width: 40%; color: #888; }
.row.logrow { white-space: pre-wrap; word-break: break-word; }
.console.hide-notfound .row.notfound { display: none; }

/* ---------- Image list (top-left) ---------- */
.gallery, .gallery * { box-sizing: border-box; }
.gallery {
    position: fixed; z-index: 2147483641; display: none; flex-direction: column;
    overflow: hidden; resize: both; min-width: ${MIN_W}px; min-height: ${MIN_H}px;
    max-width: 100vw; max-height: 100vh;
    background: rgba(10,10,12,.92); color: #fff; font: 12px monospace;
    border: 1px solid #333; border-radius: 8px;
}
.gbar {
    flex: none; display: flex; align-items: center; gap: 6px; padding: 6px 8px;
    background: rgba(255,255,255,.08); cursor: move; user-select: none; touch-action: none;
}
.gtitle { flex: 1; font-weight: bold; }
.glist { flex: 1; min-height: 0; overflow-y: auto; padding: 2px 0 6px; }
.empty { padding: 12px; color: #777; }

.card { margin: 6px; border: 1px solid #2a2a2e; border-radius: 6px; background: #141416; }
.card.sel { border-color: #4af; }
.chead { display: flex; align-items: center; gap: 8px; padding: 6px; cursor: pointer; }
.cmeta { flex: 1; min-width: 0; }
.cname { color: #4af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.thumb {
    flex: none; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center;
    overflow: hidden; border-radius: 4px; color: #666;
    background: repeating-conic-gradient(#222 0 25%, #181818 0 50%) 0 0 / 12px 12px;
}
.thumb canvas { max-width: 100%; max-height: 100%; }

.badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.badge { padding: 0 6px; font-size: 10px; border: 1px solid #444; border-radius: 8px; color: #aaa; }
.badge.ok { color: #0f0; border-color: #0a0; }
.badge.bad { color: #f66; border-color: #a22; }

.chev2 { flex: none; background: none; border: none; color: #aaa; font-size: 22px; }
.card.open .chev2 { transform: rotate(180deg); }
.cdetails { display: none; padding: 6px 8px 8px; border-top: 1px solid #222; color: #bbb; white-space: pre-wrap; word-break: break-word; }
.card.open .cdetails { display: block; }

/* ---------- Playground ---------- */
.pg {
    position: fixed; inset: 0; z-index: 2147483646; display: none;
    padding: 4vmin; background: rgba(0,0,0,.62); font: 12px monospace; color: #ddd;
}
.pg.open { display: block; }
.pg-win {
    width: 100%; height: 100%; display: grid; overflow: hidden;
    grid-template-columns: 140px 1fr 340px; grid-template-rows: 38px 1fr 28px;
    background: #0c0c0e; border: 1px solid #3a3a42; border-radius: 10px;
    box-shadow: 0 12px 60px rgba(0,0,0,.7);
}
@media (max-width: 900px) { .pg-win { grid-template-columns: 96px 1fr 280px; } }

.pg-top { grid-column: 1 / 4; display: flex; align-items: center; gap: 6px; padding: 0 10px; background: #17171a; border-bottom: 1px solid #2a2a2e; }
.pg-title { flex: 1; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.pg-list { overflow-y: auto; min-height: 0; padding: 6px; border-right: 1px solid #2a2a2e; }
.pl { padding: 4px; margin-bottom: 6px; border: 1px solid #2a2a2e; border-radius: 6px; background: #141416; cursor: pointer; }
.pl.sel { border-color: #4af; }
.pl .thumb { width: 100%; height: 84px; }
.pl .nm { margin-top: 3px; font-size: 10px; color: #aaa; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.pg-stage {
    position: relative; overflow: hidden; min-width: 0; min-height: 0; cursor: grab; touch-action: none;
    background: repeating-conic-gradient(#1b1b1e 0 25%, #141416 0 50%) 0 0 / 20px 20px;
}
.pg-stage.grabbing { cursor: grabbing; }
.pg-stage.draw { cursor: crosshair; }
.world { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.world canvas { position: absolute; left: 0; top: 0; display: block; }
.pxbox { position: absolute; width: 1px; height: 1px; display: none; pointer-events: none; }

.pg-side { display: flex; flex-direction: column; min-width: 0; min-height: 0; border-left: 1px solid #2a2a2e; }
.tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 6px; border-bottom: 1px solid #2a2a2e; }
.panes { flex: 1; min-height: 0; overflow-y: auto; }
.pane { display: none; padding: 6px 0 14px; }
.pane.on { display: block; }

.ctl { display: grid; grid-template-columns: 82px 1fr 42px; gap: 6px; align-items: center; margin: 6px 8px; }
.ctl .val { text-align: right; color: #4af; }
.ctl select { grid-column: 2 / 4; }
.row2 { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 8px; }
.row2 label { display: flex; align-items: center; gap: 6px; }
.hint { margin: 6px 8px; color: #888; font-size: 11px; line-height: 1.4; }
.kv { margin: 4px 8px; word-break: break-all; }
.kv b { color: #888; font-weight: normal; }

.slist { margin: 6px 8px; max-height: 280px; overflow: auto; }
.sitem { display: flex; align-items: center; gap: 8px; padding: 2px 4px; cursor: pointer; border-bottom: 1px solid #1c1c20; }
.sitem:hover, .sitem.sel { background: #1c1c22; }
.swatch { flex: none; width: 14px; height: 14px; border: 1px solid #555; border-radius: 2px; }
.section-divider { height: 1px; background: #444; flex-shrink: 0; margin: 12px 0; }

.pre { margin: 4px 8px; padding: 6px; background: #09090b; border: 1px solid #2a2a2e; border-radius: 4px; white-space: pre-wrap; word-break: break-all; max-height: 220px; overflow: auto; }
.hexpre { margin: 6px 8px; padding: 6px; background: #09090b; border: 1px solid #2a2a2e; border-radius: 4px; overflow: auto; white-space: pre; color: #9cf; }

.pg-status { grid-column: 1 / 4; display: flex; align-items: center; gap: 14px; padding: 0 10px; overflow: hidden; white-space: nowrap; background: #17171a; border-top: 1px solid #2a2a2e; }
.readout { flex: 1; display: flex; align-items: center; gap: 8px; overflow: hidden; }
.readout .swatch { width: 12px; height: 12px; }
.pinned { color: #fc6; }
.zoomtext { color: #888; }
`;