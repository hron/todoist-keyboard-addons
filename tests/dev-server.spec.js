import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { createDevServer } from "../scripts/dev-server.mjs";
import { installGmMock, ROOT } from "./gm-mock.js";

test("build outputs matching .user.js and lightweight .meta.js with release update URLs", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, "package.json"), "utf8"),
  );
  const metaPath = path.join(ROOT, "dist", "todoist-keyboard-addons.meta.js");
  const userPath = path.join(ROOT, "dist", "todoist-keyboard-addons.user.js");

  const meta = fs.readFileSync(metaPath, "utf8");
  const user = fs.readFileSync(userPath, "utf8");

  expect(meta).toContain(`// @version      ${pkg.version}`);
  expect(meta).toContain(
    "// @downloadURL  https://github.com/hron/todoist-keyboard-addons/releases/latest/download/todoist-keyboard-addons.user.js",
  );
  expect(meta).toContain(
    "// @updateURL    https://github.com/hron/todoist-keyboard-addons/releases/latest/download/todoist-keyboard-addons.meta.js",
  );
  expect(user.startsWith(meta)).toBe(true);
  expect(meta.length).toBeLessThan(user.length / 10);
});

test("dev server serves loader + fresh bundle and bridges GM_* APIs under strict nonce CSP", async ({
  page,
}) => {
  const server = createDevServer({ port: 0, log: false });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Verify HTTP endpoints & headers
    const loaderRes = await fetch(`${baseUrl}/dev-loader.user.js`);
    expect(loaderRes.status).toBe(200);
    expect(loaderRes.headers.get("cache-control")).toContain("no-store");
    const loaderCode = await loaderRes.text();
    expect(loaderCode).toContain("Todoist Keyboard Add-ons (Local Dev)");
    expect(loaderCode).toContain(
      `http://127.0.0.1:${port}/dist/todoist-keyboard-addons.user.js`,
    );

    const bundleRes = await fetch(
      `${baseUrl}/dist/todoist-keyboard-addons.user.js`,
    );
    expect(bundleRes.status).toBe(200);
    expect(bundleRes.headers.get("x-tka-build-hash")).toMatch(/^[0-9a-f]{8}$/);
    const bundleCode = await bundleRes.text();
    expect(bundleCode).toContain("// ==UserScript==");

    // 2. Serve a strict-CSP Todoist-like HTML page (nonce-only, NO unsafe-eval)
    const NONCE = "test-nonce-xyz";
    await page.route("https://app.todoist.com/app/today", (route) =>
      route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy": `script-src 'nonce-${NONCE}' 'strict-dynamic'`,
        },
        body: `<!doctype html>
          <html data-appearance="light" data-csp-nonce="${NONCE}">
            <head><script nonce="${NONCE}">window.__pageReady = true;</script></head>
            <body><div id="app">Todoist Mock</div></body>
          </html>`,
      }),
    );

    await installGmMock(page, { settings: { showParentTask: true } });

    // Wire GM_xmlhttpRequest to return the freshly served dev bundle
    await page.addInitScript(
      ({ bundleText, hash }) => {
        window.GM_xmlhttpRequest = ({ onload }) => {
          onload({
            status: 200,
            responseText: bundleText,
            responseHeaders: `x-tka-build-hash: ${hash}\r\n`,
          });
        };
      },
      {
        bundleText: bundleCode,
        hash: bundleRes.headers.get("x-tka-build-hash"),
      },
    );

    const consoleLogs = [];
    page.on("console", (msg) => consoleLogs.push(msg.text()));

    await page.goto("https://app.todoist.com/app/today");

    // Execute the dev loader inside the strict-CSP page
    await page.evaluate((code) => {
      // Simulate Tampermonkey running the dev loader script in its sandbox
      const fn = new Function(code);
      fn();
    }, loaderCode);

    // Confirm it executed via script-nonce (not unsafe-eval Function fallback)
    await expect
      .poll(() =>
        consoleLogs.some((line) => line.includes("via script-nonce")),
      )
      .toBe(true);

    // Wait for GM_registerMenuCommand("Settings") to be bridged and trigger it
    await expect
      .poll(async () => {
        try {
          await page.evaluate(() => window.__gmMock.triggerMenu("Settings"));
          return true;
        } catch {
          return false;
        }
      })
      .toBe(true);

    const modalHost = page.locator('[data-kbd-settings-modal="1"]');
    await expect(modalHost).toBeVisible();

    // Toggling inside the page-world bridged bundle must persist to sandbox GM_setValue
    const featureToggle = modalHost.locator("#feature-showParentTask");
    await expect(featureToggle).toBeChecked();
    await featureToggle.click();
    await expect(featureToggle).not.toBeChecked();

    const storeAfterToggle = await page.evaluate(() =>
      window.__gmMock.getStore(),
    );
    expect(storeAfterToggle.settings.showParentTask).toBe(false);

    // Remote cross-tab update via sandbox GM_addValueChangeListener must propagate into page-world UI
    await page.evaluate(() => {
      window.__gmMock.simulateRemoteChange("settings", {
        showParentTask: true,
      });
    });
    await expect(featureToggle).toBeChecked();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
