# Project Agent Instructions

## Architecture

- Tampermonkey / Violentmonkey userscript targeting `*://app.todoist.com/*` on Chrome and Firefox
- Modular vanilla JS sources in `src/`, bundled with zero external dependencies via `node scripts/build.mjs` (`npm run build`) into `dist/todoist-keyboard-addons.user.js` (gitignored)
- Single source of truth for shortcuts, sections, and feature toggles in `src/defaults.js`
- Settings stored in userscript storage (`GM_getValue` / `GM_setValue`), synced live across tabs via `GM_addValueChangeListener`
- Settings UI (`src/settings-ui.js`) auto-saves every change immediately (no Save button), adapts to Todoist's light/dark theme (`html[data-appearance]`), and is mounted in two places:
  - Inline as a **Keyboard Add-ons** tab inside Todoist Settings (`src/settings-page.js`)
  - As a standalone Shadow DOM modal opened via `GM_registerMenuCommand("Settings", ...)` (`src/settings-modal.js`)
- Runs at `@run-at document-start` so `src/pointer-capture-shim.js` patches `Element.prototype.setPointerCapture` in the page world (using `exportFunction` on `unsafeWindow` for Firefox Xray/CSP safety) before Todoist initializes; DOM/UI logic initializes on `DOMContentLoaded`

## Todoist DOM Selectors

These selectors were verified via live browser inspection against Todoist:

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
| Settings modal dialog | `[role="dialog"]` containing `a[role="tab"][href*="/app/settings/"]` and `[role="tabpanel"]` |
| Settings sidebar tabs | `a[role="tab"][href*="/app/settings/"]` (active state via `aria-selected="true"`, `aria-current="page"`, `data-active-item="true"`) |
| Settings close button | `header[data-component="ModalHeader"] button[aria-label="Close settings"]` |
| Light / dark appearance | `document.documentElement.getAttribute("data-appearance")` (`"light"` or `"dark"`) |

### Notes

- Completed subtask items have class `task_list_item--completed` and `aria-checked="true"` on their checkbox; the checkbox `aria-label` is `"Mark task as incomplete"`.
- There are **two** `ul.items` inside the modal's `div.list_holder` -- one for active subtasks, one for completed subtasks.
- The **first** checkbox inside the modal (with `data-action-hint="task-detail-view-complete"`) belongs to the **parent task**, not a subtask. Subtask checkboxes use `data-action-hint="task-complete"` and are inside `li.task_list_item`.
- Subtask action buttons (edit, date, comment, 3-dots menu) are **lazily rendered** — they only exist in the DOM when the item is hovered (the container gets class `task_list_item__actions--active`). Dispatching synthetic `mouseover`/`pointerover`/`pointerenter` events on `li.task_list_item` forces React to render them. Once rendered, they persist even after `mouseout`.
- In Todoist Settings, never mutate or remove React's children inside `[role="tabpanel"]`; hide the native `[role="tabpanel"]` with `display: none` and insert our sibling panel next to it instead.

## Keyboard Event Handling

- The `keydown` listener in `src/shortcuts.js` uses **capture phase** (`true` as 3rd argument to `addEventListener`) to run before Todoist's own handlers.
- During shortcut recording in `src/settings-ui.js`, `keydown`, `keyup`, and `keypress` are intercepted in capture phase on `window` with `preventDefault()`, `stopPropagation()`, and `stopImmediatePropagation()` (including `Escape`, so canceling recording does not close Todoist's Settings modal).

## Key Files

| File | Purpose |
|---|---|
| `package.json` | Package version (injected into `@version`) and `build` / `test` scripts. |
| `scripts/build.mjs` | Zero-dependency Node bundler that outputs `dist/todoist-keyboard-addons.user.js` with base64-inlined icon and preview screenshot. |
| `scripts/dev-server.mjs` | Live-rebuilding local dev server (`npm run dev`, port `4174`) serving `/dev-loader.user.js` and `/dist/todoist-keyboard-addons.user.js` with a CSP-safe `GM_*` bridge. |
| `src/defaults.js` | Single source of truth for shortcuts, sections, feature flags, and key formatting helpers. |
| `src/pointer-capture-shim.js` | Firefox `NotFoundError` shim for synthetic pointer drags (`@run-at document-start`). |
| `src/storage.js` | `GM_getValue` / `GM_setValue` / `GM_addValueChangeListener` reactive store. |
| `src/drag.js` | Focus helpers and synthetic drag-and-drop task reordering. |
| `src/parent-label.js` | IndexedDB `todoist.sync` parent-task label augmentation in filter/search/today/upcoming views. |
| `src/shortcuts.js` | Capture-phase keyboard shortcut listener. |
| `src/settings-ui.js` | Auto-saving Shadow DOM settings UI with key recorder and light/dark theme support. |
| `src/settings-modal.js` | Standalone Shadow DOM modal opened via `GM_registerMenuCommand`. |
| `src/settings-page.js` | Todoist Settings (`/app/settings/*`) sidebar tab and inline panel injector. |
| `src/main.js` | Entry point wiring all modules together. |

## Testing

- **Automated Playwright suite**: `npm test` (builds `dist/todoist-keyboard-addons.user.js` and runs `tests/`).
- **Live Firefox Nightly + Tampermonkey testing**: Serve `dist/` with `ff-env serve start <repo>/dist` and drive Firefox Nightly via `agent-browser` (see the `firefox-ext-testing` skill).
