![Extension icon](icons/icon-128.png)

Todoist Keyboard Add-ons
=========================

[![Chrome Web Store Version](https://img.shields.io/chrome-web-store/v/lpdfcpglcjmmbfhmfkaaahglopofbfmd)](https://chromewebstore.google.com/detail/todoist-keyboard-add-ons/lpdfcpglcjmmbfhmfkaaahglopofbfmd)

A small, focused extension for Todoist.  

A browser extension for Chrome and Firefox that adds extra keyboard shortcuts and quality-of-life features to the [Todoist](https://app.todoist.com) web app. All shortcuts are configurable via the extension's options page.

## Features

### Parent task label in filter / search views

When browsing a filter or search result, Todoist shows the project name (e.g. `Work #`) in the bottom-right corner of each task. For subtasks this gives no context about what the parent task is.

With this feature enabled, the label is replaced with **`Project › Parent Task Title`** for subtasks. Top-level tasks are unaffected. This relies on Todoist's local IndexedDB cache — no extra API calls are made.

![Parent task label demo](docs/screenshot-parent-label.png)

Can be toggled on/off from the extension's options page.

## Keyboard shortcuts

### Task list

| Shortcut       | Action                                             |
|----------------|----------------------------------------------------|
| Alt+Shift+Up   | Move the focused task up (simulates drag-and-drop) |
| Alt+Shift+Down | Move the focused task down                         |
| Alt+K          | Open the first external link in the focused task   |
| PageUp         | Move keyboard focus up by one page                 |
| PageDown       | Move keyboard focus down by one page               |
| Home           | Move keyboard focus to the first task              |
| End            | Move keyboard focus to the last task               |

### Task detail (modal)

| Shortcut | Action                                                                                           |
|----------|--------------------------------------------------------------------------------------------------|
| Alt+Up   | Navigate to the parent project via the breadcrumb link                                           |
| Alt+O    | Open the "More actions" menu                                                                     |
| ↑        | Move keyboard focus to the previous sub-task                                                     |
| ↓        | Move keyboard focus to the next sub-task                                                         |
| PageUp   | Move keyboard focus up by one page of subtasks                                                   |
| PageDown | Move keyboard focus down by one page of subtasks                                                 |
| Home     | Move keyboard focus to the first subtask                                                         |
| End      | Move keyboard focus to the last subtask                                                          |
| Alt+H    | Toggle show/hide completed sub-tasks                                                             |

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions` (Chrome/Brave) or `about:debugging#/runtime/this-firefox` (Firefox).
3. Enable **Developer mode** (if on Chrome).
4. Click **Load unpacked** (Chrome) or **Load Temporary Add-on** (Firefox) and select the repository folder.

## Configuration

Click the extension's **Options** link on the extensions page to customise shortcuts and toggle features. Settings are synced across devices via `chrome.storage.sync`.

## Publishing (maintainer notes)

### Releasing

```bash
# bump version in manifest.json, then:
git add manifest.json
git commit -m "Bump version to X.Y"
git tag vX.Y
git push && git push --tags
```

The workflow (`.github/workflows/release.yml`) will zip the production files and attach `extension.zip` to a GitHub Release.

Download `todoist-keyboard-addons-vX.Y.zip` from the release assets and upload it manually via the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) and the [Firefox Add-ons Developer Hub](https://addons.mozilla.org/en-US/developers/).
