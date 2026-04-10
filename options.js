// ---------------------------------------------------------------------------
// Todoist Keyboard Add-ons — options page script
// ---------------------------------------------------------------------------

/**
 * Default shortcuts — mirrors the original hardcoded values in content.js.
 * Each shortcut is stored as a plain object so it can be serialised to
 * chrome.storage.sync without any loss.
 *
 * Key object shape:
 *   { key, code, altKey, ctrlKey, shiftKey, metaKey, label }
 *
 * `key`   — event.key  (e.g. "ArrowUp", "o")
 * `code`  — event.code (e.g. "KeyO")   — used for layout-independent alpha keys
 * modifiers — booleans matching event.*Key
 * `label` — human-readable display string
 */
const SHORTCUT_DEFAULTS = [
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
      label: "Alt+Shift+Up",
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
      label: "Alt+Shift+Down",
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
      label: "Alt+K",
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
      label: "Alt+Up",
    },
  },
  {
    id: "moreActions",
    name: "More actions",
    description: "Open the \"More actions\" menu in the task detail modal",
    section: "taskDetail",
    shortcut: {
      key: "o",
      code: "KeyO",
      altKey: true,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      label: "Alt+O",
    },
  },
  {
    id: "goToProject",
    name: "Go to project (modal)",
    description:
      "Navigate to the task's project when the task detail modal is open (extends native Shift+G)",
    section: "taskDetail",
    shortcut: {
      key: "G",
      code: "KeyG",
      altKey: false,
      ctrlKey: false,
      shiftKey: true,
      metaKey: false,
      label: "Shift+G",
    },
  },
  {
    id: "hintMode",
    name: "Quick-complete subtask",
    description:
      "Show two-letter hints on subtask checkboxes — type the letters to complete or uncomplete a subtask",
    section: "taskDetail",
    shortcut: {
      key: "g",
      code: "KeyG",
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
      metaKey: false,
      label: "G",
    },
  },
  {
    id: "scrollSubtasksUp",
    name: "Scroll subtasks up",
    description: "Scroll the subtask list up by one page in the task detail modal",
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
    name: "Scroll subtasks down",
    description: "Scroll the subtask list down by one page in the task detail modal",
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
      label: "Alt+H",
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a human-readable label from a KeyboardEvent (or stored shortcut). */
function buildLabel(e) {
  const parts = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");

  // Use a friendly name for special keys, otherwise fall back to key/code
  const keyName = friendlyKeyName(e.key, e.code);
  parts.push(keyName);
  return parts.join("+");
}

function friendlyKeyName(key, code) {
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
  // Single printable character — upper-case it for display
  if (key.length === 1) return key.toUpperCase();
  // Fall back to code (e.g. "F5")
  return code || key;
}

/** Convert a KeyboardEvent to a storable shortcut object. */
function eventToShortcut(e) {
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

/** Keys that are modifier-only — we skip these as standalone triggers. */
function isModifierOnly(key) {
  return ["Alt", "Control", "Shift", "Meta", "AltGraph", "CapsLock"].includes(key);
}

/** Keys that are not useful as shortcuts. */
function isIgnored(key) {
  return ["Tab", "Escape", "F5", "F12"].includes(key);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// Working copy of shortcuts (may differ from saved state until user hits Save)
let currentShortcuts = SHORTCUT_DEFAULTS.map((s) => ({ ...s, shortcut: { ...s.shortcut } }));

// The input currently recording
let recordingId = null;

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function loadFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("shortcuts", (data) => {
      resolve(data.shortcuts || null);
    });
  });
}

function saveToStorage(shortcuts) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ shortcuts }, resolve);
  });
}

// Section definitions — order and labels for the settings page
const SECTIONS = [
  { id: "taskList", label: "Task list" },
  { id: "taskDetail", label: "Task detail (modal)" },
];

// ---------------------------------------------------------------------------
// DOM rendering
// ---------------------------------------------------------------------------

function renderTable() {
  const tbody = document.getElementById("shortcuts-table");
  tbody.innerHTML = "";

  for (const section of SECTIONS) {
    const sectionItems = currentShortcuts.filter(
      (s) => s.section === section.id,
    );
    if (sectionItems.length === 0) continue;

    // Section header row
    const headerTr = document.createElement("tr");
    headerTr.className = "section-header";
    const headerTd = document.createElement("td");
    headerTd.colSpan = 2;
    headerTd.textContent = section.label;
    headerTr.appendChild(headerTd);
    tbody.appendChild(headerTr);

    for (const item of sectionItems) {
      renderShortcutRow(tbody, item);
    }
  }

  // Render any uncategorised shortcuts (safety net)
  const uncategorised = currentShortcuts.filter(
    (s) => !SECTIONS.some((sec) => sec.id === s.section),
  );
  if (uncategorised.length > 0) {
    const headerTr = document.createElement("tr");
    headerTr.className = "section-header";
    const headerTd = document.createElement("td");
    headerTd.colSpan = 2;
    headerTd.textContent = "Other";
    headerTr.appendChild(headerTd);
    tbody.appendChild(headerTr);
    for (const item of uncategorised) {
      renderShortcutRow(tbody, item);
    }
  }
}

function renderShortcutRow(tbody, item) {
  const tr = document.createElement("tr");

  // Action cell
  const tdAction = document.createElement("td");
  tdAction.innerHTML = `
    <div class="action-name">${item.name}</div>
    <div class="action-desc">${item.description}</div>
  `;

  // Shortcut cell
  const tdShortcut = document.createElement("td");
  tdShortcut.className = "shortcut-cell";

  const input = document.createElement("span");
  input.className = "key-input";
  input.tabIndex = 0;
  input.dataset.id = item.id;
  input.textContent = item.shortcut.label;

  const resetBtn = document.createElement("button");
  resetBtn.className = "btn-reset";
  resetBtn.title = "Reset to default";
  resetBtn.textContent = "↺";
  resetBtn.dataset.id = item.id;

  tdShortcut.appendChild(input);
  tdShortcut.appendChild(resetBtn);

  tr.appendChild(tdAction);
  tr.appendChild(tdShortcut);
  tbody.appendChild(tr);

  // --- Event: start recording when the input is clicked or focused+Enter
  const startRecording = (e) => {
    e.preventDefault();
    stopRecording(); // clear any existing recording first
    recordingId = item.id;
    input.classList.add("recording");
    input.textContent = "Press a key combination";
  };

  input.addEventListener("click", startRecording);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      startRecording(e);
    }
  });

  // --- Event: reset to default
  resetBtn.addEventListener("click", () => {
    const def = SHORTCUT_DEFAULTS.find((d) => d.id === item.id);
    if (def) {
      item.shortcut = { ...def.shortcut };
      input.textContent = item.shortcut.label;
    }
  });
}

function stopRecording() {
  if (!recordingId) return;
  const el = document.querySelector(`.key-input[data-id="${recordingId}"]`);
  if (el) {
    el.classList.remove("recording");
    // Restore label from state in case recording was abandoned
    const item = currentShortcuts.find((s) => s.id === recordingId);
    if (item) el.textContent = item.shortcut.label;
  }
  recordingId = null;
}

// ---------------------------------------------------------------------------
// Global keydown handler for recording
// ---------------------------------------------------------------------------

document.addEventListener("keydown", (e) => {
  if (!recordingId) return;

  // Modifier-only keystrokes are not valid shortcuts
  if (isModifierOnly(e.key)) return;
  // Ignore some system keys
  if (isIgnored(e.key)) {
    stopRecording();
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  const newShortcut = eventToShortcut(e);
  const item = currentShortcuts.find((s) => s.id === recordingId);
  if (item) {
    item.shortcut = newShortcut;
    const el = document.querySelector(`.key-input[data-id="${recordingId}"]`);
    if (el) {
      el.classList.remove("recording");
      el.textContent = newShortcut.label;
    }
  }
  recordingId = null;
}, true);

// Click anywhere outside a key-input cancels recording
document.addEventListener("click", (e) => {
  if (!recordingId) return;
  if (!e.target.closest(".key-input")) {
    stopRecording();
  }
});

// ---------------------------------------------------------------------------
// Save / restore
// ---------------------------------------------------------------------------

document.getElementById("btn-save").addEventListener("click", async () => {
  // Serialise just the shortcut data keyed by id
  const toSave = {};
  for (const item of currentShortcuts) {
    toSave[item.id] = item.shortcut;
  }
  await saveToStorage(toSave);

  const status = document.getElementById("status");
  status.classList.add("visible");
  setTimeout(() => status.classList.remove("visible"), 2000);
});

document.getElementById("btn-restore").addEventListener("click", () => {
  currentShortcuts = SHORTCUT_DEFAULTS.map((s) => ({
    ...s,
    shortcut: { ...s.shortcut },
  }));
  renderTable();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

(async () => {
  const saved = await loadFromStorage();
  if (saved) {
    for (const item of currentShortcuts) {
      if (saved[item.id]) {
        item.shortcut = saved[item.id];
      }
    }
  }
  renderTable();
})();
