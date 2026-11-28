import { test, expect } from "@playwright/test";
import { installGmMock, USERSCRIPT_PATH } from "./gm-mock.js";

function setupTodoistSidebarMock() {
  document.documentElement.setAttribute("data-appearance", "light");
  window.__mEvents = [];
  window.__ctrlBEvents = [];
  window.__sidebarOpen = true;

  // Mimic Todoist's native `m` shortcut listener on document
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "m" &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.shiftKey &&
      !e.metaKey
    ) {
      window.__mEvents.push({
        key: e.key,
        code: e.code,
        isTrusted: e.isTrusted,
        targetTag: e.target?.tagName,
      });
      window.__sidebarOpen = !window.__sidebarOpen;
    }
    if (e.code === "KeyB" && (e.ctrlKey || e.metaKey)) {
      window.__ctrlBEvents.push({
        defaultPrevented: e.defaultPrevented,
        repeat: e.repeat,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
      });
    }
  });
}

test("Ctrl+B dispatches native 'm' keydown to toggle sidebar and ignores auto-repeat", async ({
  page,
}) => {
  await installGmMock(page);
  await page.setContent(`
    <main tabindex="-1" id="main">
      <button aria-controls="sidebar" aria-expanded="true" aria-label="Open/close sidebar">Sidebar</button>
    </main>
  `);
  await page.evaluate(setupTodoistSidebarMock);
  await page.addScriptTag({ path: USERSCRIPT_PATH });

  // First Ctrl+B closes sidebar
  await page.keyboard.press("Control+KeyB");
  let state = await page.evaluate(() => ({
    open: window.__sidebarOpen,
    mCount: window.__mEvents.length,
    lastM: window.__mEvents.at(-1),
  }));
  expect(state.open).toBe(false);
  expect(state.mCount).toBe(1);
  expect(state.lastM.key).toBe("m");
  expect(state.lastM.code).toBe("KeyM");

  // Second Ctrl+B reopens sidebar
  await page.keyboard.press("Control+KeyB");
  state = await page.evaluate(() => ({
    open: window.__sidebarOpen,
    mCount: window.__mEvents.length,
  }));
  expect(state.open).toBe(true);
  expect(state.mCount).toBe(2);

  // Auto-repeat Ctrl+B is prevented (so browser shortcuts don't fire) but does NOT re-toggle
  const repeatPrevented = await page.evaluate(() => {
    const ev = new KeyboardEvent("keydown", {
      key: "b",
      code: "KeyB",
      ctrlKey: true,
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(repeatPrevented).toBe(true);
  expect(await page.evaluate(() => window.__mEvents.length)).toBe(2);
});

test("Ctrl+B is skipped while editing text so bold formatting keeps working", async ({
  page,
}) => {
  await installGmMock(page);
  await page.setContent(`
    <main id="main">
      <input id="text-input" type="text" value="hello" />
      <textarea id="text-area">world</textarea>
      <div id="rich-editor" contenteditable="true">bold me</div>
    </main>
  `);
  await page.evaluate(setupTodoistSidebarMock);
  await page.addScriptTag({ path: USERSCRIPT_PATH });

  for (const selector of ["#text-input", "#text-area", "#rich-editor"]) {
    await page.locator(selector).focus();
    await page.keyboard.press("Control+KeyB");
  }

  const result = await page.evaluate(() => ({
    mCount: window.__mEvents.length,
    ctrlBCount: window.__ctrlBEvents.length,
    anyPrevented: window.__ctrlBEvents.some((e) => e.defaultPrevented),
  }));
  expect(result.mCount).toBe(0);
  expect(result.ctrlBCount).toBe(3);
  expect(result.anyPrevented).toBe(false);
});

test("Ctrl+B is skipped when a modal or dialog is open", async ({ page }) => {
  await installGmMock(page);
  await page.setContent(`<main id="main"></main>`);
  await page.evaluate(setupTodoistSidebarMock);
  await page.addScriptTag({ path: USERSCRIPT_PATH });

  // 1. Native dialog ([role="dialog"])
  await page.evaluate(() => {
    const dlg = document.createElement("div");
    dlg.id = "dlg";
    dlg.setAttribute("role", "dialog");
    document.body.appendChild(dlg);
  });
  await page.keyboard.press("Control+KeyB");
  expect(await page.evaluate(() => window.__mEvents.length)).toBe(0);

  // 2. Task details modal
  await page.evaluate(() => {
    document.getElementById("dlg").remove();
    const modal = document.createElement("div");
    modal.id = "task-modal";
    modal.setAttribute("data-testid", "task-details-modal");
    document.body.appendChild(modal);
  });
  await page.keyboard.press("Control+KeyB");
  expect(await page.evaluate(() => window.__mEvents.length)).toBe(0);

  // 3. Standalone userscript settings modal
  await page.evaluate(() => {
    document.getElementById("task-modal").remove();
    window.__gmMock.triggerMenu("Settings");
  });
  await page.keyboard.press("Control+KeyB");
  expect(await page.evaluate(() => window.__mEvents.length)).toBe(0);

  // Close settings modal -> Ctrl+B works again
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+KeyB");
  expect(await page.evaluate(() => window.__mEvents.length)).toBe(1);
});

test("uses Cmd+B by default on macOS and shows Global section first in Settings", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });
  });
  await installGmMock(page);
  await page.goto("about:blank");
  await page.setContent(`<main id="main"></main>`);
  await page.evaluate(setupTodoistSidebarMock);
  await page.addScriptTag({ path: USERSCRIPT_PATH });

  // Ctrl+B should NOT fire on macOS default
  await page.keyboard.press("Control+KeyB");
  expect(await page.evaluate(() => window.__mEvents.length)).toBe(0);

  // Cmd+B (Meta+KeyB) SHOULD fire on macOS default
  await page.keyboard.press("Meta+KeyB");
  expect(await page.evaluate(() => window.__mEvents.length)).toBe(1);

  // Settings UI shows Global as the first section with Cmd + B
  await page.evaluate(() => window.__gmMock.triggerMenu("Settings"));
  const modalHost = page.locator('[data-kbd-settings-modal="1"]');
  const firstHeader = modalHost.locator("tr.kbd-group-header td").first();
  await expect(firstHeader).toHaveText("Global");

  const shortcutInput = modalHost.locator('.key-input[data-id="toggleSidebar"]');
  await expect(shortcutInput).toHaveText("Cmd + B");
});

test("rebinding toggleSidebar works and binding to plain M does not recurse", async ({
  page,
}) => {
  await installGmMock(page);
  await page.setContent(`<main id="main"></main>`);
  await page.evaluate(setupTodoistSidebarMock);
  await page.addScriptTag({ path: USERSCRIPT_PATH });

  // Open settings and rebind toggleSidebar to Alt+B
  await page.evaluate(() => window.__gmMock.triggerMenu("Settings"));
  const modalHost = page.locator('[data-kbd-settings-modal="1"]');
  const shortcutInput = modalHost.locator('.key-input[data-id="toggleSidebar"]');
  await expect(shortcutInput).toHaveText("Ctrl + B");

  await shortcutInput.click();
  await page.keyboard.press("Alt+KeyB");
  await expect(shortcutInput).toHaveText("Alt + B");
  await page.keyboard.press("Escape");

  // Old Ctrl+B no longer triggers; Alt+B triggers
  await page.keyboard.press("Control+KeyB");
  expect(await page.evaluate(() => window.__mEvents.length)).toBe(0);
  await page.keyboard.press("Alt+KeyB");
  expect(await page.evaluate(() => window.__mEvents.length)).toBe(1);

  // Rebind to plain M -> should pass through cleanly without infinite recursion
  await page.evaluate(() => window.__gmMock.triggerMenu("Settings"));
  await modalHost.locator('.key-input[data-id="toggleSidebar"]').click();
  await page.keyboard.press("KeyM");
  await page.keyboard.press("Escape");

  await page.keyboard.press("KeyM");
  expect(await page.evaluate(() => window.__mEvents.length)).toBe(2);
});
