// ---------------------------------------------------------------------------
// Todoist Keyboard Add-ons — content script
// Active only on app.todoist.com (see manifest.json)
// ---------------------------------------------------------------------------

const LOG = (...args) => console.log("[todoist-kbd]", ...args);
const WARN = (...args) => console.warn("[todoist-kbd]", ...args);

// ---- Drag-and-drop task reordering helpers --------------------------------

let dragInProgress = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function centre(el) {
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

function mouseOpts(x, y) {
  return {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
  };
}

/**
 * Find the currently focused / cursor-selected task list item.
 * We try multiple strategies since Todoist's DOM can vary.
 */
function getFocusedTask() {
  // Strategy 1: Todoist's own cursor/selection indicator
  const selectors = [
    'li.task_list_item[data-is-drag-target="true"]',
    "li.task_list_item.selected",
    'li.task_list_item[aria-selected="true"]',
    "li.task_list_item:focus-within",
    "li.task_list_item:has(:focus)",
  ];

  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        return el;
      }
    } catch {
      // :has() may not be supported everywhere
    }
  }

  // Strategy 2: walk up from document.activeElement
  let el = document.activeElement;
  while (el && el !== document.body) {
    if (el.matches && el.matches("li.task_list_item")) {
      return el;
    }
    el = el.parentElement;
  }

  // Strategy 3: hovered task (last resort)
  const hovered = document.querySelector("li.task_list_item:hover");
  if (hovered) {
    return hovered;
  }

  return null;
}

/**
 * Get all visible, non-placeholder task items in DOM order.
 */
function getTaskList() {
  return Array.from(
    document.querySelectorAll("li.task_list_item:not(.reorder_item)"),
  );
}

/**
 * Find the drag handle inside a task element.
 * Tries multiple selectors since Todoist may have changed class names.
 */
function findDragHandle(task) {
  const selectors = [
    ".item_dnd_handle",
    "[data-testid='task-drag-handle']",
    ".drag_and_drop_handle",
    "button.task_list_item__drag_handle",
    "span.drag_and_drop_handler",
    "[aria-label='Drag']",
    "[aria-roledescription='sortable']",
  ];

  for (const sel of selectors) {
    const el = task.querySelector(sel);
    if (el) {
      return el;
    }
  }

  return null;
}

/**
 * Simulate a drag-and-drop to move `task` to the position of `target`.
 * direction: -1 = up, +1 = down
 */
async function simulateDrag(task, target, direction) {
  if (dragInProgress) {
    return;
  }
  dragInProgress = true;

  try {
    // 1. Reveal the drag handle by hovering the task.
    task.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    task.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    task.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    await sleep(100); // give Todoist time to react and render the handle

    const handle = findDragHandle(task);
    if (!handle) {
      return;
    }

    const from = centre(handle);
    const to = centre(target);

    // We want to land slightly past the target's centre so the drop
    // registers on the correct side.
    const overshoot = direction * 10;
    const destY = to.y + overshoot;

    // 2. pointerdown + mousedown on the drag handle
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        ...mouseOpts(from.x, from.y),
        pointerId: 1,
      }),
    );
    handle.dispatchEvent(
      new MouseEvent("mousedown", mouseOpts(from.x, from.y)),
    );
    await sleep(10);

    // Some drag libraries need a small initial move to initiate the drag
    handle.dispatchEvent(
      new PointerEvent("pointermove", {
        ...mouseOpts(from.x, from.y + direction * 2),
        pointerId: 1,
      }),
    );
    handle.dispatchEvent(
      new MouseEvent("mousemove", mouseOpts(from.x, from.y + direction * 2)),
    );
    await sleep(20);

    // 3. Animated mousemove — interpolate over ~15 frames / ~75 ms.
    const frames = 15;
    for (let i = 1; i <= frames; i++) {
      const t = i / frames;
      const ease = (1 - Math.cos(Math.PI * t)) / 2;
      const curY = from.y + (destY - from.y) * ease;
      handle.dispatchEvent(
        new PointerEvent("pointermove", {
          ...mouseOpts(from.x, curY),
          pointerId: 1,
        }),
      );
      handle.dispatchEvent(
        new MouseEvent("mousemove", mouseOpts(from.x, curY)),
      );
      await sleep(5);
    }

    // 4. pointerup + mouseup at destination
    handle.dispatchEvent(
      new PointerEvent("pointerup", {
        ...mouseOpts(from.x, destY),
        pointerId: 1,
      }),
    );
    handle.dispatchEvent(new MouseEvent("mouseup", mouseOpts(from.x, destY)));

    // 5. Clean up hover
    task.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
    task.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
  } finally {
    await sleep(50);
    dragInProgress = false;
  }
}

/**
 * Re-engage Todoist's keyboard navigation focus on the moved task.
 *
 * Todoist's focus system works by:
 * - Adding class `task_list_item--keyboard_shortcuts_active` to the <li>
 * - Setting DOM focus on the `div.task_list_item__body[role="button"]` inside it
 *
 * After a drag-drop, Todoist asynchronously re-renders and steals focus
 * (typically to the parent/first task). We use a focusin listener to
 * detect when Todoist moves focus and override it back to our task.
 */
function refocusTask(taskId) {
  if (!taskId) return;

  let done = false;

  const stealFocusBack = () => {
    if (done) return;
    const currentFocusId = document.activeElement
      ?.closest?.("li.task_list_item")
      ?.getAttribute("data-item-id");

    // Already on our task — we're done
    if (currentFocusId === taskId) {
      cleanup();
      return;
    }

    const task = document.querySelector(
      `li.task_list_item[data-item-id="${taskId}"]`,
    );
    if (!task) return;

    const body = task.querySelector(".task_list_item__body");
    if (body) {
      body.focus();
      // Check if focus actually landed on our task and stop
      const newFocusId = document.activeElement
        ?.closest?.("li.task_list_item")
        ?.getAttribute("data-item-id");
      if (newFocusId === taskId) {
        cleanup();
      }
    }
  };

  const cleanup = () => {
    done = true;
    document.removeEventListener("focusin", stealFocusBack, true);
  };

  // Listen for any focus changes and redirect them to our task
  document.addEventListener("focusin", stealFocusBack, true);

  // Also do an immediate attempt
  stealFocusBack();

  // Hard timeout — stop after 500ms no matter what
  setTimeout(() => {
    if (!done) {
      cleanup();
    }
  }, 500);
}

/**
 * Move the focused task up or down by one position.
 * @param {"up"|"down"} direction
 */
async function moveTask(direction) {
  const task = getFocusedTask();
  if (!task) {
    return;
  }

  // Remember the task id so we can re-find it after drag
  const taskId = task.getAttribute("data-item-id");

  const tasks = getTaskList();
  const idx = tasks.indexOf(task);
  if (idx === -1) {
    return;
  }

  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= tasks.length) {
    return;
  }

  await simulateDrag(task, tasks[targetIdx], direction === "up" ? -1 : 1);

  // Restore Todoist's keyboard navigation focus on the moved task
  return refocusTask(taskId);
}

// ---- Keyboard event listener ----------------------------------------------

function maybeClick(event, selector) {
  const element = document.querySelector(selector);
  if (!element) return;
  event.preventDefault();
  element.click();
}

document.addEventListener("keydown", (event) => {
  // Alt+Shift+Up — move focused task up
  if (
    event.altKey &&
    event.shiftKey &&
    !event.metaKey &&
    event.key === "ArrowUp"
  ) {
    event.preventDefault();
    moveTask("up");
    return;
  }

  // Alt+Shift+Down — move focused task down
  if (
    event.altKey &&
    event.shiftKey &&
    !event.metaKey &&
    event.key === "ArrowDown"
  ) {
    event.preventDefault();
    moveTask("down");
    return;
  }

  // Alt+Up — click breadcrumb link (navigate to parent project)
  if (
    event.altKey &&
    !event.shiftKey &&
    !event.metaKey &&
    event.key === "ArrowUp"
  ) {
    const link = document.querySelector(
      'div[data-testid="task-detail-breadcrumbs"] > a',
    );
    if (link) {
      event.preventDefault();
      link.click();
    }
  }

  // Alt+o - click on "More actions"
  if (
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.code === "KeyO"
  ) {
    maybeClick(
      event,
      'header[data-component="ModalHeader"] button[aria-label="More actions"]',
    );
  }
});
