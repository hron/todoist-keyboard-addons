// ---------------------------------------------------------------------------
// Shared logging, shortcut/feature defaults, and keyboard formatting helpers
// ---------------------------------------------------------------------------

export const LOG = (...args) => console.log("[todoist-kbd]", ...args);
export const WARN = (...args) => console.warn("[todoist-kbd]", ...args);
export const DBG = (...args) => console.debug("[todoist-kbd]", ...args);

/**
 * Section definitions — order and labels for the settings UI.
 */
export const SECTIONS = [
  { id: "taskList", label: "Task list" },
  { id: "taskDetail", label: "Task detail (modal)" },
];

/**
 * Default shortcuts — single source of truth for both runtime matching and
 * the settings UI.
 *
 * Key object shape:
 *   { key, code, altKey, ctrlKey, shiftKey, metaKey, label }
 */
export const SHORTCUT_DEFAULTS = [
  // -- Task list shortcuts --
  {
    id: "moveUp",
    name: "Move task up",
    description: "Drag the focused task one position up",
    section: "taskList",
    shortcut: {
      key: "ArrowUp",
      code: "ArrowUp",
      altKey: true,
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      label: "Alt + Shift + Up",
    },
  },
  {
    id: "moveDown",
    name: "Move task down",
    description: "Drag the focused task one position down",
    section: "taskList",
    shortcut: {
      key: "ArrowDown",
      code: "ArrowDown",
      altKey: true,
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      label: "Alt + Shift + Down",
    },
  },
  {
    id: "followLink",
    name: "Follow task link",
    description: "Open the first external link in the focused task",
    section: "taskList",
    shortcut: {
      key: "k",
      code: "KeyK",
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      label: "Alt + K",
    },
  },
  {
    id: "copyTaskName",
    name: "Copy task name",
    description: "Copy the name of the focused task or open modal task",
    section: "taskList",
    shortcut: {
      key: "n",
      code: "KeyN",
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      label: "Alt + N",
    },
  },
  // -- Task detail (modal) shortcuts --
  {
    id: "goToParent",
    name: "Go to parent",
    description: "Navigate to the parent project via the breadcrumb link",
    section: "taskDetail",
    shortcut: {
      key: "ArrowUp",
      code: "ArrowUp",
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      label: "Alt + Up",
    },
  },
  {
    id: "moreActions",
    name: "More actions",
    description: 'Open the "More actions" menu in the task detail modal',
    section: "taskDetail",
    shortcut: {
      key: "o",
      code: "KeyO",
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      label: "Alt + O",
    },
  },
  {
    id: "focusSubtaskUp",
    name: "Focus previous sub-task",
    description:
      "Move keyboard focus to the previous sub-task in the task detail modal",
    section: "taskDetail",
    shortcut: {
      key: "ArrowUp",
      code: "ArrowUp",
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      label: "↑",
    },
  },
  {
    id: "focusSubtaskDown",
    name: "Focus next sub-task",
    description:
      "Move keyboard focus to the next sub-task in the task detail modal",
    section: "taskDetail",
    shortcut: {
      key: "ArrowDown",
      code: "ArrowDown",
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      label: "↓",
    },
  },
  {
    id: "scrollSubtasksUp",
    name: "Focus subtasks up",
    description:
      "Move keyboard focus up by one page of sub-tasks in the task detail modal",
    section: "taskDetail",
    shortcut: {
      key: "PageUp",
      code: "PageUp",
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      label: "PageUp",
    },
  },
  {
    id: "scrollSubtasksDown",
    name: "Focus subtasks down",
    description:
      "Move keyboard focus down by one page of sub-tasks in the task detail modal",
    section: "taskDetail",
    shortcut: {
      key: "PageDown",
      code: "PageDown",
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      label: "PageDown",
    },
  },
  {
    id: "toggleCompleted",
    name: "Toggle completed subtasks",
    description: "Show or hide completed sub-tasks in the task detail modal",
    section: "taskDetail",
    shortcut: {
      key: "h",
      code: "KeyH",
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      label: "Alt + H",
    },
  },
  {
    id: "scrollToTop",
    name: "Focus first sub-task / task",
    description:
      "In the task detail modal: move focus to the first sub-task. In the task list: move focus to the first task.",
    section: "taskDetail",
    shortcut: {
      key: "Home",
      code: "Home",
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      label: "Home",
    },
  },
  {
    id: "scrollToBottom",
    name: "Focus last sub-task / task",
    description:
      "In the task detail modal: move focus to the last sub-task. In the task list: move focus to the last task.",
    section: "taskDetail",
    shortcut: {
      key: "End",
      code: "End",
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      label: "End",
    },
  },
];

/**
 * Boolean feature flags.
 */
export const FEATURE_DEFAULTS = [
  {
    id: "showParentTask",
    name: "Show parent task in filter / search views",
    description:
      'Replaces the project label (e.g. "Life #") with "Life \u203a Parent Task Title" for subtasks when viewing a filter or search result. Top-level tasks are unaffected.',
    default: true,
  },
];

export function getDefaultShortcutsMap() {
  const map = {};
  for (const item of SHORTCUT_DEFAULTS) {
    map[item.id] = { ...item.shortcut };
  }
  return map;
}

export function getDefaultSettingsMap() {
  return Object.fromEntries(FEATURE_DEFAULTS.map((f) => [f.id, f.default]));
}

/** Format shortcut label for macOS modifier names when applicable. */
export function formatLabel(label) {
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  if (!isMac) return label;
  return label.replace(/Meta/g, "Cmd").replace(/Alt/g, "Opt");
}

export function friendlyKeyName(key, code) {
  const MAP = {
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
    " ": "Space",
    Escape: "Esc",
    Enter: "Enter",
    Backspace: "Backspace",
    Delete: "Del",
    Tab: "Tab",
  };

  if (MAP[key]) return MAP[key];

  // Prioritize code for alpha/digit keys to avoid macOS Option-key accent chars.
  if (code && (code.startsWith("Key") || code.startsWith("Digit"))) {
    return code.replace("Key", "").replace("Digit", "").toUpperCase();
  }

  if (key.length === 1) return key.toUpperCase();
  return code || key;
}

export function buildLabel(e) {
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  parts.push(friendlyKeyName(e.key, e.code));
  return parts.join(" + ");
}

export function eventToShortcut(e) {
  return {
    key: e.key,
    code: e.code,
    altKey: e.altKey,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    metaKey: e.metaKey,
    label: buildLabel(e),
  };
}

export function isModifierOnly(key) {
  return ["Alt", "Control", "Shift", "Meta", "AltGraph", "CapsLock"].includes(
    key,
  );
}

export function isIgnoredKey(key) {
  return ["Tab", "Escape", "F5", "F12"].includes(key);
}

export function shortcutsEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.key === b.key &&
    a.code === b.code &&
    Boolean(a.altKey) === Boolean(b.altKey) &&
    Boolean(a.ctrlKey) === Boolean(b.ctrlKey) &&
    Boolean(a.shiftKey) === Boolean(b.shiftKey) &&
    Boolean(a.metaKey) === Boolean(b.metaKey)
  );
}
