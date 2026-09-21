const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, screen, nativeImage, clipboard, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ---- Configuration ------------------------------------------------------
const TAB_THICKNESS = 36;   // thickness of the little handle that stays visible when collapsed
const PANEL_WIDTH = 560;    // width of the note-taking panel in its normal (unrotated) orientation
const PANEL_HEIGHT = 480;   // height of the note-taking panel in its normal (unrotated) orientation
const EDGE_MARGIN = 12;     // gap between the docked edge and the widget when expanded/collapsed
const PEEK_REVEAL = 46;     // px of the panel revealed when hovering the collapsed tab
const TOGGLE_SHORTCUT = 'CommandOrControl+Shift+N';
const NOTES_FILE = path.join(__dirname, 'notes.json');
const TODOS_FILE = path.join(__dirname, 'todos.json');
const PROJECTS_FILE = path.join(__dirname, 'projects.json');
const DOCK_FILE = path.join(__dirname, 'dock.json');
const ANIM_DURATION = 160; // ms
const DRAG_SETTLE_DELAY = 150; // ms of no further position changes before we treat a drag as finished
const DRAG_POLL_INTERVAL = 90; // ms between bounds checks while watching for a drag

const DEFAULT_TODOS = [
  { id: 'seed-1', text: 'Set up a call with Gaurav to go over Backlog', done: false },
  { id: 'seed-2', text: 'Payment Failure Kickoff', done: false },
  { id: 'seed-3', text: 'TripStyler Integration Call', done: false },
  { id: 'seed-4', text: 'Bulk Invoice GTM documentation', done: false },
];

let win = null;
let tray = null;
let collapsed = true;
let peeking = false;
let saveNoteTimer = null;
let saveTodosTimer = null;
let saveProjectsTimer = null;
let animTimer = null;
let dragSettleTimer = null;

// True while WE are the ones changing the window's bounds (our own
// collapse/expand/peek animations) -- the drag-watcher poller below ignores
// bounds changes while this is set, so it only reacts to the renderer's
// manual drag-move messages (see dragOrigin below), not our own scripted
// moves.
let programmaticMove = false;
let lastPolledBounds = null;

// Set for the duration of a manual drag (mousedown-to-mouseup on the tab,
// relayed from the renderer since dragging is implemented in JS there, not
// via -webkit-app-region -- see the comment on .tab in styles.css for why).
// Captures the window's position at drag-start and the cursor's screen
// position at drag-start, so each drag-move can compute the new window
// position from how far the cursor has moved since, rather than needing
// any absolute cursor-position query.
let dragOrigin = null;

// Which screen edge the widget is currently docked to, and how far along
// that edge (0..1) it sits. Persisted so it comes back in the same spot.
let dockEdge = 'right'; // 'left' | 'right' | 'top' | 'bottom'
let dockFraction = 0.05; // 0 = top/left end of the edge, 1 = bottom/right end

// ---- JSON persistence helpers --------------------------------------------
function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function writeJsonNow(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(`Failed to save ${path.basename(file)}:`, err);
  }
}

function loadNotes() {
  const data = readJson(NOTES_FILE, { text: '' });
  return typeof data.text === 'string' ? data.text : '';
}

function saveNotesNow(text) {
  writeJsonNow(NOTES_FILE, { text, savedAt: new Date().toISOString() });
}

function saveNotesDebounced(text) {
  clearTimeout(saveNoteTimer);
  saveNoteTimer = setTimeout(() => saveNotesNow(text), 300);
}

function loadTodos() {
  if (!fs.existsSync(TODOS_FILE)) return DEFAULT_TODOS;
  const data = readJson(TODOS_FILE, { items: DEFAULT_TODOS });
  return Array.isArray(data.items) ? data.items : DEFAULT_TODOS;
}

function saveTodosNow(items) {
  writeJsonNow(TODOS_FILE, { items, savedAt: new Date().toISOString() });
}

function saveTodosDebounced(items) {
  clearTimeout(saveTodosTimer);
  saveTodosTimer = setTimeout(() => saveTodosNow(items), 300);
}

// Projects are a tree of folders and notes, nested to any depth. Older saves
// only ever had flat {id, name} entries (a project with no contents yet) --
// normalize those into empty folders so existing data keeps working and can
// now be opened and filled with sub-folders/notes.
function normalizeProjectNode(node) {
  if (!node || typeof node !== 'object') return null;
  // Older saves predate createdAt entirely; leave it null rather than
  // inventing a date, so the Today view's "Notes Created" list doesn't
  // mistakenly claim old notes were made today.
  const createdAt = typeof node.createdAt === 'string' ? node.createdAt : null;
  if (node.type === 'note') {
    return {
      id: node.id,
      name: typeof node.name === 'string' ? node.name : 'Untitled',
      type: 'note',
      content: typeof node.content === 'string' ? node.content : '',
      createdAt,
    };
  }
  return {
    id: node.id,
    name: typeof node.name === 'string' ? node.name : 'Untitled',
    type: 'folder',
    children: Array.isArray(node.children) ? node.children.map(normalizeProjectNode).filter(Boolean) : [],
    createdAt,
  };
}

function loadProjects() {
  const data = readJson(PROJECTS_FILE, { items: [] });
  const rawItems = Array.isArray(data.items) ? data.items : [];
  return rawItems.map(normalizeProjectNode).filter(Boolean);
}

function saveProjectsNow(items) {
  writeJsonNow(PROJECTS_FILE, { items, savedAt: new Date().toISOString() });
}

function saveProjectsDebounced(items) {
  clearTimeout(saveProjectsTimer);
  saveProjectsTimer = setTimeout(() => saveProjectsNow(items), 300);
}

const VALID_EDGES = ['left', 'right', 'top', 'bottom'];

function loadDock() {
  const data = readJson(DOCK_FILE, null);
  if (data && VALID_EDGES.includes(data.edge) && typeof data.fraction === 'number') {
    dockEdge = data.edge;
    dockFraction = Math.min(1, Math.max(0, data.fraction));
  }
}

function saveDockNow() {
  writeJsonNow(DOCK_FILE, { edge: dockEdge, fraction: dockFraction });
}

function displayName() {
  try {
    const raw = os.userInfo().username || '';
    const clean = raw.replace(/[._-]+/g, ' ').trim();
    if (!clean) return '';
    return clean
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  } catch (err) {
    return '';
  }
}

// ---- Window geometry -------------------------------------------------
// The widget can dock to any of the four screen edges. Docked to the left
// or right, it's laid out as a row (tab beside panel, both 480px tall).
// Docked to the top or bottom, it's laid out as a column (tab above/below
// panel, both 560px wide) -- the panel's own internal layout never changes,
// only which side the 36px tab sits on and which way the window opens.
function isVerticalDock(edge = dockEdge) {
  return edge === 'left' || edge === 'right';
}

// The window's actual pixel size for a given state. Collapsed/peek shrink
// the "across the dock edge" dimension down to just the tab's thickness
// (plus a peek reveal) -- the window itself gets smaller, rather than
// staying full-size and being pushed off past the display's edge to hide
// the panel. That off-screen-push approach silently breaks on any monitor
// arrangement where "past this display's edge" isn't actually empty space
// (e.g. two monitors placed side by side) -- the panel bleeds onto the
// neighboring screen instead of hiding. Shrinking the real window sidesteps
// that entirely: content beyond the window's own pixel bounds simply isn't
// painted, regardless of what is or isn't on other monitors.
function windowSize(state = 'expanded', edge = dockEdge) {
  const vertical = isVerticalDock(edge);
  const full = vertical
    ? { width: TAB_THICKNESS + PANEL_WIDTH, height: PANEL_HEIGHT }
    : { width: PANEL_WIDTH, height: TAB_THICKNESS + PANEL_HEIGHT };
  if (state === 'expanded') return full;
  const across = state === 'peek' ? TAB_THICKNESS + PEEK_REVEAL : TAB_THICKNESS;
  return vertical ? { ...full, width: across } : { ...full, height: across };
}

function getTargetDisplay() {
  // Use the display under the cursor so the widget shows up on whichever
  // monitor you're currently working on.
  const cursor = screen.getCursorScreenPoint();
  return screen.getDisplayNearestPoint(cursor);
}

// The position along the docked edge (independent of collapsed/expanded/
// peek state, which only affects the perpendicular axis).
function alongEdgeOffset(display) {
  const area = display.workArea;
  if (isVerticalDock()) {
    const available = Math.max(0, area.height - 2 * EDGE_MARGIN - PANEL_HEIGHT);
    return area.y + EDGE_MARGIN + dockFraction * available;
  }
  const available = Math.max(0, area.width - 2 * EDGE_MARGIN - PANEL_WIDTH);
  return area.x + EDGE_MARGIN + dockFraction * available;
}

// The position across the docked edge. Right/bottom anchor the window's
// FAR edge at (display edge - margin) and grow inward as the window's own
// size increases; left/top anchor the NEAR edge at (display edge + margin)
// and stay put regardless of size, since it's already flush.
function acrossEdgeOffset(display, state) {
  const area = display.workArea;
  const size = windowSize(state);
  if (dockEdge === 'right') return area.x + area.width - EDGE_MARGIN - size.width;
  if (dockEdge === 'left') return area.x + EDGE_MARGIN;
  if (dockEdge === 'bottom') return area.y + area.height - EDGE_MARGIN - size.height;
  return area.y + EDGE_MARGIN; // top
}

function computeTargetBounds(display, state) {
  const size = windowSize(state);
  const across = acrossEdgeOffset(display, state);
  const along = alongEdgeOffset(display);
  const { x, y } = isVerticalDock() ? { x: across, y: along } : { x: along, y: across };
  return { x: Math.round(x), y: Math.round(y), width: size.width, height: size.height };
}

function currentState() {
  if (!collapsed) return 'expanded';
  return peeking ? 'peek' : 'collapsed';
}

// setBounds' native `animate` flag only has any effect on macOS, and this
// widget targets Windows too, so we hand-roll a short ease-out slide.
// Every call funnels through here or setBoundsNow so `programmaticMove` is
// always set around our own bounds changes -- see the flag's comment above.
function animateToBounds(target, duration = ANIM_DURATION) {
  if (!win) return;
  clearInterval(animTimer);
  const start = win.getBounds();
  const unchanged = start.x === target.x && start.y === target.y && start.width === target.width && start.height === target.height;

  if (duration <= 0 || unchanged) {
    setBoundsNow(target);
    return;
  }

  programmaticMove = true;
  const startTime = Date.now();
  animTimer = setInterval(() => {
    const t = Math.min(1, (Date.now() - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    const x = Math.round(start.x + (target.x - start.x) * eased);
    const y = Math.round(start.y + (target.y - start.y) * eased);
    const width = Math.round(start.width + (target.width - start.width) * eased);
    const height = Math.round(start.height + (target.height - start.height) * eased);
    if (win) win.setBounds({ x, y, width, height });
    if (t >= 1) {
      clearInterval(animTimer);
      setTimeout(() => {
        programmaticMove = false;
        // The drag-watcher poller runs on its own independent timer and
        // can be one animation frame stale right at this instant; if left
        // to catch up on its own next tick, that staleness reads as a
        // few-pixel "drag" the moment the lock releases. Reading the
        // authoritative bounds straight from the window here (not the
        // `target` we requested -- the OS's actual applied value, in case
        // of any rounding difference) closes that race outright.
        if (win) lastPolledBounds = win.getBounds();
      }, 50);
    }
  }, 16);
}

function setBoundsNow(bounds) {
  if (!win) return;
  clearInterval(animTimer);
  programmaticMove = true;
  win.setBounds(bounds);
  setTimeout(() => {
    programmaticMove = false;
    if (win) lastPolledBounds = win.getBounds(); // see comment in animateToBounds
  }, 50);
}

function positionWindow(animate = true) {
  if (!win) return;
  const display = getTargetDisplay();
  const bounds = computeTargetBounds(display, currentState());
  if (animate) {
    animateToBounds(bounds);
  } else {
    setBoundsNow(bounds);
  }
}

function setCollapsed(next, { animate = true } = {}) {
  collapsed = next;
  peeking = false;
  positionWindow(animate);
  if (win) win.webContents.send('collapsed-changed', collapsed);
}

function toggleCollapse() {
  setCollapsed(!collapsed);
}

function startPeek() {
  if (!collapsed || peeking) return;
  peeking = true;
  positionWindow(true);
}

function endPeek() {
  if (!collapsed || !peeking) return;
  peeking = false;
  positionWindow(true);
}

function sendDockState() {
  if (win) win.webContents.send('dock-changed', { edge: dockEdge });
}

// ---- Drag-to-redock ----------------------------------------------------
// The tab is a manual JS drag handle (mousedown/mousemove/mouseup in
// renderer.js, relayed via drag-start/drag-move/drag-end IPC below). Once a
// drag ends (or, as a fallback, once the drag-watcher poller sees the
// window stop moving), figure out which of the four edges it's now closest
// to and re-dock there.
//
// `bounds` reflects whatever size the window happened to be *during* the
// drag -- typically the collapsed tab (36px thick) or peek size, since
// that's what you actually grab, not the full expanded panel. Only the
// dimension along the PRE-drag dock's across-edge axis can be shrunk like
// that (the other axis is always full-size); reconstruct the as-if-expanded
// footprint before doing any center-based math below, or a drag started
// from the collapsed tab would misjudge distances using a much smaller
// width/height than a drag started from the expanded panel would.
function reconstructExpandedBounds(bounds) {
  const vertical = isVerticalDock();
  const expanded = windowSize('expanded');
  let x = bounds.x;
  let y = bounds.y;
  if (vertical) {
    // Width may be shrunk; right-docked windows anchor their FAR (right)
    // edge, left-docked windows anchor their NEAR (left) edge.
    if (dockEdge === 'right') x = bounds.x + bounds.width - expanded.width;
  } else if (dockEdge === 'bottom') {
    y = bounds.y + bounds.height - expanded.height;
  }
  return { x, y, width: expanded.width, height: expanded.height };
}

function nearestEdgeAndFraction(display, rawBounds) {
  const area = display.workArea;
  const bounds = reconstructExpandedBounds(rawBounds);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  const distLeft = centerX - area.x;
  const distRight = area.x + area.width - centerX;
  const distTop = centerY - area.y;
  const distBottom = area.y + area.height - centerY;
  const closest = Math.min(distLeft, distRight, distTop, distBottom);

  let edge = 'right';
  if (closest === distLeft) edge = 'left';
  else if (closest === distTop) edge = 'top';
  else if (closest === distBottom) edge = 'bottom';
  else edge = 'right';

  let fraction;
  if (edge === 'left' || edge === 'right') {
    const available = Math.max(1, area.height - 2 * EDGE_MARGIN - PANEL_HEIGHT);
    fraction = (centerY - PANEL_HEIGHT / 2 - area.y - EDGE_MARGIN) / available;
  } else {
    const available = Math.max(1, area.width - 2 * EDGE_MARGIN - PANEL_WIDTH);
    fraction = (centerX - PANEL_WIDTH / 2 - area.x - EDGE_MARGIN) / available;
  }
  fraction = Math.min(1, Math.max(0, fraction));
  return { edge, fraction };
}

function handleDragSettled() {
  if (!win) return;
  const display = getTargetDisplay();
  const bounds = win.getBounds();
  const { edge, fraction } = nearestEdgeAndFraction(display, bounds);

  const edgeChanged = edge !== dockEdge;
  dockEdge = edge;
  dockFraction = fraction;
  saveDockNow();
  if (edgeChanged) sendDockState();

  // Settle into the collapsed tab at the new spot, same as dropping a real
  // draggable panel -- predictable, and avoids reasoning about what a
  // half-dragged "expanded" window of a now-different orientation means.
  collapsed = true;
  peeking = false;
  if (win) win.webContents.send('collapsed-changed', true);
  // If the orientation flipped (e.g. right -> top), the window's own size
  // needs to catch up too; setBoundsNow re-applies width/height along with
  // position in one go.
  setBoundsNow(computeTargetBounds(display, 'collapsed'));
}

// Electron's 'moved' event turns out not to fire reliably for this window
// (frameless + transparent + always-on-top), so instead of relying on it,
// just poll the actual bounds at a light interval. Cheap (one getBounds()
// call every ~90ms) and works regardless of what native events do or don't
// fire for this window type.
function pollForDrag() {
  if (!win) return;
  const current = win.getBounds();
  if (programmaticMove) {
    lastPolledBounds = current;
    return;
  }
  const moved =
    lastPolledBounds &&
    (current.x !== lastPolledBounds.x ||
      current.y !== lastPolledBounds.y ||
      current.width !== lastPolledBounds.width ||
      current.height !== lastPolledBounds.height);
  if (moved) {
    clearTimeout(dragSettleTimer);
    dragSettleTimer = setTimeout(handleDragSettled, DRAG_SETTLE_DELAY);
  }
  lastPolledBounds = current;
}

// ---- Window / tray creation -------------------------------------------
function createWindow() {
  const size = windowSize(currentState()); // starts collapsed -- see `let collapsed = true` above
  win = new BrowserWindow({
    width: size.width,
    height: size.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setMenuBarVisibility(false);
  lastPolledBounds = win.getBounds();
  setInterval(pollForDrag, DRAG_POLL_INTERVAL);

  win.loadFile('index.html');

  win.once('ready-to-show', () => {
    positionWindow(false);
    win.show();
  });

  win.webContents.on('did-finish-load', () => {
    win.webContents.send('load-note', loadNotes());
    win.webContents.send('init-data', {
      username: displayName(),
      todos: loadTodos(),
      projects: loadProjects(),
      dockEdge,
    });
    win.webContents.send('collapsed-changed', collapsed);
  });

  // Re-position if the display configuration changes (monitor unplugged, etc).
  screen.on('display-metrics-changed', () => positionWindow(false));
  screen.on('display-added', () => positionWindow(false));
  screen.on('display-removed', () => positionWindow(false));
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  let image = nativeImage.createFromPath(iconPath);
  if (process.platform === 'darwin') {
    image = image.resize({ width: 16, height: 16 });
    image.setTemplateImage(false);
  }
  tray = new Tray(image);
  tray.setToolTip('Notepad widget');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Show / Hide Notepad',
      click: () => toggleCollapse(),
    },
    { type: 'separator' },
    {
      label: `Shortcut: ${TOGGLE_SHORTCUT}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => toggleCollapse());
}

// ---- IPC handlers -------------------------------------------------------
ipcMain.on('toggle-collapse', () => toggleCollapse());
ipcMain.on('collapse-now', () => setCollapsed(true));
ipcMain.on('peek-start', () => startPeek());
ipcMain.on('peek-end', () => endPeek());

// Manual drag-to-redock: the renderer decides click-vs-drag itself (see the
// comment on the mousedown handler in renderer.js for why), and only calls
// these once an actual drag is underway. Each drag-move computes the new
// window position from how far the cursor has moved since drag-start, then
// applies that same delta to the window's drag-start position -- so this
// works regardless of DPI/monitor as long as screenX/screenY from the
// renderer's mouse events line up with setBounds' coordinate space, which
// they do. Collapsed/expanded doesn't matter here: whatever the window's
// current size is, it's dragged as-is and reshaped to fit the new edge
// once handleDragSettled() runs (via drag-end, or the poller as a
// fallback if drag-end is ever missed).
ipcMain.on('drag-start', (_event, point) => {
  if (!win) return;
  const bounds = win.getBounds();
  dragOrigin = {
    winX: bounds.x,
    winY: bounds.y,
    width: bounds.width,
    height: bounds.height,
    cursorX: point.screenX,
    cursorY: point.screenY,
  };
});

ipcMain.on('drag-move', (_event, point) => {
  if (!win || !dragOrigin) return;
  const dx = point.screenX - dragOrigin.cursorX;
  const dy = point.screenY - dragOrigin.cursorY;
  win.setBounds({
    x: Math.round(dragOrigin.winX + dx),
    y: Math.round(dragOrigin.winY + dy),
    width: dragOrigin.width,
    height: dragOrigin.height,
  });
});

ipcMain.on('drag-end', (_event, wasDrag) => {
  dragOrigin = null;
  if (wasDrag) {
    clearTimeout(dragSettleTimer);
    handleDragSettled();
  }
});

ipcMain.on('save-note', (_event, text) => saveNotesDebounced(text));
ipcMain.on('save-todos', (_event, items) => saveTodosDebounced(items));
ipcMain.on('save-projects', (_event, items) => saveProjectsDebounced(items));
ipcMain.on('copy-text', (_event, text) => clipboard.writeText(typeof text === 'string' ? text : ''));

// ---- App lifecycle -------------------------------------------------------
app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide(); // this is a background widget, not a regular app
  }

  // The Transcribe button uses the renderer's built-in SpeechRecognition,
  // which needs microphone access. Electron blocks media permission
  // requests by default, so explicitly allow them for this app's own pages.
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => permission === 'media');

  loadDock();
  createWindow();
  createTray();

  const registered = globalShortcut.register(TOGGLE_SHORTCUT, () => toggleCollapse());
  if (!registered) {
    console.warn(`Could not register global shortcut ${TOGGLE_SHORTCUT} (probably already in use).`);
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Keep running in the tray even if every window is "closed" -- in practice
// our window is never closed by the user (there's no close button), only
// hidden/collapsed, but this guards against platform quirks.
app.on('window-all-closed', (event) => {
  event.preventDefault();
});
