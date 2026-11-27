import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const USERSCRIPT_PATH = path.join(
  ROOT,
  "dist",
  "todoist-keyboard-addons.user.js",
);

function setupGmMockInWindow(seed) {
  const store = structuredClone(seed);
  const listeners = new Map();
  const menuCommands = new Map();
  let nextListenerId = 1;

  window.GM_getValue = (key, fallback) =>
    key in store ? structuredClone(store[key]) : fallback;

  window.GM_setValue = (key, value) => {
    const oldVal = store[key];
    store[key] = structuredClone(value);
    const keyListeners = listeners.get(key);
    if (keyListeners) {
      for (const cb of keyListeners.values()) {
        cb(key, oldVal, structuredClone(value), false);
      }
    }
  };

  window.GM_addValueChangeListener = (key, cb) => {
    if (!listeners.has(key)) listeners.set(key, new Map());
    const id = nextListenerId++;
    listeners.get(key).set(id, cb);
    return id;
  };

  window.GM_registerMenuCommand = (label, cb) => {
    menuCommands.set(label, cb);
  };

  window.__gmMock = {
    getStore: () => structuredClone(store),
    triggerMenu: (label) => {
      const fn = menuCommands.get(label);
      if (!fn) throw new Error(`Menu command not registered: ${label}`);
      fn();
    },
    simulateRemoteChange: (key, newVal) => {
      const oldVal = store[key];
      store[key] = structuredClone(newVal);
      const keyListeners = listeners.get(key);
      if (keyListeners) {
        for (const cb of keyListeners.values()) {
          cb(key, oldVal, structuredClone(newVal), true);
        }
      }
    },
  };
}

/**
 * Install in-memory GM_* API mocks before the userscript executes.
 * Works for both `page.goto(...)` (via addInitScript) and `page.setContent(...)`
 * (via immediate evaluate on the current document).
 */
export async function installGmMock(page, initialStore = {}) {
  await page.addInitScript(setupGmMockInWindow, initialStore);
  await page.evaluate(setupGmMockInWindow, initialStore);
}
