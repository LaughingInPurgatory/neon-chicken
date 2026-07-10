'use strict';
/*
 * JOUST — Neon Edition — Electron main process.
 *
 * A fully self-contained desktop app: it loads the game directly from the
 * packaged files (no HTTP server) and persists high scores over IPC to a
 * plain-text file in the per-user app-data folder. That scores file is the
 * only thing this app ever writes outside its own bundle.
 */
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('node:path');
const { createScoreDB } = require('./scores');

// The one external file: <userData>/scores.txt (writable; the app itself is a
// read-only asar once packaged).
const db = createScoreDB(path.join(app.getPath('userData'), 'scores.txt'));

ipcMain.handle('scores:get', () => db.loadScores());
ipcMain.handle('scores:add', (_e, arg) => db.addScore(arg && arg.name, arg && arg.score));
ipcMain.on('app:quit', () => app.quit()); // pause-menu Quit button

const FULLSCREEN = process.env.JOUST_FULLSCREEN === '1' || process.env.JOUST_FULLSCREEN === 'true';

function createWindow() {
  const win = new BrowserWindow({
    width: 1024, height: 700, minWidth: 640, minHeight: 480,
    backgroundColor: '#020208',
    title: 'JOUST — Neon Edition',
    show: false, // reveal on ready-to-show so we never flash an empty frame
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The title-screen track must start without a click; the app is local-only.
      autoplayPolicy: 'no-user-gesture-required'
    }
  });
  Menu.setApplicationMenu(null);
  if (FULLSCREEN) win.setFullScreen(true);
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return win;
}

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.show();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit()); // closing the window quits the app
