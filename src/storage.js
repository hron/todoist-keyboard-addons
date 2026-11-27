// ---------------------------------------------------------------------------
// Userscript storage adapter (GM_getValue / GM_setValue / GM_addValueChangeListener)
// ---------------------------------------------------------------------------

import {
  DBG,
  WARN,
  getDefaultSettingsMap,
  getDefaultShortcutsMap,
} from "./defaults.js";

const STORAGE_KEY_SHORTCUTS = "shortcuts";
const STORAGE_KEY_SETTINGS = "settings";

let liveShortcuts = getDefaultShortcutsMap();
let liveSettings = getDefaultSettingsMap();

const subscribers = new Set();

function notifySubscribers() {
  for (const cb of subscribers) {
    try {
      cb({ shortcuts: liveShortcuts, settings: liveSettings });
    } catch (err) {
      WARN("Storage subscriber error:", err);
    }
  }
}

function gmGet(key, fallback) {
  if (typeof GM_getValue === "function") {
    return GM_getValue(key, fallback);
  }
  return fallback;
}

function gmSet(key, value) {
  if (typeof GM_setValue === "function") {
    GM_setValue(key, value);
  }
}

function mergeShortcuts(saved) {
  const defaults = getDefaultShortcutsMap();
  if (!saved || typeof saved !== "object") return defaults;
  return { ...defaults, ...saved };
}

function mergeSettings(saved) {
  const defaults = getDefaultSettingsMap();
  if (!saved || typeof saved !== "object") return defaults;
  return { ...defaults, ...saved };
}

export function initStorage() {
  const savedShortcuts = gmGet(STORAGE_KEY_SHORTCUTS, null);
  const savedSettings = gmGet(STORAGE_KEY_SETTINGS, null);

  liveShortcuts = mergeShortcuts(savedShortcuts);
  liveSettings = mergeSettings(savedSettings);
  DBG("Loaded shortcuts & settings from GM storage", {
    liveShortcuts,
    liveSettings,
  });

  if (typeof GM_addValueChangeListener === "function") {
    GM_addValueChangeListener(
      STORAGE_KEY_SHORTCUTS,
      (_name, _oldVal, newVal, remote) => {
        if (!remote) return;
        liveShortcuts = mergeShortcuts(newVal);
        DBG("Shortcuts updated from another tab", liveShortcuts);
        notifySubscribers();
      },
    );

    GM_addValueChangeListener(
      STORAGE_KEY_SETTINGS,
      (_name, _oldVal, newVal, remote) => {
        if (!remote) return;
        liveSettings = mergeSettings(newVal);
        DBG("Settings updated from another tab", liveSettings);
        notifySubscribers();
      },
    );
  }
}

export function getShortcuts() {
  return liveShortcuts;
}

export function getSettings() {
  return liveSettings;
}

export function setShortcut(id, shortcut) {
  liveShortcuts = { ...liveShortcuts, [id]: { ...shortcut } };
  gmSet(STORAGE_KEY_SHORTCUTS, liveShortcuts);
  notifySubscribers();
}

export function setSetting(id, value) {
  liveSettings = { ...liveSettings, [id]: Boolean(value) };
  gmSet(STORAGE_KEY_SETTINGS, liveSettings);
  notifySubscribers();
}

export function restoreAllDefaults() {
  liveShortcuts = getDefaultShortcutsMap();
  liveSettings = getDefaultSettingsMap();
  gmSet(STORAGE_KEY_SHORTCUTS, liveShortcuts);
  gmSet(STORAGE_KEY_SETTINGS, liveSettings);
  notifySubscribers();
}

export function subscribeStorage(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
