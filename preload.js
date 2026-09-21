const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notepad', {
  toggleCollapse: () => ipcRenderer.send('toggle-collapse'),
  collapseNow: () => ipcRenderer.send('collapse-now'),
  peekStart: () => ipcRenderer.send('peek-start'),
  peekEnd: () => ipcRenderer.send('peek-end'),
  dragStart: (point) => ipcRenderer.send('drag-start', point),
  dragMove: (point) => ipcRenderer.send('drag-move', point),
  dragEnd: (wasDrag) => ipcRenderer.send('drag-end', wasDrag),
  saveNote: (text) => ipcRenderer.send('save-note', text),
  saveTodos: (todos) => ipcRenderer.send('save-todos', todos),
  saveProjects: (projects) => ipcRenderer.send('save-projects', projects),
  // Preload runs sandboxed, and `clipboard` isn't in the sandboxed module
  // allowlist (unlike ipcRenderer/contextBridge), so the write happens in
  // the main process instead, same as every other action here.
  copyText: (text) => ipcRenderer.send('copy-text', text),
  onLoadNote: (callback) => ipcRenderer.on('load-note', (_event, text) => callback(text)),
  onInitData: (callback) => ipcRenderer.on('init-data', (_event, data) => callback(data)),
  onCollapsedChanged: (callback) => ipcRenderer.on('collapsed-changed', (_event, isCollapsed) => callback(isCollapsed)),
  onDockChanged: (callback) => ipcRenderer.on('dock-changed', (_event, data) => callback(data)),
});
