const DEFAULT_PANEL = { left: null, top: null, width: 350, height: 300, hideNotFound: true };
const MIN_W = 240;
const MIN_H = 80;
const MARGIN = 10;

const PANEL_CSS = `
    :host {
        all: initial;
    }
        
    .panel {
        position: fixed;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        resize: both;
        box-sizing: border-box;
        min-width: ${MIN_W}px;
        min-height: ${MIN_H}px;
        max-width: 100vw;
        max-height: 100vh;
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        font: 12px monospace;
        border: 1px solid #333;
        border-radius: 8px;
        z-index: 2147483647;
    }

    .bar {
        flex: none;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        background: rgba(255, 255, 255, 0.08);
        cursor: move;
        user-select: none;
        touch-action: none;
    }

    .title {
        flex: 1;
        font-weight: bold;
    }

    button {
        font: 11px monospace;
        padding: 3px 7px;
        cursor: pointer;
        color: #fff;
        background: rgba(0, 0, 0, 0.6);
        border: 1px solid #555;
        border-radius: 4px;
    }
    button:hover {
        background: #222;
    }

    /* Status */
    .statusrow {
        flex: none;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        color: #aaa;
        border-bottom: 1px solid #222;
    }

    /* Status spinner */
    .spinner {
        flex: none;
        width: 10px;
        height: 10px;
        border: 2px solid #555;
        border-top-color: #4af;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }
    .spinner.off {
        display: none;
    }
    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    /* Logs */
    .logs {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 4px 10px 8px;
    }
    .log {
        margin-top: 4px;
        padding: 2px 0 0 4px;
        background: #111;
        border-top: 1px solid #555;
        word-break: break-word;
        white-space: pre-wrap;
    }
    
    /* Scrollbar */
    .logs::-webkit-scrollbar {
        width: 8px;
    }
    .logs::-webkit-scrollbar-track {
        background: #111;
        border-radius: 4px;
    }
    .logs::-webkit-scrollbar-thumb {
        background: #444;
        border-radius: 4px;
        border: 2px solid #111;
    }
    .logs::-webkit-scrollbar-thumb:hover {
        background: #666;
    }
    .log a {
        color: #4af;
    }
    /* Firefox */
    .logs {
        scrollbar-width: thin;
        scrollbar-color: #444 #111;
    }

    .info,
    .notfound {
        color: #4af;
    }
    .found {
        color: #0f0;
    }
    .meta {
        color: #0af;
    }
    .warn {
        color: #aa0;
    }
    .bad {
        color: #f00;
    }
    .error {
        color: #f66;
    }
    .hide-notfound .log.notfound {
        display: none;
    }
`;
