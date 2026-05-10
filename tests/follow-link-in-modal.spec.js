import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

test('Alt+K follows link in task description when modal is open', async ({ page, context }) => {
  // Minimal chrome API mock — content.js reads shortcuts and settings from
  // storage on init; we return empty objects so defaults are used.
  await page.addInitScript(() => {
    window.chrome = {
      storage: {
        sync: { get: (_keys, cb) => cb({}) },
        onChanged: { addListener: () => {} },
      },
    };
  });

  await page.goto(`file://${path.join(ROOT, 'tests/fixtures/follow-link-in-modal-sample.html')}`);

  // Inject the content script into this page
  await page.addScriptTag({ path: path.join(ROOT, 'content.js') });

  // Sanity check: the description link IS in the DOM
  const descLink = page.locator(
    '[data-testid="task-details-modal"] .task-overview-description a[target="_blank"]',
  );
  await expect(descLink).toBeVisible();

  // Alt+K should open the link in a new tab
  const newPagePromise = context.waitForEvent('page');

  await page.keyboard.down('Alt');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Alt');

  const newPage = await newPagePromise;
  expect(newPage.url()).toContain('example.com');
  await newPage.close();
});
