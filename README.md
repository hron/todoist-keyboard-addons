Todoist Keyboard Add-ons
=========================

A Chrome extension that adds extra keyboard shortcuts to the [Todoist](https://app.todoist.com) web app. All shortcuts are configurable via the extension's options page.

## Keyboard shortcuts

### Task list

| Shortcut         | Action                                              |
|------------------|-----------------------------------------------------|
| Alt+Shift+Up     | Move the focused task up (simulates drag-and-drop)  |
| Alt+Shift+Down   | Move the focused task down                          |
| Alt+K            | Open the first external link in the focused task    |

### Task detail (modal)

| Shortcut         | Action                                                                                                            |
|------------------|-------------------------------------------------------------------------------------------------------------------|
| Alt+Up           | Navigate to the parent project via the breadcrumb link                                                            |
| Alt+O            | Open the "More actions" menu                                                                                      |
| Shift+G          | Navigate to the task's project (extends native Shift+G to work inside the modal)                                  |
| G                | Quick-complete subtask — shows two-letter hints on every subtask checkbox; type the letters to complete/uncomplete|
| PageUp           | Scroll the subtask list up by one page                                                                            |
| PageDown         | Scroll the subtask list down by one page                                                                          |
| Alt+H            | Toggle show/hide completed sub-tasks                                                                              |

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions` (or `brave://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the repository folder.

## Configuration

Click the extension's **Options** link on the extensions page to customise any shortcut. Shortcuts are synced across devices via `chrome.storage.sync`.
