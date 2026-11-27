// ---------------------------------------------------------------------------
// Parent-task label in filter / search / today / upcoming views
//
// Reads Todoist's local `todoist.sync` IndexedDB to replace "Project #" with
// "Project › Parent Task Title" for subtasks.
// ---------------------------------------------------------------------------

import { DBG, LOG, WARN } from "./defaults.js";
import { getSettings } from "./storage.js";

let _filterViewObserver = null;

function isShowParentTaskEnabled() {
  return getSettings().showParentTask !== false;
}

function idbGetMany(db, storeName, ids) {
  return new Promise((resolve) => {
    if (!ids.length) {
      resolve(new Map());
      return;
    }
    const result = new Map();
    let pending = ids.length;
    const done = () => {
      if (--pending === 0) resolve(result);
    };
    try {
      const store = db
        .transaction(storeName, "readonly")
        .objectStore(storeName);
      for (const id of ids) {
        const req = store.get(id);
        req.onsuccess = (e) => {
          if (e.target.result) result.set(id, e.target.result);
          done();
        };
        req.onerror = done;
      }
    } catch {
      resolve(result);
    }
  });
}

function queryTodoistDB(taskIds) {
  return new Promise((resolve) => {
    if (!taskIds.length) {
      resolve({ taskById: new Map(), projectById: new Map() });
      return;
    }
    const req = indexedDB.open("todoist.sync");
    req.onerror = () => {
      WARN("Could not open todoist.sync IndexedDB");
      resolve({ taskById: new Map(), projectById: new Map() });
    };
    req.onsuccess = async (e) => {
      const db = e.target.result;
      try {
        const primaryTasks = await idbGetMany(db, "tasks", taskIds);

        const parentIds = [];
        for (const t of primaryTasks.values()) {
          if (t.parent_id && !primaryTasks.has(t.parent_id)) {
            parentIds.push(t.parent_id);
          }
        }

        const parentTasks = await idbGetMany(db, "tasks", parentIds);

        const taskById = new Map();
        for (const [id, t] of [...primaryTasks, ...parentTasks]) {
          taskById.set(id, {
            content: t.content,
            parent_id: t.parent_id || null,
            project_id: t.project_id,
          });
        }

        const projectIds = [
          ...new Set(
            [...taskById.values()].map((t) => t.project_id).filter(Boolean),
          ),
        ];
        const projectById = await idbGetMany(db, "projects", projectIds);

        db.close();
        resolve({ taskById, projectById });
      } catch {
        db.close();
        resolve({ taskById: new Map(), projectById: new Map() });
      }
    };
  });
}

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

function augmentTaskLabel(li, taskById) {
  if (li.dataset.kbdParentAugmented === "1") return;

  const fiberTask = getTaskFromFiber(li);
  const taskId = fiberTask ? fiberTask.id : li.getAttribute("data-item-id");
  if (!taskId) return;

  const task = taskById.get(taskId);
  if (!task || !task.parent_id) return;

  const parent = taskById.get(task.parent_id);
  if (!parent) return;

  const projectLink = li.querySelector('a[href*="/app/project/"]');
  if (!projectLink) return;

  for (const node of Array.from(projectLink.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) node.remove();
    if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.matches?.(".kbd-parent-label")
    ) {
      node.remove();
    }
  }

  const svg = projectLink.querySelector("svg");
  const liWidth = li.getBoundingClientRect().width;
  const parentSpan = document.createElement("span");
  parentSpan.className = "kbd-parent-label";
  parentSpan.textContent = `\u00a0›\u00a0${parent.content}`;
  parentSpan.style.maxWidth = `${liWidth * 0.5}px`;
  parentSpan.style.display = "inline-block";
  parentSpan.style.overflow = "hidden";
  parentSpan.style.textOverflow = "ellipsis";
  parentSpan.style.whiteSpace = "nowrap";

  if (svg) {
    projectLink.insertBefore(parentSpan, svg);
  } else {
    projectLink.appendChild(parentSpan);
  }

  li.dataset.kbdParentAugmented = "1";
}

function removeInjectedParentLabels() {
  for (const span of document.querySelectorAll(".kbd-parent-label")) {
    span.remove();
  }
  for (const li of document.querySelectorAll(
    'li.task_list_item[data-kbd-parent-augmented="1"]',
  )) {
    delete li.dataset.kbdParentAugmented;
  }
}

function collectTaskIds(lis) {
  const ids = [];
  for (const li of lis) {
    if (li.dataset.kbdParentAugmented === "1") continue;
    const fiberTask = getTaskFromFiber(li);
    const id = fiberTask ? fiberTask.id : li.getAttribute("data-item-id");
    if (id) ids.push(id);
  }
  return ids;
}

async function augmentAllVisibleTasks() {
  if (!isShowParentTaskEnabled()) return;
  const lis = Array.from(
    document.querySelectorAll("li.task_list_item:not(.reorder_item)"),
  );
  const taskIds = collectTaskIds(lis);
  if (!taskIds.length) return;

  const { taskById } = await queryTodoistDB(taskIds);
  for (const li of lis) {
    augmentTaskLabel(li, taskById);
  }
}

function isFilterOrSearchView() {
  return /\/(filter|search|today|upcoming)(\/|$)/.test(
    window.location.pathname,
  );
}

function startFilterViewObserver() {
  if (_filterViewObserver || !document.body) return;
  _filterViewObserver = new MutationObserver(async (mutations) => {
    if (!isFilterOrSearchView() || !isShowParentTaskEnabled()) return;
    const lis = [];
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (
          node.matches &&
          node.matches("li.task_list_item:not(.reorder_item)")
        ) {
          lis.push(node);
        }
        for (const li of node.querySelectorAll
          ? node.querySelectorAll("li.task_list_item:not(.reorder_item)")
          : []) {
          lis.push(li);
        }
      }
    }
    if (!lis.length) return;
    const taskIds = collectTaskIds(lis);
    if (!taskIds.length) return;
    const { taskById } = await queryTodoistDB(taskIds);
    for (const li of lis) {
      augmentTaskLabel(li, taskById);
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

export async function refreshParentLabels() {
  const enabled = isShowParentTaskEnabled();
  LOG("onNavigate", {
    isFilterOrSearchView: isFilterOrSearchView(),
    showParentTask: enabled,
  });
  if (isFilterOrSearchView() && enabled) {
    startFilterViewObserver();
    augmentAllVisibleTasks();
  } else {
    stopFilterViewObserver();
    if (!enabled) {
      removeInjectedParentLabels();
    }
  }
}
