import { test, expect } from "@playwright/test";
import { installGmMock, USERSCRIPT_PATH } from "./gm-mock.js";

test("GM menu opens auto-saving settings modal with no Save button and embedded preview", async ({
  page,
}) => {
  await installGmMock(page);
  await page.setContent(`
    <div id="app">
      <button id="more-btn" aria-label="More actions">More</button>
    </div>
  `);
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-appearance", "light");
    const header = document.createElement("header");
    header.setAttribute("data-component", "ModalHeader");
    header.appendChild(document.getElementById("more-btn"));
    document.getElementById("app").appendChild(header);
    window.__moreClicks = 0;
    document
      .getElementById("more-btn")
      .addEventListener("click", () => window.__moreClicks++);
  });
  await page.addScriptTag({ path: USERSCRIPT_PATH });

  // Open settings modal via GM_registerMenuCommand("Settings")
  await page.evaluate(() => window.__gmMock.triggerMenu("Settings"));

  const modalHost = page.locator('[data-kbd-settings-modal="1"]');
  await expect(modalHost).toBeVisible();

  // No Save button should exist
  await expect(modalHost.locator("#btn-save")).toHaveCount(0);
  await expect(modalHost.getByRole("button", { name: /^Save$/i })).toHaveCount(
    0,
  );

  // Embedded base64 preview image renders offline
  const previewImg = modalHost.locator("img.kbd-feature-preview");
  await expect(previewImg).toBeVisible();
  const imgSrc = await previewImg.getAttribute("src");
  expect(imgSrc).toMatch(/^data:image\/png;base64,/);

  // Toggle feature -> immediately saved to GM storage without tearing down DOM node
  const featureToggle = modalHost.locator("#feature-showParentTask");
  await expect(featureToggle).toBeChecked();
  const handleBefore = await featureToggle.elementHandle();
  await featureToggle.click();
  await expect(featureToggle).not.toBeChecked();
  const sameNode = await handleBefore.evaluate((el) => el.isConnected);
  expect(sameNode).toBe(true);

  const groupHeaderAlign = await modalHost
    .locator("tr.kbd-group-header td")
    .first()
    .evaluate((el) => getComputedStyle(el).textAlign);
  expect(groupHeaderAlign).toBe("left");

  const storeAfterToggle = await page.evaluate(() =>
    window.__gmMock.getStore(),
  );
  expect(storeAfterToggle.settings.showParentTask).toBe(false);

  // Record a new shortcut for "moreActions" (Alt+M)
  const moreInput = modalHost.locator('.key-input[data-id="moreActions"]');
  await moreInput.click();
  await expect(moreInput).toHaveClass(/recording/);

  // Escape cancels recording WITHOUT closing the modal
  await page.keyboard.press("Escape");
  await expect(moreInput).not.toHaveClass(/recording/);
  await expect(modalHost).toBeVisible();

  // Record Alt+M -> saves immediately
  await moreInput.click();
  await page.keyboard.press("Alt+KeyM");
  await expect(moreInput).toHaveText("Alt + M");

  const storeAfterRecord = await page.evaluate(() =>
    window.__gmMock.getStore(),
  );
  expect(storeAfterRecord.shortcuts.moreActions.code).toBe("KeyM");
  expect(storeAfterRecord.shortcuts.moreActions.altKey).toBe(true);

  // Close modal with Escape and verify the new shortcut works live
  await page.keyboard.press("Escape");
  await expect(modalHost).toHaveCount(0);

  await page.keyboard.press("Alt+KeyM");
  await expect
    .poll(() => page.evaluate(() => window.__moreClicks))
    .toBe(1);

  // Simulate remote cross-tab update back to Alt+O
  await page.evaluate(() => {
    const store = window.__gmMock.getStore();
    store.shortcuts.moreActions = {
      key: "o",
      code: "KeyO",
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      label: "Alt + O",
    };
    window.__gmMock.simulateRemoteChange("shortcuts", store.shortcuts);
  });

  await page.keyboard.press("Alt+KeyO");
  await expect
    .poll(() => page.evaluate(() => window.__moreClicks))
    .toBe(2);
});

test("Todoist Settings dialog gets an inline Keyboard Add-ons tab that adapts to theme", async ({
  page,
}) => {
  await installGmMock(page);

  await page.setContent(`
    <div role="dialog" style="display: flex; width: 800px; height: 600px;">
      <div class="sidebar" style="width: 220px;">
        <div role="group">
          <a role="tab" href="/app/settings/account" aria-selected="false">
            <div class="icon"><svg width="24" height="24"></svg></div>
            <span><div>Account</div></span>
          </a>
          <a role="tab" href="/app/settings/general" aria-selected="true" aria-current="page" data-active-item="true">
            <div class="icon"><svg width="24" height="24"></svg></div>
            <span><div>General</div></span>
          </a>
        </div>
      </div>
      <div class="content-wrap" style="flex: 1; display: flex;">
        <div role="tabpanel" id="native-panel" style="flex: 1;">
          <header data-component="ModalHeader">
            <h2>General</h2>
            <button aria-label="Close settings" type="button">X</button>
          </header>
          <div id="native-general-body">Native General Settings</div>
        </div>
      </div>
    </div>
  `);
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-appearance", "light");
    // Mirror Todoist's React Router preventing full-page navigation on tab links
    for (const a of document.querySelectorAll('a[role="tab"]')) {
      a.addEventListener("click", (e) => e.preventDefault());
    }
    window.__nativeClosed = 0;
    document
      .querySelector('button[aria-label="Close settings"]')
      .addEventListener("click", () => window.__nativeClosed++);
  });

  await page.addScriptTag({ path: USERSCRIPT_PATH });

  // Sidebar tab should be injected automatically
  const injectedTab = page.locator('[data-kbd-settings-tab="1"]');
  await expect(injectedTab).toBeVisible();
  await expect(injectedTab).toHaveText("Keyboard Add-ons");

  // Click our tab -> hides native panel, shows inline panel
  await injectedTab.click();
  await expect(injectedTab).toHaveAttribute("aria-selected", "true");
  await expect(injectedTab).toHaveAttribute("data-active-item", "true");
  await expect(page.locator("#native-panel")).toBeHidden();

  const inlinePanel = page.locator('[data-kbd-settings-panel="1"]');
  await expect(inlinePanel).toBeVisible();
  await expect(inlinePanel).toHaveAttribute("data-theme", "light");

  // Switching Todoist appearance to dark updates inline panel theme live
  await page.evaluate(() =>
    document.documentElement.setAttribute("data-appearance", "dark"),
  );
  await expect(inlinePanel).toHaveAttribute("data-theme", "dark");

  // Restore defaults inside inline panel works immediately
  await inlinePanel.locator("#btn-restore").click();
  await expect(inlinePanel.locator("#status")).toHaveText("Defaults restored");

  // Clicking a native tab restores the native panel cleanly
  const generalTab = page.locator('a[href="/app/settings/general"]');
  await generalTab.click();
  await expect(page.locator("#native-panel")).toBeVisible();
  await expect(page.locator('[data-kbd-settings-panel="1"]')).toHaveCount(0);
  await expect(injectedTab).toHaveAttribute("aria-selected", "false");

  // Re-open our tab and click our header Close button -> delegates to Todoist's native Close settings button
  await injectedTab.click();
  await inlinePanel.locator('button[aria-label="Close settings"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__nativeClosed))
    .toBe(1);
});
