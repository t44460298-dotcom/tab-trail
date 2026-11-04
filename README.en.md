<div align="center">

<img src="extension/icons/icon128.png" width="72" alt="">

# Tab Trail (标签脉络)

**A side panel that arranges your tabs into a tree by where each one was opened from, and remembers whether you have read each page, when, and for how long.**

Chrome · Edge · Firefox ｜ All data stays on your device ｜ [中文](README.md)

</div>

<p align="center">
  <img src="docs/screenshots/panel-light.png" width="300" alt="Side panel: the reading tree">
  &nbsp;
  <img src="docs/screenshots/panel-card.png" width="300" alt="Hover card: reading history">
</p>

> The user interface is currently in Chinese only.

## Why

With many tabs open, the browser's tab strip stops being useful: titles get squeezed, and the relationships between tabs disappear. When you research something (say, reading paper A, opening its references B, C and D, then opening E, F and G from B), you quickly lose track of where C and D went and which ones you have already read.

Tab Trail does not replace the tab strip. It adds a **reading tree** in the side panel.

## Features

- **Reading tree**: links opened with Ctrl+click or middle-click are attached under the page they came from. Tree lines show the structure, and the path to the current tab is highlighted.
- **Reading history**: unread tabs are marked; each row shows when you last read it, and a thin bar shows how long. Pages you navigated through inside the same tab are remembered too.
- **"Next unread"** (`N`): jumps to the next unread tab in tree order.
- **Find anything**: search titles, URLs, notes and in-tab history. Press **`Alt+K` on any page** for a quick switcher. Filters: unread, starred, duplicates, stashed, closed.
- **Workspaces**: one per window. Name them, switch between them, stash a whole workspace and restore it later. Closing a window stashes its workspace instead of losing it.
- **Stash and restore**: stash a branch (tabs close, the records stay in the tree) and restore it later with the same structure.
- **Organize**: drag and drop to restructure the tree, move branches between workspaces, rename entries (`F2`, shown only inside Tab Trail), stars and notes, duplicate-tab warnings, cleaner titles (site names like "- YouTube" are removed), PDF detection.
- **Save memory**: tabs you have not looked at for a while are put to sleep automatically (default: 2 hours).
- **Export**: a branch or a whole workspace as a Markdown checklist, or as a bookmarks file any browser can import.
- Light and dark themes, compact mode, three font sizes.

<p align="center">
  <img src="docs/screenshots/switcher.png" width="560" alt="Alt+K quick switcher">
</p>

## Install

Not yet in any extension store. Load it manually (no build step needed):

1. Download the latest `tab-trail-v*.zip` from the **[Releases page](https://github.com/t44460298-dotcom/tab-trail/releases/latest)** and unzip it somewhere permanent.
2. **Chrome / Edge**: open `chrome://extensions` (or `edge://extensions`), turn on Developer mode, click "Load unpacked" and choose the unzipped folder.
3. **Firefox**: open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on" and choose the zip file. Temporary add-ons are removed when Firefox restarts.

To upgrade, unzip the new version **over the same folder** and click the reload button on the extensions page. Chrome / Edge identify an unpacked extension by its folder, so loading it from a different folder would start with empty history.

For unreleased code, download the repository (**Code → Download ZIP**) and load its `extension` folder.

Requires Chrome / Edge 121+ or Firefox 121+.

Shortcuts: `Alt+Shift+Q` opens the side panel, `Alt+K` opens the quick switcher. Both can be changed at `chrome://extensions/shortcuts`.

## Privacy

Tab Trail makes no network requests and collects nothing. Everything is stored in your browser's `storage.local` and is deleted when you remove the extension.

| Permission | Why |
|---|---|
| `tabs` | Read tab titles, URLs and openers to build the tree |
| `storage`, `unlimitedStorage` | Keep the history locally without the 10 MB limit |
| `alarms` | Check every 5 minutes for tabs to put to sleep |
| `sidePanel` | Show the panel in Chrome / Edge |
| `favicon` | Show site icons in Chrome / Edge, including for closed tabs |

## Related projects

Tree-structured tabs are not a new idea: [Tree Style Tab](https://github.com/piroor/treestyletab) (since 2007) and [Sidebery](https://github.com/mbnuqw/sidebery) are excellent open-source Firefox extensions and inspired much of this work. Tab Trail differs in that it runs on Chrome, Edge and Firefox from one codebase, and it focuses on reading history (read or not, when, how long, how you got there) rather than only arranging tabs.

## Development

No dependencies and no build step. Node.js 18+ is only needed for tests and the preview:

```bash
npm test          # background logic against a mock browser, and title cleanup
npm run preview   # side panel with sample data at http://localhost:5178/
```

See the Chinese README for the file layout. Issues and pull requests are welcome.

## License

[MIT](LICENSE)
