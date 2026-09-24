const { Plugin, Notice, TFile } = require("obsidian");
const { execFile } = require("child_process");

// Returns the OS command that puts a real file on the clipboard (not text,
// not a link), so a paste into another app (e.g. Chrome/Gmail) attaches the
// file -- or null if the platform isn't supported. One mechanism per
// platform, chosen at runtime, so the same plugin folder works on a vault
// that syncs between mac and Windows machines.
function clipboardCommand(absPath) {
  if (process.platform === "darwin") {
    // Confirmed end to end: this exact call put a vault PDF on the clipboard
    // and it pasted into a real Gmail compose window as an attachment.
    // Confirmed on the pasteboard directly (AppKit inspection) that it sets
    // BOTH `public.file-url` and the legacy `NSFilenamesPboardType` -- the
    // two types Chromium's macOS clipboard code reads on paste -- and that
    // it survives quotes, spaces, backslashes, and unicode in the filename.
    // The path is passed as an argv item, never string-concatenated into
    // the AppleScript source, so no manual escaping is needed or attempted.
    const script = "on run argv\nset the clipboard to POSIX file (item 1 of argv)\nend run";
    return { cmd: "osascript", args: ["-e", script, "--", absPath] };
  }

  if (process.platform === "win32") {
    // Verified on Windows: Set-Clipboard -LiteralPath
    // puts the file on the clipboard as CF_HDROP, which is what a
    // paste-as-attachment needs. Ships with Windows as PowerShell 5.1, so
    // this doesn't require pwsh 7. The whole script is passed via
    // -EncodedCommand (base64 UTF-16LE) instead of as a quoted argv string,
    // so spaces, &, [, ], and unicode in the filename never need shell/argv
    // escaping -- only the PowerShell single-quote literal below needs its
    // quotes doubled. PowerShell also treats the curly quotes U+2018-U+201B
    // as single quotes, so "James’s file.pdf" would end the literal early.
    const psPath = absPath.replace(/['‘’‚‛]/g, "$&$&");
    const script = `Set-Clipboard -LiteralPath '${psPath}'`;
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    return {
      cmd: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      options: { windowsHide: true },
    };
  }

  return null;
}

function copyFileToClipboard(absPath, onDone) {
  const command = clipboardCommand(absPath);
  if (!command) {
    return onDone(false, `Unsupported platform (${process.platform}) -- only macOS and Windows are supported.`);
  }

  execFile(command.cmd, command.args, command.options || {}, (err) => {
    if (!err) return onDone(true, command.cmd);

    // macOS-only fallback, for the unlikely case osascript itself is
    // unavailable/blocked. NOT verified equivalent to the primary path --
    // writeBuffer only sets public.file-url, not NSFilenamesPboardType, so
    // it may not work for a real Gmail paste. It's here only so the command
    // doesn't silently do nothing.
    if (process.platform === "darwin") {
      try {
        const { clipboard } = require("electron");
        clipboard.writeBuffer("public.file-url", Buffer.from("file://" + encodeURI(absPath)));
        return onDone(true, "electron fallback (unverified)");
      } catch (e2) {
        return onDone(false, e2.message || String(e2));
      }
    }

    onDone(false, err.message || String(err));
  });
}

module.exports = class ClipFilePlugin extends Plugin {
  onload() {
    this.addCommand({
      id: "copy-active-file-to-clipboard",
      name: "Copy active file to clipboard",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) this.copyFile(file);
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile)) return;
        menu.addItem((item) =>
          item
            .setTitle("Copy file to clipboard")
            .setIcon("copy")
            .onClick(() => this.copyFile(file))
        );
      })
    );
  }

  copyFile(file) {
    const absPath = this.app.vault.adapter.getFullPath(file.path);
    copyFileToClipboard(absPath, (ok, info) => {
      if (ok) new Notice(`Copied "${file.name}" to clipboard`);
      else new Notice(`Copy failed: ${info}`);
    });
  }
};
