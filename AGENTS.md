# Project Agent Instructions

## Architecture

- Chrome extension (Manifest V3) targeting `app.todoist.com`
- Single-file content script (`content.js`), no build step, plain vanilla JS
- Shortcuts stored in `chrome.storage.sync`, configurable via `options.html` / `options.js`
- Each shortcut definition in `options.js` has a `section` field (`"taskList"` or `"taskDetail"`)
- The `SECTIONS` array in `options.js` defines section order and display labels for the settings page

## Todoist DOM Selectors

These selectors were verified via CDP inspection against the live Todoist app (as of 2026-04):

| Element | Selector |
|---|---|
| Task detail modal | `div[data-testid="task-details-modal"]` |
| Modal scroll container | `div[data-testid="task-main-content-container"]` |
| Subtask checkboxes (complete & incomplete) | `li.task_list_item button[role="checkbox"][data-action-hint="task-complete"]` |
| Subtask "More actions" (3-dots) button | `li.task_list_item button[data-action-hint="task-overflow-menu"]` (also `button[data-testid="more_menu"]`) |
| Parent task checkbox (in modal) | `button[data-action-hint="task-detail-view-complete"]` |
| Toggle completed subtasks button | `button[aria-label="Hide completed sub-tasks"]` or `button[aria-label="Show completed sub-tasks"]` |
| Subtask list container | `ul.items` inside `div.list_holder` |
| Focused/selected task in task list | `li.task_list_item[data-is-drag-target="true"]` (primary), also `.selected`, `[aria-selected="true"]`, `:focus-within` |

### Notes

- Completed subtask items have class `task_list_item--completed` and `aria-checked="true"` on their checkbox; the checkbox `aria-label` is `"Mark task as incomplete"`.
- There are **two** `ul.items` inside the modal's `div.list_holder` -- one for active subtasks, one for completed subtasks.
- The **first** checkbox inside the modal (with `data-action-hint="task-detail-view-complete"`) belongs to the **parent task**, not a subtask. Subtask checkboxes use `data-action-hint="task-complete"` and are inside `li.task_list_item`.
- Subtask action buttons (edit, date, comment, 3-dots menu) are **lazily rendered** — they only exist in the DOM when the item is hovered (the container gets class `task_list_item__actions--active`). Dispatching synthetic `mouseover`/`pointerover`/`pointerenter` events on `li.task_list_item` forces React to render them. Once rendered, they persist even after `mouseout`.

## Keyboard Event Handling

- The `keydown` listener must use **capture phase** (`true` as 3rd argument to `addEventListener`) to run before Todoist's own handlers.
- During hint mode (or any mode that needs to swallow keys), all of `keydown`, `keyup`, and `keypress` must be intercepted with `preventDefault()`, `stopPropagation()`, and `stopImmediatePropagation()` to prevent Todoist shortcuts from firing.

## Key Files

| File | Purpose |
|---|---|
| `content.js` | Main content script. Keyboard listeners, hint mode, drag-and-drop reordering, scroll/toggle handlers. |
| `options.js` | Options page logic. Shortcut definitions with `section` field, section-based rendering, key recording. |
| `options.html` | Options page markup and CSS (including `.section-header` styles). |
| `manifest.json` | Manifest V3. Content script for `app.todoist.com`, `storage` permission. |

## Reloading the Extension for Testing

After editing extension files (`content.js`, `options.js`, etc.), both the **extension** and the **page** must be reloaded for changes to take effect:

1. **Reload the extension** — call `chrome.runtime.reload()` via CDP on the options page (or any extension page):
   ```
   ws → options page → Runtime.evaluate("chrome.runtime.reload()")
   ```
2. **Hard-reload the Todoist page** — `Page.reload({ ignoreCache: true })`, or navigate to the test task URL. A simple SPA navigation is **not** enough; the page must fully reload so the new content script is injected.
3. **Wait** — after reload, wait ~4-5 seconds for Todoist to fully render before interacting.
