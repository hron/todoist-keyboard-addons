// ---------------------------------------------------------------------------
// Standalone Shadow DOM Settings Modal (opened via GM_registerMenuCommand)
// Works from any Todoist view and serves as a fallback if Todoist's Settings
// DOM ever changes.
// ---------------------------------------------------------------------------

import {
  isRecordingShortcut,
  mountSettingsUI,
  observeTodoistTheme,
  stopRecordingShortcut,
} from "./settings-ui.js";

const MODAL_STYLES = `
  :host {
    --modal-bg: #ffffff;
    --modal-text: #202020;
    --modal-border: #e5e5e5;
    --modal-backdrop: rgba(0, 0, 0, 0.45);
    --modal-close-hover: rgba(0, 0, 0, 0.06);
    position: fixed;
    inset: 0;
    z-index: 2147483640;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }

  :host([data-theme="dark"]) {
    --modal-bg: #1f1f1f;
    --modal-text: #e6e6e6;
    --modal-border: #363636;
    --modal-backdrop: rgba(0, 0, 0, 0.65);
    --modal-close-hover: rgba(255, 255, 255, 0.08);
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  .kbd-backdrop {
    position: fixed;
    inset: 0;
    background: var(--modal-backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .kbd-dialog {
    width: 100%;
    max-width: 640px;
    max-height: min(85vh, 780px);
    background: var(--modal-bg);
    color: var(--modal-text);
    border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .kbd-header {
    height: 48px;
    padding: 0 16px 0 24px;
    border-bottom: 1px solid var(--modal-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .kbd-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--modal-text);
  }

  .kbd-close {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--modal-text);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    line-height: 1;
  }

  .kbd-close:hover {
    background: var(--modal-close-hover);
  }

  .kbd-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px 28px;
  }
`;

let activeModalCleanup = null;

export function closeSettingsModal() {
  if (activeModalCleanup) {
    activeModalCleanup();
    activeModalCleanup = null;
  }
}

export function openSettingsModal() {
  if (activeModalCleanup) return;

  const host = document.createElement("div");
  host.setAttribute("data-kbd-settings-modal", "1");
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = MODAL_STYLES;
  shadow.appendChild(style);

  const backdrop = document.createElement("div");
  backdrop.className = "kbd-backdrop";

  const dialog = document.createElement("div");
  dialog.className = "kbd-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", "Todoist Keyboard Add-ons Settings");

  const header = document.createElement("div");
  header.className = "kbd-header";

  const title = document.createElement("h2");
  title.className = "kbd-title";
  title.textContent = "Keyboard Add-ons";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "kbd-close";
  closeBtn.setAttribute("aria-label", "Close settings");
  closeBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  closeBtn.addEventListener("click", () => closeSettingsModal());

  header.append(title, closeBtn);

  const body = document.createElement("div");
  body.className = "kbd-body";

  dialog.append(header, body);
  backdrop.appendChild(dialog);
  shadow.appendChild(backdrop);

  const ui = mountSettingsUI(body);
  const stopTheme = observeTodoistTheme((theme) => {
    host.setAttribute("data-theme", theme);
  });

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      closeSettingsModal();
    }
  });

  const onKeyDown = (e) => {
    if (e.key === "Escape" && !isRecordingShortcut()) {
      e.preventDefault();
      e.stopPropagation();
      closeSettingsModal();
    }
  };
  window.addEventListener("keydown", onKeyDown, true);

  document.body.appendChild(host);

  activeModalCleanup = () => {
    stopRecordingShortcut();
    window.removeEventListener("keydown", onKeyDown, true);
    stopTheme();
    ui.destroy();
    host.remove();
  };
}
