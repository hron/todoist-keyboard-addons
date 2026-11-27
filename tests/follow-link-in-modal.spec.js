import { test, expect } from "@playwright/test";
import path from "path";
import { installGmMock, ROOT, USERSCRIPT_PATH } from "./gm-mock.js";

test("Alt+K follows link in task description when modal is open", async ({
  page,
  context,
}) => {
  await installGmMock(page);

  // Fulfill external navigation offline so the test does not depend on network access
  await context.route("https://example.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body>Example Domain</body></html>",
    }),
  );

  await page.goto(
    `file://${path.join(ROOT, "tests/fixtures/follow-link-in-modal-sample.html")}`,
  );

  await page.addScriptTag({ path: USERSCRIPT_PATH });

  const descLink = page.locator(
    '[data-testid="task-details-modal"] .task-overview-description a[target="_blank"]',
  );
  await expect(descLink).toBeVisible();

  const newPagePromise = context.waitForEvent("page");

  await page.keyboard.down("Alt");
  await page.keyboard.press("KeyK");
  await page.keyboard.up("Alt");

  const newPage = await newPagePromise;
  await newPage.waitForLoadState("domcontentloaded");
  expect(newPage.url()).toContain("example.com");
  await newPage.close();
});
