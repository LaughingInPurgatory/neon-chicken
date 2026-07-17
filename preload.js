'use strict';
/*
 * Preload bridge. Exposes a tiny, safe high-score API to the game running in
 * the renderer. The renderer stays sandboxed (contextIsolation on,
 * nodeIntegration off); it can only call these two methods, which the main
 * process fulfils by reading/writing the flat-file score DB.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('neonChickenAPI', {
  getScores: () => ipcRenderer.invoke('scores:get'),
  addScore: (name, score) => ipcRenderer.invoke('scores:add', { name, score }),
  quit: () => ipcRenderer.send('app:quit') // Quit button -> exit the app
});
