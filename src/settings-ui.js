// ---------------------------------------------------------------------------
// Shared Settings UI component (Shadow DOM, light/dark theme, instant auto-save)
// Used by both the inline Todoist Settings tab and the GM menu modal.
// ---------------------------------------------------------------------------

import {
  FEATURE_DEFAULTS,
  SECTIONS,
  SHORTCUT_DEFAULTS,
  eventToShortcut,
  formatLabel,
  isIgnoredKey,
  isModifierOnly,
  shortcutsEqual,
} from "./defaults.js";
import {
  getSettings,
  getShortcuts,
  restoreAllDefaults,
  setSetting,
  setShortcut,
  subscribeStorage,
} from "./storage.js";

let activeRecorder = null;
let globalRecordingListenersAttached = false;

export function isRecordingShortcut() {
  return activeRecorder !== null;
}

export function stopRecordingShortcut() {
  if (!activeRecorder) return;
  const { el, id } = activeRecorder;
  activeRecorder = null;
  if (el && el.isConnected) {
    el.classList.remove("recording");
    const sc = getShortcuts()[id];
    if (sc) el.textContent = formatLabel(sc.label || "");
  }
}

function swallowRecordingEvent(e) {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

function ensureGlobalRecordingListeners() {
  if (globalRecordingListenersAttached) return;
  globalRecordingListenersAttached = true;

  window.addEventListener(
    "keydown",
    (e) => {
      if (!activeRecorder) return;
      swallowRecordingEvent(e);

      if (isModifierOnly(e.key)) return;
      if (isIgnoredKey(e.key)) {
        stopRecordingShortcut();
        return;
      }

      const { id, onSaved } = activeRecorder;
      const newShortcut = eventToShortcut(e);
      activeRecorder = null;
      setShortcut(id, newShortcut);
      if (onSaved) onSaved("Saved");
    },
    true,
  );

  for (const type of ["keyup", "keypress"]) {
    window.addEventListener(
      type,
      (e) => {
        if (!activeRecorder) return;
        swallowRecordingEvent(e);
      },
      true,
    );
  }

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!activeRecorder) return;
      const path = typeof e.composedPath === "function" ? e.composedPath() : [];
      if (!path.includes(activeRecorder.el)) {
        stopRecordingShortcut();
      }
    },
    true,
  );
}

export function detectTodoistTheme() {
  const appearance = document.documentElement.getAttribute("data-appearance");
  if (appearance === "dark") return "dark";
  if (appearance === "light") return "light";
  if (document.documentElement.classList.contains("theme_dark")) return "dark";
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

export function observeTodoistTheme(onChange) {
  let current = detectTodoistTheme();
  onChange(current);

  const observer = new MutationObserver(() => {
    const next = detectTodoistTheme();
    if (next !== current) {
      current = next;
      onChange(next);
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-appearance", "class"],
  });
  return () => observer.disconnect();
}

const SETTINGS_STYLES = `
  :host {
    --kbd-bg: var(--todoist-card-background, #ffffff);
    --kbd-text: var(--todoist-card-color, #202020);
    --kbd-text-muted: #666666;
    --kbd-border: #e5e5e5;
    --kbd-row-border: #f0f0f0;
    --kbd-accent: #dc4c3e;
    --kbd-accent-hover: #c3392c;
    --kbd-accent-soft: #fff5f4;
    --kbd-input-bg: #fafafa;
    --kbd-input-border: #d4d4d4;
    --kbd-btn-hover-bg: rgba(0, 0, 0, 0.05);
    --kbd-status-color: #2e7d32;
    --kbd-switch-off: #cccccc;
    --kbd-switch-thumb: #ffffff;
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: var(--kbd-text);
  }

  :host([data-theme="dark"]) {
    --kbd-bg: #1f1f1f;
    --kbd-text: #e6e6e6;
    --kbd-text-muted: #9d9d9d;
    --kbd-border: #363636;
    --kbd-row-border: #2c2c2c;
    --kbd-accent: #de4c4a;
    --kbd-accent-hover: #e86866;
    --kbd-accent-soft: rgba(222, 76, 74, 0.14);
    --kbd-input-bg: #2a2a2a;
    --kbd-input-border: #444444;
    --kbd-btn-hover-bg: rgba(255, 255, 255, 0.08);
    --kbd-status-color: #66bb6a;
    --kbd-switch-off: #555555;
    --kbd-switch-thumb: #ffffff;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  .kbd-settings-root {
    color: var(--kbd-text);
    background: transparent;
  }

  .kbd-subtitle {
    color: var(--kbd-text-muted);
    margin: 0 0 24px;
    font-size: 13px;
  }

  .kbd-section {
    margin-bottom: 28px;
  }

  .kbd-section-heading {
    font-weight: 600;
    font-size: 14px;
    color: var(--kbd-text);
    padding-bottom: 8px;
    border-bottom: 1px solid var(--kbd-border);
    margin: 0 0 4px;
  }

  .kbd-feature-row {
    padding: 12px 0;
    border-bottom: 1px solid var(--kbd-row-border);
  }

  .kbd-feature-label {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    cursor: pointer;
  }

  .kbd-feature-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .kbd-feature-name {
    font-weight: 500;
    color: var(--kbd-text);
  }

  .kbd-feature-desc {
    font-size: 12px;
    color: var(--kbd-text-muted);
    margin-top: 2px;
  }

  /* Native-style toggle switch */
  .kbd-switch {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .kbd-switch input {
    position: absolute;
    opacity: 0;
    width: 36px;
    height: 20px;
    margin: 0;
    cursor: pointer;
  }

  .kbd-switch-track {
    width: 36px;
    height: 20px;
    border-radius: 999px;
    background: var(--kbd-switch-off);
    transition: background 0.15s ease;
    position: relative;
    pointer-events: none;
  }

  .kbd-switch-track::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--kbd-switch-thumb);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    transition: transform 0.15s ease;
  }

  .kbd-switch input:checked + .kbd-switch-track {
    background: var(--kbd-accent);
  }

  .kbd-switch input:checked + .kbd-switch-track::after {
    transform: translateX(16px);
  }

  .kbd-switch input:focus-visible + .kbd-switch-track {
    outline: 2px solid var(--kbd-accent);
    outline-offset: 2px;
  }

  .kbd-feature-preview {
    display: block;
    margin-top: 10px;
    max-width: 100%;
    border-radius: 6px;
    border: 1px solid var(--kbd-border);
  }

  .kbd-shortcuts-table {
    width: 100%;
    border-collapse: collapse;
  }

  .kbd-shortcuts-table tr.kbd-group-header td {
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--kbd-accent);
    text-align: left;
    padding: 20px 0 8px;
    border-bottom: 1px solid var(--kbd-border);
  }

  .kbd-shortcuts-table tr.kbd-group-header:first-child td {
    padding-top: 8px;
  }

  .kbd-shortcuts-table td {
    padding: 12px 0;
    border-bottom: 1px solid var(--kbd-row-border);
    vertical-align: middle;
  }

  .kbd-shortcuts-table tr:not(.kbd-group-header) td:last-child {
    text-align: right;
    white-space: nowrap;
    padding-left: 16px;
  }

  .kbd-action-name {
    font-weight: 500;
    color: var(--kbd-text);
  }

  .kbd-action-desc {
    font-size: 12px;
    color: var(--kbd-text-muted);
    margin-top: 2px;
  }

  .kbd-shortcut-cell-inner {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }

  .key-input {
    display: inline-block;
    min-width: 168px;
    padding: 6px 10px;
    border: 1px solid var(--kbd-input-border);
    border-radius: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12.5px;
    color: var(--kbd-text);
    background: var(--kbd-input-bg);
    cursor: pointer;
    user-select: none;
    text-align: center;
    transition: border-color 0.15s, background 0.15s;
  }

  .key-input:hover {
    border-color: var(--kbd-accent);
  }

  .key-input:focus,
  .key-input.recording {
    outline: none;
    border-color: var(--kbd-accent);
    background: var(--kbd-accent-soft);
  }

  .key-input.recording::after {
    content: " …";
    color: var(--kbd-accent);
  }

  .btn-reset {
    background: none;
    border: none;
    color: var(--kbd-text-muted);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 4px;
    flex-shrink: 0;
    transition: color 0.1s, background 0.1s, opacity 0.1s;
  }

  .btn-reset:hover {
    color: var(--kbd-accent);
    background: var(--kbd-btn-hover-bg);
  }

  .btn-reset[data-is-default="true"] {
    opacity: 0.3;
  }

  .btn-reset[data-is-default="true"]:hover {
    opacity: 0.8;
  }

  .kbd-footer {
    margin-top: 24px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .btn-restore {
    background: none;
    border: 1px solid var(--kbd-input-border);
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    color: var(--kbd-text);
    transition: border-color 0.15s, background 0.15s;
  }

  .btn-restore:hover {
    border-color: var(--kbd-text-muted);
    background: var(--kbd-btn-hover-bg);
  }

  .kbd-status {
    font-size: 13px;
    color: var(--kbd-status-color);
    opacity: 0;
    transition: opacity 0.2s;
  }

  .kbd-status.visible {
    opacity: 1;
  }
`;

/**
 * Mount the auto-saving Settings UI inside `container` using an isolated Shadow DOM.
 * Returns a `{ destroy }` cleanup handle.
 */
export function mountSettingsUI(container) {
  ensureGlobalRecordingListeners();

  const host = document.createElement("div");
  host.setAttribute("data-kbd-settings-ui", "1");
  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = SETTINGS_STYLES;
  shadow.appendChild(style);

  const root = document.createElement("div");
  root.className = "kbd-settings-root";
  shadow.appendChild(root);

  const subtitle = document.createElement("p");
  subtitle.className = "kbd-subtitle";
  subtitle.textContent =
    "Click any shortcut field and press a key combination to rebind it. Changes are saved automatically.";
  root.appendChild(subtitle);

  // Features section
  const featuresSection = document.createElement("div");
  featuresSection.className = "kbd-section";
  const featuresHeading = document.createElement("div");
  featuresHeading.className = "kbd-section-heading";
  featuresHeading.textContent = "Features";
  const featuresList = document.createElement("div");
  featuresList.id = "features-list";
  featuresSection.append(featuresHeading, featuresList);
  root.appendChild(featuresSection);

  // Shortcuts section
  const shortcutsSection = document.createElement("div");
  shortcutsSection.className = "kbd-section";
  const shortcutsHeading = document.createElement("div");
  shortcutsHeading.className = "kbd-section-heading";
  shortcutsHeading.textContent = "Keyboard shortcuts";
  const table = document.createElement("table");
  table.className = "kbd-shortcuts-table";
  const tbody = document.createElement("tbody");
  tbody.id = "shortcuts-table";
  table.appendChild(tbody);
  shortcutsSection.append(shortcutsHeading, table);
  root.appendChild(shortcutsSection);

  // Footer (Restore defaults + instant Saved feedback, no Save button)
  const footer = document.createElement("div");
  footer.className = "kbd-footer";
  const restoreBtn = document.createElement("button");
  restoreBtn.type = "button";
  restoreBtn.className = "btn-restore";
  restoreBtn.id = "btn-restore";
  restoreBtn.textContent = "Restore defaults";
  const statusEl = document.createElement("span");
  statusEl.className = "kbd-status";
  statusEl.id = "status";
  statusEl.setAttribute("role", "status");
  statusEl.textContent = "Saved";
  footer.append(restoreBtn, statusEl);
  root.appendChild(footer);

  let statusTimer = null;
  function flashStatus(message = "Saved") {
    statusEl.textContent = message;
    statusEl.classList.add("visible");
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusEl.classList.remove("visible");
    }, 1600);
  }

  const featureCheckboxes = new Map();
  const shortcutControls = new Map();

  function buildFeatures() {
    const currentSettings = getSettings();
    featuresList.textContent = "";
    featureCheckboxes.clear();

    for (const feature of FEATURE_DEFAULTS) {
      const row = document.createElement("div");
      row.className = "kbd-feature-row";

      const label = document.createElement("label");
      label.className = "kbd-feature-label";

      const text = document.createElement("span");
      text.className = "kbd-feature-text";
      const nameEl = document.createElement("span");
      nameEl.className = "kbd-feature-name";
      nameEl.textContent = feature.name;
      const descEl = document.createElement("span");
      descEl.className = "kbd-feature-desc";
      descEl.textContent = feature.description;
      text.append(nameEl, descEl);

      const switchWrap = document.createElement("span");
      switchWrap.className = "kbd-switch";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `feature-${feature.id}`;
      checkbox.checked = currentSettings[feature.id] !== false;
      checkbox.addEventListener("change", () => {
        setSetting(feature.id, checkbox.checked);
        flashStatus("Saved");
      });
      featureCheckboxes.set(feature.id, checkbox);

      const track = document.createElement("span");
      track.className = "kbd-switch-track";
      switchWrap.append(checkbox, track);

      label.append(text, switchWrap);
      row.appendChild(label);

      const previewSrc =
        typeof PREVIEW_ASSETS !== "undefined"
          ? PREVIEW_ASSETS[feature.id]
          : null;
      if (previewSrc) {
        const img = document.createElement("img");
        img.src = previewSrc;
        img.alt = feature.name;
        img.className = "kbd-feature-preview";
        row.appendChild(img);
      }

      featuresList.appendChild(row);
    }
  }

  function buildShortcutRow(def, currentShortcut) {
    const tr = document.createElement("tr");

    const tdAction = document.createElement("td");
    const nameDiv = document.createElement("div");
    nameDiv.className = "kbd-action-name";
    nameDiv.textContent = def.name;
    const descDiv = document.createElement("div");
    descDiv.className = "kbd-action-desc";
    descDiv.textContent = def.description;
    tdAction.append(nameDiv, descDiv);

    const tdShortcut = document.createElement("td");
    const inner = document.createElement("div");
    inner.className = "kbd-shortcut-cell-inner";

    const input = document.createElement("span");
    input.className = "key-input";
    input.tabIndex = 0;
    input.setAttribute("role", "button");
    input.setAttribute("aria-label", `Change shortcut for ${def.name}`);
    input.dataset.id = def.id;
    input.textContent = formatLabel(currentShortcut.label || def.shortcut.label);

    const isDefault = shortcutsEqual(currentShortcut, def.shortcut);
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn-reset";
    resetBtn.title = "Reset to default";
    resetBtn.setAttribute("aria-label", `Reset ${def.name} to default`);
    resetBtn.textContent = "↺";
    resetBtn.dataset.id = def.id;
    resetBtn.dataset.isDefault = String(isDefault);

    shortcutControls.set(def.id, { def, input, resetBtn });

    inner.append(input, resetBtn);
    tdShortcut.appendChild(inner);
    tr.append(tdAction, tdShortcut);
    tbody.appendChild(tr);

    const startRecording = (e) => {
      e.preventDefault();
      e.stopPropagation();
      stopRecordingShortcut();
      input.classList.add("recording");
      input.textContent = "Press a key combination";
      activeRecorder = {
        id: def.id,
        el: input,
        onSaved: (msg) => flashStatus(msg),
      };
    };

    input.addEventListener("click", startRecording);
    input.addEventListener("keydown", (e) => {
      if (activeRecorder) return;
      if (e.key === "Enter" || e.key === " ") {
        startRecording(e);
      }
    });

    resetBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      stopRecordingShortcut();
      setShortcut(def.id, { ...def.shortcut });
      flashStatus("Saved");
    });
  }

  function buildTable() {
    const currentShortcuts = getShortcuts();
    tbody.textContent = "";
    shortcutControls.clear();

    for (const section of SECTIONS) {
      const sectionItems = SHORTCUT_DEFAULTS.filter(
        (s) => s.section === section.id,
      );
      if (!sectionItems.length) continue;

      const headerTr = document.createElement("tr");
      headerTr.className = "kbd-group-header";
      const headerTd = document.createElement("td");
      headerTd.colSpan = 2;
      headerTd.textContent = section.label;
      headerTr.appendChild(headerTd);
      tbody.appendChild(headerTr);

      for (const def of sectionItems) {
        buildShortcutRow(def, currentShortcuts[def.id] || def.shortcut);
      }
    }

    const uncategorised = SHORTCUT_DEFAULTS.filter(
      (s) => !SECTIONS.some((sec) => sec.id === s.section),
    );
    if (uncategorised.length) {
      const headerTr = document.createElement("tr");
      headerTr.className = "kbd-group-header";
      const headerTd = document.createElement("td");
      headerTd.colSpan = 2;
      headerTd.textContent = "Other";
      headerTr.appendChild(headerTd);
      tbody.appendChild(headerTr);
      for (const def of uncategorised) {
        buildShortcutRow(def, currentShortcuts[def.id] || def.shortcut);
      }
    }
  }

  function syncUI() {
    const currentSettings = getSettings();
    for (const [id, checkbox] of featureCheckboxes) {
      checkbox.checked = currentSettings[id] !== false;
    }

    const currentShortcuts = getShortcuts();
    for (const [id, { def, input, resetBtn }] of shortcutControls) {
      const sc = currentShortcuts[id] || def.shortcut;
      const isActivelyRecording =
        activeRecorder && activeRecorder.id === id && activeRecorder.el === input;
      if (!isActivelyRecording) {
        input.classList.remove("recording");
        input.textContent = formatLabel(sc.label || def.shortcut.label);
      }
      resetBtn.dataset.isDefault = String(shortcutsEqual(sc, def.shortcut));
    }
  }

  restoreBtn.addEventListener("click", (e) => {
    e.preventDefault();
    stopRecordingShortcut();
    restoreAllDefaults();
    flashStatus("Defaults restored");
  });

  const unsubscribeStorage = subscribeStorage(() => syncUI());
  const stopThemeObserver = observeTodoistTheme((theme) => {
    host.setAttribute("data-theme", theme);
  });

  buildFeatures();
  buildTable();
  container.appendChild(host);

  return {
    host,
    shadow,
    destroy() {
      stopRecordingShortcut();
      unsubscribeStorage();
      stopThemeObserver();
      if (statusTimer) clearTimeout(statusTimer);
      host.remove();
    },
  };
}
