'use strict';
/*
 * Neon-Chicken — Electron main process.
 *
 * Loads the game from packaged files (no HTTP server). Persists high scores
 * and window bounds to the per-user app-data folder — the only things written
 * outside the app bundle.
 */
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createScoreDB } = require('./scores');

const APP_TITLE = 'Neon-Chicken';
const ICON = path.join(__dirname, 'flibble.jpg');
const WIN_STATE = path.join(app.getPath('userData'), 'window.json');
const DEFAULT_W = 1600, DEFAULT_H = 900;

const db = createScoreDB(path.join(app.getPath('userData'), 'scores.txt'));

ipcMain.handle('scores:get', () => db.loadScores());
ipcMain.handle('scores:add', (_e, arg) => db.addScore(arg && arg.name, arg && arg.score));
ipcMain.on('app:quit', () => app.quit());

const ENV_FS = process.env.NEON_CHICKEN_FULLSCREEN === '1' || process.env.NEON_CHICKEN_FULLSCREEN === 'true';
let quitting = false;
let saveTimer = null;

function loadWinState() {
  try {
    const s = JSON.parse(fs.readFileSync(WIN_STATE, 'utf8'));
    const w = Number(s.width), h = Number(s.height);
    if (w >= 640 && h >= 480) return { width: w | 0, height: h | 0, x: s.x, y: s.y };
  } catch (_) { /* first run or corrupt — defaults */ }
  return { width: DEFAULT_W, height: DEFAULT_H };
}

function saveWinState(win) {
  if (!win || win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
  const b = win.getBounds();
  try {
    fs.writeFileSync(WIN_STATE, JSON.stringify({
      width: b.width, height: b.height, x: b.x, y: b.y
    }));
  } catch (_) { /* userData unwritable — ignore */ }
}

function scheduleSave(win) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveWinState(win), 200);
}

function createWindow() {
  const st = loadWinState();
  const opts = {
    width: st.width,
    height: st.height,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: '#020208',
    title: APP_TITLE,
    icon: ICON,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  };
  if (Number.isFinite(st.x) && Number.isFinite(st.y)) {
    opts.x = st.x | 0;
    opts.y = st.y | 0;
  }

  const win = new BrowserWindow(opts);
  win.setMenuBarVisibility(false);
  win.setTitle(APP_TITLE);
  if (ENV_FS) win.setFullScreen(true);

  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.on('resize', () => scheduleSave(win));
  win.on('move', () => scheduleSave(win));
  win.on('close', () => { clearTimeout(saveTimer); saveWinState(win); });

  // Alt+Enter toggles fullscreen; Cmd/Ctrl+Q quits (no app menu).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.alt && (input.key === 'Enter' || input.key === 'Return')) {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
      return;
    }
    if (input.key.toLowerCase() === 'q' && (input.meta || input.control) && !input.alt) {
      event.preventDefault();
      app.quit();
    }
  });

  // Keep window title from being overwritten by the document <title>.
  win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle(APP_TITLE); });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return win;
}

// No Electron application menu (File/Edit/View…). Cmd+Q handled above.
Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.setName(APP_TITLE);
    if (app.dock) {
      app.dock.show();
      try { app.dock.setIcon(ICON); } catch (_) { /* jpg fine on most Electron builds */ }
    }
  }
  createWindow();
  app.on('activate', () => {
    if (!quitting && BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => { quitting = true; });
// Quit when the last window closes — including macOS (no stay-in-dock-without-window).
app.on('window-all-closed', () => app.quit());
