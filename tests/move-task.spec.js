import { test, expect } from "@playwright/test";
import { installGmMock, USERSCRIPT_PATH } from "./gm-mock.js";

test("alt+shift+arrows move the focused task via a primary mouse pointer drag", async ({
  page,
}) => {
  await installGmMock(page);

  await page.setContent(`
    <ul class="items" style="margin: 0; padding: 0">
      ${[1, 2, 3]
        .map(
          (id) => `
            <li class="task_list_item" data-item-id="${id}" style="display: block; height: 40px">
              <div class="task_list_item__body" tabindex="0">Task ${id}</div>
              <span class="item_dnd_handle" style="display: inline-block; width: 10px; height: 10px"></span>
            </li>
          `,
        )
        .join("")}
    </ul>
  `);

  // Fake drag sensor: like Todoist's (dnd-kit), it only reacts to the primary
  // mouse pointer, and drops the dragged task where the pointer is released.
  await page.evaluate(() => {
    let dragged = null;
    const isPrimaryMouse = (e) => e.isPrimary && e.pointerType === "mouse";
    document.addEventListener("pointerdown", (e) => {
      if (!isPrimaryMouse(e)) return;
      dragged = e.target.closest("li.task_list_item");
    });
    document.addEventListener("pointerup", (e) => {
      if (!dragged || !isPrimaryMouse(e)) return;
      const items = Array.from(document.querySelectorAll("li.task_list_item"));
      const over = items.find((li) => {
        const r = li.getBoundingClientRect();
        return e.clientY >= r.top && e.clientY < r.bottom;
      });
      if (over && over !== dragged) {
        const after = items.indexOf(over) > items.indexOf(dragged);
        over.parentElement.insertBefore(
          dragged,
          after ? over.nextSibling : over,
        );
      }
      dragged = null;
    });
  });

  await page.addScriptTag({ path: USERSCRIPT_PATH });

  const order = () =>
    page
      .locator("li.task_list_item")
      .evaluateAll((els) => els.map((el) => el.dataset.itemId));
  const focusedTask = () =>
    page.locator(".task_list_item__body:focus").textContent();

  await page.locator("li[data-item-id='2'] .task_list_item__body").focus();

  await page.keyboard.press("Alt+Shift+ArrowDown");
  await expect.poll(order).toEqual(["1", "3", "2"]);
  await expect.poll(focusedTask).toBe("Task 2");

  await page.keyboard.press("Alt+Shift+ArrowUp");
  await expect.poll(order).toEqual(["1", "2", "3"]);
  await expect.poll(focusedTask).toBe("Task 2");
});
