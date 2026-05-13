import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

test("modal navigation keys move focus between subtasks", async ({ page }) => {
  await page.addInitScript(() => {
    window.chrome = {
      storage: {
        sync: { get: (_keys, cb) => cb({}) },
        onChanged: { addListener: () => {} },
      },
    };
  });

  await page.setContent(`
    <div data-testid="task-details-modal">
      <div data-testid="task-main-content-container" style="height: 80px; overflow: auto">
        <ul class="items" style="margin: 0; padding: 0">
          ${Array.from(
            { length: 5 },
            (_, idx) => `
              <li class="task_list_item" style="display: block; height: 40px">
                <div class="task_list_item__body" tabindex="0">Subtask ${idx + 1}</div>
              </li>
            `,
          ).join("")}
        </ul>
      </div>
    </div>
  `);
  await page.addScriptTag({ path: path.join(ROOT, "content.js") });

  const focusedSubtask = () =>
    page.locator(".task_list_item__body:focus").textContent();

  await page.keyboard.press("ArrowDown");
  await expect.poll(focusedSubtask).toBe("Subtask 1");

  await page.keyboard.press("PageDown");
  await expect.poll(focusedSubtask).toBe("Subtask 3");

  await page.keyboard.press("End");
  await expect.poll(focusedSubtask).toBe("Subtask 5");

  await page.keyboard.press("PageUp");
  await expect.poll(focusedSubtask).toBe("Subtask 3");

  await page.keyboard.press("Home");
  await expect.poll(focusedSubtask).toBe("Subtask 1");
});
