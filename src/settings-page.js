// ---------------------------------------------------------------------------
// Todoist Settings (/app/settings/*) inline section injector
//
// Clones a native sidebar <a role="tab"> so it inherits Todoist's exact
// sidebar styling (light/dark, active highlight, hover), hides Todoist's
// native [role="tabpanel"] without mutating React's children, and mounts
// our auto-saving Settings UI inline in the right-hand pane.
// ---------------------------------------------------------------------------

import {
  mountSettingsUI,
  observeTodoistTheme,
  stopRecordingShortcut,
} from "./settings-ui.js";

const TAB_ATTR = "data-kbd-settings-tab";
const PANEL_ATTR = "data-kbd-settings-panel";

const KEYBOARD_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" aria-hidden="true">' +
  '<rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/>' +
  '<path fill="currentColor" d="M6.5 9.5h1.5V11H6.5zm3 0H11V11H9.5zm3 0H14V11h-1.5zm3 0H17V11h-1.5zM6.5 12.25h1.5v1.5H6.5zm3 0H11v1.5H9.5zm3 0H14v1.5h-1.5zm3 0H17v1.5h-1.5zM8.5 15h7v1.25h-7z"/>' +
  "</svg>";

const INLINE_PANEL_STYLES = `
  :host {
    --panel-bg: var(--todoist-card-background, #ffffff);
    --panel-text: var(--todoist-card-color, #202020);
    --panel-border: #e5e5e5;
    --panel-close-hover: rgba(0, 0, 0, 0.05);
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: hidden;
    background: var(--panel-bg);
    color: var(--panel-text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }

  :host([data-theme="dark"]) {
    --panel-bg: #1f1f1f;
    --panel-text: #e6e6e6;
    --panel-border: #363636;
    --panel-close-hover: rgba(255, 255, 255, 0.08);
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  .kbd-inline-header {
    height: 48px;
    padding: 0 12px 0 24px;
    border-bottom: 1px solid var(--panel-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .kbd-inline-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--panel-text);
  }

  .kbd-inline-close {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--panel-text);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .kbd-inline-close:hover {
    background: var(--panel-close-hover);
  }

  .kbd-inline-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px 36px;
  }
`;

let activeState = null;

function findSettingsDialog() {
  for (const dialog of document.querySelectorAll('[role="dialog"]')) {
    const hasSettingsTab = dialog.querySelector(
      `a[role="tab"][href*="/app/settings/"]:not([${TAB_ATTR}])`,
    );
    const hasNativePanel = dialog.querySelector(
      `[role="tabpanel"]:not([${PANEL_ATTR}])`,
    );
    if (hasSettingsTab && hasNativePanel) {
      return dialog;
    }
  }
  return null;
}

function setTabActiveAttrs(tab, active) {
  if (!tab) return;
  if (active) {
    tab.setAttribute("aria-selected", "true");
    tab.setAttribute("aria-current", "page");
    tab.setAttribute("data-active-item", "true");
    tab.setAttribute("tabindex", "0");
  } else {
    tab.setAttribute("aria-selected", "false");
    tab.removeAttribute("aria-current");
    tab.removeAttribute("data-active-item");
    tab.setAttribute("tabindex", "-1");
  }
}

export function deactivateInlineSettings(restoreTab = null) {
  if (!activeState) return;
  const {
    injectedTab,
    previouslyActiveTab,
    nativePanel,
    panelHost,
    ui,
    stopTheme,
  } = activeState;
  activeState = null;

  stopRecordingShortcut();
  if (stopTheme) stopTheme();
  if (ui) ui.destroy();
  if (panelHost) panelHost.remove();
  if (nativePanel) {
    nativePanel.style.display = "";
  }
  setTabActiveAttrs(injectedTab, false);

  // Restore native active attributes if the user clicked back to the same
  // native route (React Router won't re-render when the URL hasn't changed).
  const targetTab = restoreTab || previouslyActiveTab;
  if (targetTab && targetTab.isConnected) {
    const href = targetTab.getAttribute("href");
    if (!href || window.location.pathname === href) {
      setTabActiveAttrs(targetTab, true);
    }
  }
}

function activateInlineSettings(dialog, injectedTab) {
  if (activeState && activeState.injectedTab === injectedTab) return;
  if (activeState) deactivateInlineSettings();

  const nativePanel = dialog.querySelector(
    `[role="tabpanel"]:not([${PANEL_ATTR}])`,
  );
  if (!nativePanel || !nativePanel.parentElement) return;

  const previouslyActiveTab = dialog.querySelector(
    `a[role="tab"][aria-selected="true"]:not([${TAB_ATTR}])`,
  );
  setTabActiveAttrs(previouslyActiveTab, false);
  setTabActiveAttrs(injectedTab, true);

  // Hide Todoist's native panel without touching any of its React-managed children
  nativePanel.style.display = "none";

  const panelHost = document.createElement("div");
  panelHost.setAttribute("role", "tabpanel");
  panelHost.setAttribute(PANEL_ATTR, "1");
  panelHost.setAttribute("aria-label", "Keyboard Add-ons");
  panelHost.style.flex = "1";
  panelHost.style.minWidth = "0";
  panelHost.style.height = "100%";
  panelHost.style.display = "flex";
  panelHost.style.flexDirection = "column";
  panelHost.style.overflow = "hidden";

  const shadow = panelHost.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = INLINE_PANEL_STYLES;
  shadow.appendChild(style);

  const header = document.createElement("header");
  header.className = "kbd-inline-header";

  const heading = document.createElement("h2");
  heading.className = "kbd-inline-title";
  heading.textContent = "Keyboard Add-ons";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "kbd-inline-close";
  closeBtn.setAttribute("aria-label", "Close settings");
  closeBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  closeBtn.addEventListener("click", () => {
    const nativeClose = dialog.querySelector(
      'header[data-component="ModalHeader"] button[aria-label="Close settings"]',
    );
    deactivateInlineSettings();
    if (nativeClose) {
      nativeClose.click();
    }
  });

  header.append(heading, closeBtn);

  const body = document.createElement("div");
  body.className = "kbd-inline-body";

  shadow.append(header, body);

  const ui = mountSettingsUI(body);
  const stopTheme = observeTodoistTheme((theme) => {
    panelHost.setAttribute("data-theme", theme);
  });

  nativePanel.parentElement.insertBefore(panelHost, nativePanel.nextSibling);

  activeState = {
    dialog,
    injectedTab,
    previouslyActiveTab,
    nativePanel,
    panelHost,
    ui,
    stopTheme,
  };
}

function buildSidebarTab(templateTab) {
  const tab = templateTab.cloneNode(true);
  tab.setAttribute(TAB_ATTR, "1");
  tab.id = "todoist-kbd-settings-tab";
  tab.setAttribute("href", "#keyboard-addons");
  tab.removeAttribute("aria-controls");
  tab.removeAttribute("data-discover");
  setTabActiveAttrs(tab, false);

  const svg = tab.querySelector("svg");
  if (svg && svg.parentElement) {
    svg.parentElement.innerHTML = KEYBOARD_ICON_SVG;
  }

  // Replace the label text inside the cloned tab while preserving native wrapper structure
  const labelSpan = tab.querySelector("span");
  if (labelSpan) {
    const innerDiv = labelSpan.querySelector("div");
    if (innerDiv) {
      innerDiv.textContent = "Keyboard Add-ons";
    } else {
      labelSpan.textContent = "Keyboard Add-ons";
    }
  } else {
    tab.textContent = "Keyboard Add-ons";
  }

  return tab;
}

function syncSettingsDialog() {
  const dialog = findSettingsDialog();
  if (!dialog) {
    if (activeState) deactivateInlineSettings();
    return;
  }

  // Clean up if our previously tracked dialog was replaced
  if (activeState && activeState.dialog !== dialog) {
    deactivateInlineSettings();
  }

  const nativeTabs = Array.from(
    dialog.querySelectorAll(
      `a[role="tab"][href*="/app/settings/"]:not([${TAB_ATTR}])`,
    ),
  );
  if (!nativeTabs.length) return;

  const group = nativeTabs[0].parentElement;
  if (!group) return;

  // Bind delegated deactivation listener once per sidebar group
  if (!group.dataset.kbdSettingsBound) {
    group.dataset.kbdSettingsBound = "1";
    group.addEventListener(
      "click",
      (e) => {
        const clickedNativeTab = e.target?.closest?.(
          `a[role="tab"]:not([${TAB_ATTR}])`,
        );
        if (clickedNativeTab && activeState) {
          deactivateInlineSettings(clickedNativeTab);
        }
      },
      true,
    );
  }

  if (group.querySelector(`[${TAB_ATTR}]`)) return;

  const templateTab =
    nativeTabs.find((t) => t.getAttribute("aria-selected") !== "true") ||
    nativeTabs[nativeTabs.length - 1];
  const tab = buildSidebarTab(templateTab);

  tab.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    activateInlineSettings(dialog, tab);
  });

  group.appendChild(tab);
}

export function initSettingsPageInjector() {
  syncSettingsDialog();

  const observer = new MutationObserver(() => {
    syncSettingsDialog();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export function onSettingsRouteChange() {
  if (activeState) {
    deactivateInlineSettings();
  }
  // Give React a microtask/frame to mount or update the Settings dialog
  setTimeout(syncSettingsDialog, 50);
}
