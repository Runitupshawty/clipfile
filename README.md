# Copy File to Clipboard

An Obsidian plugin that puts **the actual file** on your clipboard — not a link
to it, not its text. Paste into Gmail, Outlook, Slack or Finder and you get a
real attachment.

Right-click any file in the explorer → **Copy file to clipboard**. Or run
**Copy active file to clipboard** from the command palette for the note you have
open.

macOS and Windows. Desktop only.

## Why this exists

Dragging a file out of Obsidian doesn't attach it. A plain drag drops an
`obsidian://` link into the other app, which is useless if what you wanted was
to email someone the PDF.

The obvious fix is a drag-out plugin, and that road is closed: in Obsidian
1.13.7 / Electron 39 the drag code runs without error but macOS never starts a
drag session ([electron#45197](https://github.com/electron/electron/issues/45197)).

So this takes the other route. The clipboard can carry a file reference on both
platforms, and every app already knows how to paste one.

## How it works

One mechanism per platform, chosen at runtime, so the same plugin folder works
in a vault that syncs between Macs and Windows machines.

**macOS** — `osascript` with `set the clipboard to POSIX file`. This sets both
`public.file-url` *and* the legacy `NSFilenamesPboardType`, which are the two
pasteboard types Chromium reads on paste. Setting only the first is why some
approaches paste nothing into Gmail. There's an Electron `writeBuffer` fallback
if `osascript` is unavailable, but it only sets `public.file-url`, so it may not
satisfy Gmail — it's there so the command doesn't silently do nothing.

**Windows** — PowerShell `Set-Clipboard -LiteralPath`, which puts the file on
the clipboard as `CF_HDROP`. That ships with Windows as PowerShell 5.1, so it
doesn't need pwsh 7 installed.

Both paths were checked end to end: a vault PDF pasted into a real Gmail compose
window as an attachment on macOS, and the clipboard verified to hold the file on
Windows.

Filenames with spaces, quotes, backslashes, `&`, `[`, `]` and unicode all work.
The path is never string-concatenated into a script: on macOS it's passed as an
`argv` item to AppleScript, and on Windows the whole script goes through
`-EncodedCommand` as base64 UTF-16LE. The only escaping is doubling single
quotes for the PowerShell string literal.

## Install

Not in the community plugin directory (yet). To install by hand:

1. Download `main.js` and `manifest.json` from the latest release.
2. Put them in `<your vault>/.obsidian/plugins/clipfile/`.
3. Restart Obsidian, then enable **Copy File to Clipboard** in
   Settings → Community plugins.

If your vault syncs between machines, the plugin folder syncs with it and you
only have to do this once.

Want a keyboard shortcut? Settings → Hotkeys, search "copy active file", and
bind whatever you like. There's no default binding on purpose.

## Building

There's nothing to build. `main.js` is the source — plain CommonJS against the
Obsidian API, no TypeScript, no bundler, no dependencies. Edit it and reload the
plugin.

## Licence

MIT — see [LICENSE](LICENSE).
