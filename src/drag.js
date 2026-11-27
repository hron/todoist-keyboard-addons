// ---------------------------------------------------------------------------
// Task list focus, task detail modal helpers, and drag-and-drop reordering
// ---------------------------------------------------------------------------

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

// The mouse pointer id is 0 in Firefox and 1 in Chrome. The drag library calls
// setPointerCapture(pointerId), which throws for an id that doesn't exist.
const MOUSE_POINTER_ID = navigator.userAgent.includes("Firefox/") ? 0 : 1;

// Todoist's drag sensor ignores pointers that are not the primary mouse one.
// `pressed` mirrors a real drag: left button held and pressure 0.5, except on
// release.
function pointerOpts(x, y, pressed = true) {
  return {
    ...mouseOpts(x, y),
    pointerId: MOUSE_POINTER_ID,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    buttons: pressed ? 1 : 0,
    pressure: pressed ? 0.5 : 0,
  };
}

export function getTaskModal() {
  return document.querySelector('div[data-testid="task-details-modal"]');
}

export function getModalScrollContainer() {
  const modal = getTaskModal();
  if (!modal) return null;
  return modal.querySelector('div[data-testid="task-main-content-container"]');
}

/**
 * Find the currently focused / cursor-selected task list item.
 */
export function getFocusedTask() {
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
      if (el) return el;
    } catch {
      // :has() may not be supported everywhere
    }
  }

  let el = document.activeElement;
  while (el && el !== document.body) {
    if (el.matches && el.matches("li.task_list_item")) {
      return el;
    }
    el = el.parentElement;
  }

  const hovered = document.querySelector("li.task_list_item:hover");
  if (hovered) return hovered;

  return null;
}

export function getTaskList() {
  return Array.from(
    document.querySelectorAll("li.task_list_item:not(.reorder_item)"),
  );
}

export function getTaskListPageSize(tasks) {
  if (!tasks || tasks.length === 0) return 10;
  const itemHeight = tasks[0].getBoundingClientRect().height;
  if (!itemHeight) return 10;
  return Math.max(1, Math.floor(window.innerHeight / itemHeight));
}

export function getFirstVisibleTask(tasks) {
  const vpBottom = window.innerHeight;
  for (const task of tasks) {
    const rect = task.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < vpBottom) return task;
  }
  return tasks[0] || null;
}

export function focusTaskListItem(item) {
  if (!item) return;
  const body = item.querySelector(".task_list_item__body");
  if (body) body.focus();
}

export function getModalSubtasks(modal) {
  return Array.from(
    modal.querySelectorAll("li.task_list_item:not(.reorder_item)"),
  );
}

export function getFocusedSubtask(modal) {
  const selectors = [
    'li.task_list_item[data-is-drag-target="true"]',
    "li.task_list_item.selected",
    'li.task_list_item[aria-selected="true"]',
    "li.task_list_item:focus-within",
    "li.task_list_item:has(:focus)",
  ];
  for (const sel of selectors) {
    try {
      const el = modal.querySelector(sel);
      if (el) return el;
    } catch {}
  }
  let el = document.activeElement;
  while (el && el !== document.body) {
    if (el.matches?.("li.task_list_item") && modal.contains(el)) return el;
    el = el.parentElement;
  }
  return null;
}

export function focusModalSubtask(subtasks, targetIdx) {
  const target = subtasks[targetIdx];
  if (!target) return;
  focusTaskListItem(target);
  target.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

export function getModalSubtaskPageSize(subtasks) {
  const container = getModalScrollContainer();
  if (!container || !subtasks.length) return 10;
  const itemHeight = subtasks[0].getBoundingClientRect().height;
  if (!itemHeight) return 10;
  return Math.max(1, Math.floor(container.clientHeight / itemHeight));
}

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
    if (el) return el;
  }

  return null;
}

async function simulateDrag(task, target, direction) {
  if (dragInProgress) return;
  dragInProgress = true;

  try {
    // 1. Reveal the drag handle by hovering the task.
    task.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    task.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    task.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
    await sleep(20);

    const handle = findDragHandle(task);
    if (!handle) return;

    const from = centre(handle);
    const to = centre(target);
    const overshoot = direction * 10;
    const destY = to.y + overshoot;

    // 2. pointerdown + mousedown on the drag handle
    handle.dispatchEvent(
      new PointerEvent("pointerdown", pointerOpts(from.x, from.y)),
    );
    handle.dispatchEvent(
      new MouseEvent("mousedown", mouseOpts(from.x, from.y)),
    );
    await sleep(10);

    // A real drag captures the pointer on <body>, so later events can't be lost
    // if Todoist re-renders and detaches the handle mid-drag.
    const captured = document.body;

    captured.dispatchEvent(
      new PointerEvent(
        "pointermove",
        pointerOpts(from.x, from.y + direction * 2),
      ),
    );
    captured.dispatchEvent(
      new MouseEvent("mousemove", mouseOpts(from.x, from.y + direction * 2)),
    );
    await sleep(10);

    // 3. Animated mousemove — interpolate over ~15 frames / ~75 ms.
    const frames = 15;
    for (let i = 1; i <= frames; i++) {
      const t = i / frames;
      const ease = (1 - Math.cos(Math.PI * t)) / 2;
      const curY = from.y + (destY - from.y) * ease;
      captured.dispatchEvent(
        new PointerEvent("pointermove", pointerOpts(from.x, curY)),
      );
      captured.dispatchEvent(
        new MouseEvent("mousemove", mouseOpts(from.x, curY)),
      );
      await sleep(5);
    }

    // 4. pointerup + mouseup at destination
    captured.dispatchEvent(
      new PointerEvent("pointerup", pointerOpts(from.x, destY, false)),
    );
    captured.dispatchEvent(
      new MouseEvent("mouseup", mouseOpts(from.x, destY)),
    );

    // 5. Clean up hover
    task.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
    task.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
  } finally {
    await sleep(10);
    dragInProgress = false;
  }
}

function refocusTask(taskId) {
  if (!taskId) return;

  let done = false;

  const stealFocusBack = () => {
    if (done) return;
    const currentFocusId = document.activeElement
      ?.closest?.("li.task_list_item")
      ?.getAttribute("data-item-id");

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

  document.addEventListener("focusin", stealFocusBack, true);
  stealFocusBack();

  setTimeout(() => {
    if (!done) cleanup();
  }, 500);
}

/**
 * Move the focused task up or down by one position.
 * @param {"up"|"down"} direction
 */
export async function moveTask(direction) {
  const task = getFocusedTask();
  if (!task) return;

  const taskId = task.getAttribute("data-item-id");
  const tasks = getTaskList();
  const idx = tasks.indexOf(task);
  if (idx === -1) return;

  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= tasks.length) return;

  await simulateDrag(task, tasks[targetIdx], direction === "up" ? -1 : 1);
  return refocusTask(taskId);
}
