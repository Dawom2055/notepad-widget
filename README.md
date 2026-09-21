# Notepad Widget

A small, always-on-top sticky-note style notepad that docks to the top-right
corner of your screen. Click the yellow tab (or press the shortcut) to slide
it open; click it again to slide it away, leaving just the tab visible.

- Floats above every other app (built with Electron, not a browser tab)
- Collapses to a slim tab at the screen edge, expands on click
- Global shortcut: `Ctrl+Shift+N` (`Cmd+Shift+N` on macOS) toggles it from anywhere
- Tray/menu-bar icon also toggles it, and lets you quit
- Notes are auto-saved to `notes.json` in the project folder as you type

## Running it in VS Code

1. Open this folder in VS Code (`File → Open Folder…`).
2. Open a terminal in VS Code (`` Ctrl+` ``) and install dependencies:

   ```bash
   npm install
   ```

3. Start the widget:

   ```bash
   npm start
   ```

   The notepad tab will appear near the top-right of your screen. Electron
   downloads a browser runtime the first time you `npm install`, so that
   step needs an internet connection and may take a minute or two.

4. To stop it, right-click (or click) the tray icon in your system tray /
   menu bar and choose **Quit**, or stop the process from the VS Code
   terminal (`Ctrl+C`).

You can leave it running in the background all day — it only shows the tab
until you click it or press the shortcut.

## Where your notes are stored

Plain text, in `notes.json` next to `main.js`, written a moment after you
stop typing. It's excluded from git via `.gitignore` so your notes don't
accidentally get committed. Back it up or sync it however you like (e.g.
point `NOTES_FILE` in `main.js` at a file inside a synced folder such as
Dropbox or iCloud Drive if you want it to follow you across machines).

## Customizing

Everything about size, position, colors, and the shortcut lives in a couple
of obvious places:

- `main.js`, top of the file — `TAB_WIDTH`, `PANEL_WIDTH`, `WINDOW_HEIGHT`,
  `TOP_MARGIN`, `RIGHT_MARGIN`, and `TOGGLE_SHORTCUT`.
- `styles.css` — colors, fonts, the sticky-note look.

By default it opens on whichever monitor your mouse cursor is on. If you'd
rather it always use your primary display, swap
`screen.getDisplayNearestPoint(cursor)` in `main.js` for
`screen.getPrimaryDisplay()`.

## Making it start automatically (optional)

If you want it running every time you log in:

- **macOS**: `System Settings → General → Login Items`, add a small script
  that runs `npm start` in this folder (or package the app first, see below).
- **Windows**: put a shortcut to `npm start` (via a `.bat` file) in your
  Startup folder (`shell:startup`).

## Packaging as a standalone app (optional, later)

Right now you run it with `npm start` through Node/Electron, which is the
simplest path for local development. If you eventually want a double-click
`.app` / `.exe` you don't need VS Code or a terminal for, add
[`electron-builder`](https://www.electron.build/) as a dev dependency and a
`build` script — happy to set that up when you're ready for it.
