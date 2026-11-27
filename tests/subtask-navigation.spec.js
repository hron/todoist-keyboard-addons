import { test, expect } from "@playwright/test";
import { installGmMock, USERSCRIPT_PATH } from "./gm-mock.js";

test("modal navigation keys move focus between subtasks", async ({ page }) => {
  await installGmMock(page);

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

  await page.addScriptTag({ path: USERSCRIPT_PATH });

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
