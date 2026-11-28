// ---------------------------------------------------------------------------
// Capture-phase keyboard shortcut listener
// ---------------------------------------------------------------------------

import {
  focusModalSubtask,
  focusTaskListItem,
  getFirstVisibleTask,
  getFocusedSubtask,
  getFocusedTask,
  getModalSubtaskPageSize,
  getModalSubtasks,
  getTaskList,
  getTaskListPageSize,
  getTaskModal,
  moveTask,
} from "./drag.js";
import { getShortcuts } from "./storage.js";

let _recordingGuard = () => false;
let dispatchingSynthetic = false;

export function setRecordingGuard(fn) {
  _recordingGuard = fn;
}

/**
 * Returns true when `event` matches the stored shortcut for `id`.
 */
function matchesShortcut(event, id) {
  const sc = getShortcuts()[id];
  if (!sc) return false;

  if (event.altKey !== sc.altKey) return false;
  if (event.ctrlKey !== sc.ctrlKey) return false;
  if (event.shiftKey !== sc.shiftKey) return false;
  if (event.metaKey !== sc.metaKey) return false;

  if (sc.code && (sc.code.startsWith("Key") || sc.code.startsWith("Digit"))) {
    return event.code === sc.code;
  }
  return event.key === sc.key;
}

function isEditing() {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if (active.isContentEditable) return true;
  return false;
}

function hasOpenDialog() {
  return Boolean(
    document.querySelector(
      '[role="dialog"], [role="alertdialog"], div[data-testid="task-details-modal"], [data-kbd-settings-modal="1"]',
    ),
  );
}

function dispatchSyntheticKey(key, code, keyCode) {
  const target = document.activeElement || document.body;
  if (!target) return;
  dispatchingSynthetic = true;
  try {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        code,
        keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true,
      }),
    );
  } finally {
    dispatchingSynthetic = false;
  }
}

function maybeClick(event, selector) {
  const element = document.querySelector(selector);
  if (!element) return;
  event.preventDefault();
  element.click();
}

export function initShortcuts() {
  document.addEventListener(
    "keydown",
    (event) => {
      // Never fire shortcuts while recording a key binding in settings or
      // re-entering from our own synthetic key dispatch
      if (_recordingGuard() || dispatchingSynthetic) return;

      if (matchesShortcut(event, "toggleSidebar")) {
        if (isEditing() || hasOpenDialog()) return;
        if (
          !event.ctrlKey &&
          !event.altKey &&
          !event.shiftKey &&
          !event.metaKey &&
          event.code === "KeyM"
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        dispatchSyntheticKey("m", "KeyM", 77);
        return;
      }

      if (matchesShortcut(event, "moveUp")) {
        event.preventDefault();
        moveTask("up");
        return;
      }

      if (matchesShortcut(event, "moveDown")) {
        event.preventDefault();
        moveTask("down");
        return;
      }

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

      if (matchesShortcut(event, "moreActions")) {
        maybeClick(
          event,
          'header[data-component="ModalHeader"] button[aria-label="More actions"]',
        );
        return;
      }

      if (matchesShortcut(event, "focusSubtaskUp")) {
        if (isEditing()) return;
        const modal = getTaskModal();
        if (!modal) return;
        const subtasks = getModalSubtasks(modal);
        if (!subtasks.length) return;
        event.preventDefault();
        const current = getFocusedSubtask(modal);
        const currentIdx = current ? subtasks.indexOf(current) : -1;
        const targetIdx =
          currentIdx > 0
            ? currentIdx - 1
            : currentIdx === -1
              ? subtasks.length - 1
              : 0;
        focusModalSubtask(subtasks, targetIdx);
        return;
      }

      if (matchesShortcut(event, "focusSubtaskDown")) {
        if (isEditing()) return;
        const modal = getTaskModal();
        if (!modal) return;
        const subtasks = getModalSubtasks(modal);
        if (!subtasks.length) return;
        event.preventDefault();
        const current = getFocusedSubtask(modal);
        const currentIdx = current ? subtasks.indexOf(current) : -1;
        const targetIdx =
          currentIdx < subtasks.length - 1
            ? currentIdx + 1
            : currentIdx === -1
              ? 0
              : subtasks.length - 1;
        focusModalSubtask(subtasks, targetIdx);
        return;
      }

      if (matchesShortcut(event, "followLink")) {
        const modal = getTaskModal();
        if (modal) {
          let link = null;
          for (const el of modal.querySelectorAll(".task_content")) {
            if (el.closest('[data-testid="task-detail-default-header"]'))
              continue;
            if (el.closest('[data-testid="task-detail-breadcrumbs"]')) continue;
            link = el.querySelector("a[target=_blank]");
            if (link) break;
          }
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

      if (matchesShortcut(event, "copyTaskName")) {
        const modal = getTaskModal();
        let textToCopy = null;

        const selectedTasks = Array.from(
          document.querySelectorAll(
            "li.task_list_item.selected, li.task_list_item[aria-selected='true']",
          ),
        );

        if (selectedTasks.length > 0) {
          const names = [];
          for (const task of selectedTasks) {
            const contentEl = task.querySelector(".task_content");
            if (contentEl) names.push(contentEl.textContent);
          }
          if (names.length > 0) textToCopy = names.join("\n");
        } else if (modal) {
          const contentEl = Array.from(
            modal.querySelectorAll(".task_content"),
          ).find(
            (el) =>
              !el.closest('[data-testid="task-detail-default-header"]') &&
              !el.closest('[data-testid="task-detail-breadcrumbs"]'),
          );
          if (contentEl) textToCopy = contentEl.textContent;
        } else {
          const focusedTask = getFocusedTask();
          if (focusedTask) {
            const contentEl = focusedTask.querySelector(".task_content");
            if (contentEl) textToCopy = contentEl.textContent;
          }
        }

        if (textToCopy) {
          event.preventDefault();
          navigator.clipboard.writeText(textToCopy);
        }
        return;
      }

      if (matchesShortcut(event, "scrollSubtasksUp")) {
        if (isEditing()) return;
        const modal = getTaskModal();
        if (modal) {
          const subtasks = getModalSubtasks(modal);
          if (!subtasks.length) return;
          event.preventDefault();
          const current = getFocusedSubtask(modal);
          const currentIdx = current ? subtasks.indexOf(current) : -1;
          const fromIdx = currentIdx >= 0 ? currentIdx : subtasks.length - 1;
          const targetIdx = Math.max(
            0,
            fromIdx - getModalSubtaskPageSize(subtasks),
          );
          focusModalSubtask(subtasks, targetIdx);
        } else {
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

      if (matchesShortcut(event, "scrollSubtasksDown")) {
        if (isEditing()) return;
        const modal = getTaskModal();
        if (modal) {
          const subtasks = getModalSubtasks(modal);
          if (!subtasks.length) return;
          event.preventDefault();
          const current = getFocusedSubtask(modal);
          const currentIdx = current ? subtasks.indexOf(current) : -1;
          const fromIdx = currentIdx >= 0 ? currentIdx : 0;
          const targetIdx = Math.min(
            subtasks.length - 1,
            fromIdx + getModalSubtaskPageSize(subtasks),
          );
          focusModalSubtask(subtasks, targetIdx);
        } else {
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

      if (matchesShortcut(event, "scrollToTop")) {
        if (isEditing()) return;
        const modal = getTaskModal();
        if (modal) {
          const subtasks = getModalSubtasks(modal);
          if (!subtasks.length) return;
          event.preventDefault();
          focusModalSubtask(subtasks, 0);
        } else {
          const tasks = getTaskList();
          if (!tasks.length) return;
          event.preventDefault();
          focusTaskListItem(tasks[0]);
          tasks[0].scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        return;
      }

      if (matchesShortcut(event, "scrollToBottom")) {
        if (isEditing()) return;
        const modal = getTaskModal();
        if (modal) {
          const subtasks = getModalSubtasks(modal);
          if (!subtasks.length) return;
          event.preventDefault();
          focusModalSubtask(subtasks, subtasks.length - 1);
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

      if (matchesShortcut(event, "toggleCompleted")) {
        if (isEditing()) return;
        const modal = getTaskModal();
        if (!modal) return;
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
}
