// ---------------------------------------------------------------------------
// Entry point — runs at @run-at document-start
// ---------------------------------------------------------------------------

import { refreshParentLabels } from "./parent-label.js";
import { installPointerCaptureShim } from "./pointer-capture-shim.js";
import { openSettingsModal } from "./settings-modal.js";
import {
  initSettingsPageInjector,
  onSettingsRouteChange,
} from "./settings-page.js";
import { isRecordingShortcut } from "./settings-ui.js";
import { initShortcuts, setRecordingGuard } from "./shortcuts.js";
import { initStorage, subscribeStorage } from "./storage.js";

// Must run synchronously at document-start before Todoist attaches drag handlers
installPointerCaptureShim();

function initNavigationWatcher() {
  const pageWin = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const nav = pageWin?.navigation || window.navigation;

  const handleNav = () => {
    refreshParentLabels();
    onSettingsRouteChange();
  };

  if (nav && typeof nav.addEventListener === "function") {
    nav.addEventListener("currententrychange", handleNav);
  } else {
    window.addEventListener("popstate", handleNav);
  }

  handleNav();
}

function bootstrap() {
  initStorage();
  setRecordingGuard(isRecordingShortcut);
  initShortcuts();
  initSettingsPageInjector();

  subscribeStorage(() => {
    refreshParentLabels();
  });

  if (typeof GM_registerMenuCommand === "function") {
    GM_registerMenuCommand("Settings", () => {
      openSettingsModal();
    });
  }

  initNavigationWatcher();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
} else {
  bootstrap();
}
