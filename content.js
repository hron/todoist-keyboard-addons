// ---------------------------------------------------------------------------
// Todoist Keyboard Add-ons — content script
// Active only on app.todoist.com (see manifest.json)
// ---------------------------------------------------------------------------

const LOG = (...args) => console.log("[todoist-kbd]", ...args);
const WARN = (...args) => console.warn("[todoist-kbd]", ...args);
const DBG = (...args) => console.debug("[todoist-kbd]", ...args);

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
 * Returns the number of task list items that fit in one viewport height.
 * Pass in the current task list array to avoid a redundant querySelectorAll.
 * Falls back to 10 if the list is empty or items have no height.
 */
function getTaskListPageSize(tasks) {
  if (!tasks || tasks.length === 0) return 10;
  const itemHeight = tasks[0].getBoundingClientRect().height;
  if (!itemHeight) return 10;
  return Math.max(1, Math.floor(window.innerHeight / itemHeight));
}

/**
 * Find the first task list item that is currently visible in the viewport.
 * "Visible" means its top edge is at or below 0 and its bottom edge is
 * above the viewport bottom — i.e. it is at least partially in view.
 */
function getFirstVisibleTask(tasks) {
  const vpBottom = window.innerHeight;
  for (const task of tasks) {
    const rect = task.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < vpBottom) return task;
  }
  return tasks[0] || null;
}

/**
 * Move Todoist keyboard-navigation focus to the given task list item.
 * Focuses the inner body div (role="button") which is what Todoist uses
 * for its own Up/Down arrow key navigation.
 */
function focusTaskListItem(item) {
  if (!item) return;
  const body = item.querySelector(".task_list_item__body");
  if (body) body.focus();
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
    await sleep(20); // give Todoist time to react and render the handle

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
    await sleep(10);

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
    await sleep(10);
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

// ---- Task detail modal helpers -------------------------------------------

/**
 * Find the task detail modal, or null if not open.
 */
function getTaskModal() {
  return document.querySelector('div[data-testid="task-details-modal"]');
}

/**
 * Get the scrollable subtask container inside the modal.
 */
function getModalScrollContainer() {
  const modal = getTaskModal();
  if (!modal) return null;
  return modal.querySelector('div[data-testid="task-main-content-container"]');
}

// ---- Keyboard shortcut configuration -------------------------------------

/**
 * Default shortcuts — kept in sync with options.js SHORTCUT_DEFAULTS.
 * These are used when the user has not saved any custom settings.
 *
 * Matching uses event.code for layout-independent alpha/digit keys and
 * event.key for everything else (arrows, etc.).
 */
const DEFAULT_SHORTCUTS = {
  moveUp: {
    key: "ArrowUp",
    code: "ArrowUp",
    altKey: true,
    ctrlKey: false,
    shiftKey: true,
    metaKey: false,
  },
  moveDown: {
    key: "ArrowDown",
    code: "ArrowDown",
    altKey: true,
    ctrlKey: false,
    shiftKey: true,
    metaKey: false,
  },
  goToParent: {
    key: "ArrowUp",
    code: "ArrowUp",
    altKey: true,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
  },
  moreActions: {
    key: "o",
    code: "KeyO",
    altKey: true,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
  },
  followLink: {
    key: "k",
    code: "KeyK",
    altKey: true,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
  },
  goToProject: {
    key: "G",
    code: "KeyG",
    altKey: false,
    ctrlKey: false,
    shiftKey: true,
    metaKey: false,
  },
  scrollSubtasksUp: {
    key: "PageUp",
    code: "PageUp",
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
  },
  scrollSubtasksDown: {
    key: "PageDown",
    code: "PageDown",
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
  },
  toggleCompleted: {
    key: "h",
    code: "KeyH",
    altKey: true,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
  },
  scrollToTop: {
    key: "Home",
    code: "Home",
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
  },
  scrollToBottom: {
    key: "End",
    code: "End",
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
  },
};

// Live shortcuts — populated on init, updated when storage changes.
let shortcuts = { ...DEFAULT_SHORTCUTS };

/** Load user's saved shortcuts from chrome.storage.sync (if any). */
function loadShortcuts() {
  if (!chrome?.storage?.sync) {
    WARN(
      "chrome.storage.sync unavailable — using default shortcuts. Reload the extension after granting the storage permission.",
    );
    return;
  }
  chrome.storage.sync.get(["shortcuts", "settings"], (data) => {
    if (data.shortcuts) {
      // Merge saved values over defaults so any new shortcuts still have a value
      shortcuts = { ...DEFAULT_SHORTCUTS, ...data.shortcuts };
      DBG("Shortcuts loaded from storage", shortcuts);
    }
    if (data.settings) {
      applySettings(data.settings);
    }
  });

  // Re-load whenever the user saves new settings in the options page
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.shortcuts) {
      shortcuts = { ...DEFAULT_SHORTCUTS, ...changes.shortcuts.newValue };
      DBG("Shortcuts updated from storage change", shortcuts);
    }
    if (changes.settings) {
      applySettings(changes.settings.newValue);
      onNavigate();
    }
  });
}

/**
 * Returns true when `event` matches the stored shortcut for `id`.
 *
 * Matching strategy:
 * - Modifiers must match exactly.
 * - For alpha/digit keys (code starts with "Key" or "Digit") we compare
 *   event.code so the shortcut works regardless of keyboard layout.
 * - For everything else (arrows, special keys) we compare event.key.
 */
function matchesShortcut(event, id) {
  const sc = shortcuts[id];
  if (!sc) return false;

  if (event.altKey !== sc.altKey) return false;
  if (event.ctrlKey !== sc.ctrlKey) return false;
  if (event.shiftKey !== sc.shiftKey) return false;
  if (event.metaKey !== sc.metaKey) return false;

  // Layout-independent match for letter/digit keys
  if (sc.code && (sc.code.startsWith("Key") || sc.code.startsWith("Digit"))) {
    return event.code === sc.code;
  }
  return event.key === sc.key;
}

/**
 * Returns true when the user is actively editing text (input, textarea,
 * or contentEditable element is focused).  Used to avoid intercepting
 * keystrokes that don't use dedicated modifier combos (e.g. Shift+G).
 */
function isEditing() {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (active.isContentEditable) return true;
  return false;
}

// ---- Keyboard event listener ----------------------------------------------

function maybeClick(event, selector) {
  const element = document.querySelector(selector);
  if (!element) return;
  event.preventDefault();
  element.click();
}

/**
 * Swallow an event completely so Todoist never sees it.
 * Prevents default behaviour AND stops the event from reaching any other
 * listeners (including Todoist's own keydown/keyup/keypress handlers).
 */
function swallowEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

document.addEventListener(
  "keydown",
  (event) => {
    // Move focused task up
    if (matchesShortcut(event, "moveUp")) {
      event.preventDefault();
      moveTask("up");
      return;
    }

    // Move focused task down
    if (matchesShortcut(event, "moveDown")) {
      event.preventDefault();
      moveTask("down");
      return;
    }

    // Navigate to parent project via breadcrumb
    if (matchesShortcut(event, "goToParent")) {
      const link = document.querySelector(
        'div[data-testid="task-detail-breadcrumbs"] > a',
      );
      if (link) {
        event.preventDefault();
        link.click();
      }
      return;
    }

    // Open "More actions" menu in task detail modal
    if (matchesShortcut(event, "moreActions")) {
      maybeClick(
        event,
        'header[data-component="ModalHeader"] button[aria-label="More actions"]',
      );
      return;
    }

    // Follow the first external link in the focused task or modal
    if (matchesShortcut(event, "followLink")) {
      const modal = getTaskModal();
      if (modal) {
        // Modal is open — look for link in the task name content area
        const link = modal.querySelector(".task_content a[target=_blank]");
        if (link) {
          event.preventDefault();
          link.click();
        }
        return;
      }
      const focusedTask = getFocusedTask();
      if (!focusedTask) return;
      const link = focusedTask.querySelector(
        ".task_list_item__content a[target=_blank]",
      );
      if (link) {
        event.preventDefault();
        link.click();
      }
      return;
    }

    // Go to project from task detail modal (extends native Shift+G)
    if (matchesShortcut(event, "goToProject")) {
      if (isEditing()) return;
      const modal = document.querySelector(
        'div[data-testid="task-details-modal"]',
      );
      if (!modal) return; // no modal — let native Shift+G handle it
      const link = modal.querySelector(
        'div[data-testid="task-detail-default-header"] > a',
      );
      if (link) {
        event.preventDefault();
        link.click();
      }
      return;
    }

    // Scroll subtasks up (PageUp) — modal: scroll subtask list; task list: move focus up one page
    if (matchesShortcut(event, "scrollSubtasksUp")) {
      // Never intercept while the user is typing in any input/textarea/contentEditable
      if (isEditing()) return;
      const container = getModalScrollContainer();
      if (container) {
        // Modal is open — scroll the subtask container
        event.preventDefault();
        container.scrollBy({
          top: -container.clientHeight,
          behavior: "smooth",
        });
      } else {
        // Task list view — move keyboard focus up by one page
        const tasks = getTaskList();
        if (!tasks.length) return;
        event.preventDefault();
        const pageSize = getTaskListPageSize(tasks);
        const current = getFocusedTask();
        const currentIdx = current ? tasks.indexOf(current) : -1;
        const fromIdx =
          currentIdx >= 0
            ? currentIdx
            : tasks.indexOf(getFirstVisibleTask(tasks));
        const targetIdx = Math.max(0, fromIdx - pageSize);
        const target = tasks[targetIdx];
        focusTaskListItem(target);
        target.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      return;
    }

    // Scroll subtasks down (PageDown) — modal: scroll subtask list; task list: move focus down one page
    if (matchesShortcut(event, "scrollSubtasksDown")) {
      // Never intercept while the user is typing in any input/textarea/contentEditable
      if (isEditing()) return;
      const container = getModalScrollContainer();
      if (container) {
        // Modal is open — scroll the subtask container
        event.preventDefault();
        container.scrollBy({ top: container.clientHeight, behavior: "smooth" });
      } else {
        // Task list view — move keyboard focus down by one page
        const tasks = getTaskList();
        if (!tasks.length) return;
        event.preventDefault();
        const pageSize = getTaskListPageSize(tasks);
        const current = getFocusedTask();
        const currentIdx = current ? tasks.indexOf(current) : -1;
        const fromIdx =
          currentIdx >= 0
            ? currentIdx
            : tasks.indexOf(getFirstVisibleTask(tasks));
        const targetIdx = Math.min(tasks.length - 1, fromIdx + pageSize);
        const target = tasks[targetIdx];
        focusTaskListItem(target);
        target.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      return;
    }

    // Home — modal: scroll subtask list to top; task list: focus first task
    if (matchesShortcut(event, "scrollToTop")) {
      // Never intercept while the user is typing in any input/textarea/contentEditable
      if (isEditing()) return;
      const container = getModalScrollContainer();
      if (container) {
        event.preventDefault();
        container.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const tasks = getTaskList();
        if (!tasks.length) return;
        event.preventDefault();
        focusTaskListItem(tasks[0]);
        tasks[0].scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      return;
    }

    // End — modal: scroll subtask list to bottom; task list: focus last task
    if (matchesShortcut(event, "scrollToBottom")) {
      // Never intercept while the user is typing in any input/textarea/contentEditable
      if (isEditing()) return;
      const container = getModalScrollContainer();
      if (container) {
        event.preventDefault();
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      } else {
        const tasks = getTaskList();
        if (!tasks.length) return;
        event.preventDefault();
        const last = tasks[tasks.length - 1];
        focusTaskListItem(last);
        last.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      return;
    }

    // Toggle show/hide completed subtasks in modal
    if (matchesShortcut(event, "toggleCompleted")) {
      if (isEditing()) return;
      const modal = getTaskModal();
      if (!modal) return; // only in modal
      const toggleBtn = modal.querySelector(
        'button[aria-label="Hide completed sub-tasks"], button[aria-label="Show completed sub-tasks"]',
      );
      if (toggleBtn) {
        event.preventDefault();
        toggleBtn.click();
      }
      return;
    }
  },
  true,
); // capture phase — run before Todoist's handlers

// ---- Parent-task label in filter / search views ---------------------------
//
// In filter and search views Todoist shows "ProjectName #" in the bottom-right
// corner of each task row.  For subtasks that label gives no context about
// what the parent task is.  This feature replaces it with
// "ProjectName › ParentTaskTitle" for subtasks, leaving top-level tasks
// unchanged.
//
// Data source: the `todoist.sync` IndexedDB that Todoist keeps locally —
// no extra API calls are made.

/** Feature flag — toggled via the options page. Default: enabled. */
let _showParentTask = true;

/**
 * Apply a settings object from chrome.storage.sync.
 * Called on initial load and on storage change events.
 */
function applySettings(settings) {
  if (!settings) return;
  if ("showParentTask" in settings) {
    _showParentTask = Boolean(settings.showParentTask);
    DBG("showParentTask =", _showParentTask);
  }
}

/** In-memory caches populated from IndexedDB. */
let _taskById = null; // Map<id, {content, parent_id, project_id}>
let _projectById = null; // Map<id, {name}>

/**
 * Load (or reload) the tasks and projects caches from IndexedDB.
 * Resolves when both stores have been read.
 */
function loadTodoistCache() {
  return new Promise((resolve) => {
    const req = indexedDB.open("todoist.sync");
    req.onerror = () => {
      WARN("Could not open todoist.sync IndexedDB");
      resolve();
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      let pending = 2;
      const done = () => {
        if (--pending === 0) {
          db.close();
          resolve();
        }
      };

      const taskMap = new Map();
      const projMap = new Map();

      // Read tasks
      try {
        const tx1 = db.transaction("tasks", "readonly");
        const cursor1 = tx1.objectStore("tasks").openCursor();
        cursor1.onsuccess = (ev) => {
          const c = ev.target.result;
          if (!c) {
            _taskById = taskMap;
            done();
            return;
          }
          const t = c.value;
          taskMap.set(t.id, {
            content: t.content,
            parent_id: t.parent_id || null,
            project_id: t.project_id,
          });
          c.continue();
        };
        cursor1.onerror = done;
      } catch {
        done();
      }

      // Read projects
      try {
        const tx2 = db.transaction("projects", "readonly");
        const cursor2 = tx2.objectStore("projects").openCursor();
        cursor2.onsuccess = (ev) => {
          const c = ev.target.result;
          if (!c) {
            _projectById = projMap;
            done();
            return;
          }
          const p = c.value;
          projMap.set(p.id, { name: p.name });
          c.continue();
        };
        cursor2.onerror = done;
      } catch {
        done();
      }
    };
  });
}

/**
 * Extract the task object from the React fiber attached to a
 * `li.task_list_item` element.  Returns null if not found.
 */
function getTaskFromFiber(li) {
  const key = Object.keys(li).find((k) => k.startsWith("__reactFiber"));
  if (!key) return null;
  let node = li[key];
  let depth = 0;
  while (node && depth < 20) {
    const props = node.memoizedProps;
    if (props && props.task && props.task.id) return props.task;
    node = node.return;
    depth++;
  }
  return null;
}

/**
 * Augment the project label of a single task list item.
 * If the task has a parent, the label becomes "Project › Parent Title".
 * Top-level tasks are left untouched.
 * Already-augmented nodes are skipped (idempotent).
 */
function augmentTaskLabel(li) {
  if (!_taskById || !_projectById) return;

  // Skip if already processed
  if (li.dataset.kbdParentAugmented === "1") return;

  const fiberTask = getTaskFromFiber(li);
  const taskId = fiberTask ? fiberTask.id : li.getAttribute("data-item-id");
  if (!taskId) return;

  const task = _taskById.get(taskId);
  if (!task || !task.parent_id) return; // top-level task — nothing to do

  const parent = _taskById.get(task.parent_id);
  if (!parent) return; // parent not in cache yet

  // Find the project link element rendered by Todoist
  // It's an <a> that points to the project page and contains the project name text
  const projectLink = li.querySelector('a[href*="/app/project/"]');
  if (!projectLink) return;

  // The link's child structure is typically:
  //   <div>  ← styled project name (coloured dot/icon + "ProjectName" text)
  //   <svg>  ← hash "#" icon
  // We want to insert " › ParentTaskTitle" between the div and the svg.

  // Remove any text nodes we previously injected (idempotency guard is above,
  // but just in case)
  for (const node of Array.from(projectLink.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) node.remove();
  }

  const svg = projectLink.querySelector("svg");
  const separatorText = document.createTextNode(
    `\u00a0›\u00a0${parent.content}`,
  );

  if (svg) {
    projectLink.insertBefore(separatorText, svg);
  } else {
    projectLink.appendChild(separatorText);
  }

  // Widen the element so the longer text doesn't get clipped
  projectLink.style.maxWidth = "none";

  li.dataset.kbdParentAugmented = "1";
}

/**
 * Run augmentation on all currently visible task list items.
 */
function augmentAllVisibleTasks() {
  if (!_taskById || !_projectById || !_showParentTask) return;
  for (const li of document.querySelectorAll(
    "li.task_list_item:not(.reorder_item)",
  )) {
    augmentTaskLabel(li);
  }
}

/**
 * Returns true when the current page is a filter or search view.
 */
function isFilterOrSearchView() {
  return /\/(filter|search|today|upcoming)(\/|$)/.test(
    window.location.pathname,
  );
}

/** MutationObserver that watches for new task items being added (virtualised list). */
let _filterViewObserver = null;

/**
 * Start observing the task list for new items (virtualised scroll).
 * Called when we enter a filter/search view.
 */
function startFilterViewObserver() {
  if (_filterViewObserver) return; // already running
  _filterViewObserver = new MutationObserver((mutations) => {
    if (!isFilterOrSearchView() || !_showParentTask) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (
          node.matches &&
          node.matches("li.task_list_item:not(.reorder_item)")
        ) {
          augmentTaskLabel(node);
        }
        // Also check descendants (in case a whole subtree was added)
        for (const li of node.querySelectorAll
          ? node.querySelectorAll("li.task_list_item:not(.reorder_item)")
          : []) {
          augmentTaskLabel(li);
        }
      }
    }
  });
  _filterViewObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
  DBG("filter-view observer started");
}

function stopFilterViewObserver() {
  if (_filterViewObserver) {
    _filterViewObserver.disconnect();
    _filterViewObserver = null;
    DBG("filter-view observer stopped");
  }
}

/**
 * Called on every SPA navigation (URL change).
 * Starts or stops the filter-view observer and runs an initial augmentation pass.
 */
async function onNavigate() {
  if (isFilterOrSearchView() && _showParentTask) {
    // Ensure cache is fresh (re-reads in case new tasks were added since load)
    if (!_taskById || !_projectById) {
      await loadTodoistCache();
    }
    startFilterViewObserver();
    // Augment any items already in the DOM (handles hard-reload case)
    augmentAllVisibleTasks();
  } else {
    stopFilterViewObserver();
  }
}

/**
 * Watch for SPA URL changes by intercepting history API and listening to
 * popstate, plus a fallback polling check.
 */
function initNavigationWatcher() {
  const origPushState = history.pushState.bind(history);
  const origReplaceState = history.replaceState.bind(history);

  history.pushState = (...args) => {
    origPushState(...args);
    onNavigate();
  };
  history.replaceState = (...args) => {
    origReplaceState(...args);
    onNavigate();
  };
  window.addEventListener("popstate", onNavigate);

  // Run once immediately for the current page
  onNavigate();
}

// ---- Init -----------------------------------------------------------------

loadShortcuts();
loadTodoistCache().then(() => {
  DBG(
    "todoist cache loaded: tasks=%d projects=%d",
    _taskById ? _taskById.size : 0,
    _projectById ? _projectById.size : 0,
  );
  initNavigationWatcher();
});
