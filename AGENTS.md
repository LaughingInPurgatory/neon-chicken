# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## What this is

A self-contained **Electron desktop app** — **Neon-Chicken**, an HTML5 Canvas arcade game (all graphics procedural, sound effects synthesized; music from three bundled mp3 tracks) with a plain-text high-score database. The app loads the game directly from packaged files — **there is no server** — and outside its own bundle it only writes `scores.txt` plus `window.json` (last window size/position).

## Run / build / test

```
npm install     # fetches Electron + electron-builder (large download)
npm start       # run the app (electron .)
npm test        # run the score-database tests (node test/scores.test.js)
npm run dist    # package installers into dist/ via electron-builder
```

`node --check <file>` is a fast syntax gate. There is no linter. To verify the app end-to-end headlessly (window loads the game under CSP + scores round-trip over IPC), drive it with an Electron script that `loadFile`s `renderer/index.html` with the real `preload.js` and calls `webContents.executeJavaScript` against `window.neonChickenAPI` and `window.__neonChicken` (a `cv` canvas width of 960 confirms `game.js` ran).

## Architecture

The app is split across two Electron processes. **Keep the split clean** — the renderer is sandboxed (`contextIsolation: true`, `nodeIntegration: false`) and must reach the system only through the preload bridge.

- **`main.js` (main process).** Creates the `BrowserWindow` (default 1600×900, icon `flibble.jpg`, bounds restored from `window.json`), `loadFile`s `renderer/index.html` (no server, no `loadURL`), and registers two IPC handlers (`scores:get`, `scores:add`) backed by the score DB. No application menu. Alt+Enter toggles fullscreen; Cmd/Ctrl+Q and closing the window quit (including macOS — no stay-alive-without-window). `NEON_CHICKEN_FULLSCREEN=1` starts fullscreen.
- **`preload.js`.** The *only* bridge into the renderer: `contextBridge.exposeInMainWorld('neonChickenAPI', { getScores, addScore })`, each an `ipcRenderer.invoke`. Do not widen this surface without reason.
- **`scores.js`.** The flat-file DB as a plain-node module (no Electron import, so it's unit-tested in `test/scores.test.js`). `createScoreDB(file, maxScores)` → `{ loadScores, addScore }`.
- **`renderer/index.html`.** Window shell: the canvas, inline CSS, a strict CSP (`script-src 'self'; media-src 'self'`), and `<script src="game.js">`. Because CSP forbids inline scripts, all game code stays in `game.js`.
- **`renderer/audio/`.** The three mp3 music tracks (packaged via the `renderer/**/*` entry in the electron-builder `files` list).
- **`renderer/game.js`.** The entire game, an IIFE. Pure browser code; its only outside contact is `window.neonChickenAPI` (see `fetchScores`/`postScore`). It exposes `window.__neonChicken` for headless testing.

Score persistence path: game → `window.neonChickenAPI.addScore` (preload) → `ipcRenderer.invoke` → `ipcMain.handle` in `main.js` → `scores.js` → `<userData>/scores.txt`.

### Score database (`scores.txt`)

Genuinely plain text, one entry per line: `NAME SCORE DATE` (e.g. `ACE 55555 2026-07-07`). Lives in `app.getPath('userData')` (the packaged app is a read-only asar). Parsed defensively (malformed lines skipped), sorted descending, truncated to the top 10. Writes serialize through a `writeChain` promise. `addScore` sanitizes `name` to 1–3 uppercase A–Z chars and rejects non-positive or absurdly large scores, returning the current table unchanged on bad input.

### Game structure (`renderer/game.js`)

Organized as labelled comment sections: config → input → audio → high scores → platforms/waves → entities → particles/FX → rendering → state machine → main loop. Notable design points:

- **Fixed-timestep simulation.** The main loop (`frame`) accumulates real time and steps `tick(DT)` at a fixed 1/60s (with a `freeze` hit-stop mechanism and a step cap), while `render()` runs every animation frame. Put gameplay logic in `tick`/its callees, visual-only work in `render`.
- **State machine.** `state` is one of `ST.INTRO / PLAY / DYING / WAVECLEAR / OVER / NAME`; both `tick` and `render` switch on it. Trace `startGame` → `startWave` → the `PLAY` case → `DYING`/`OVER`/`NAME`.
- **Wave rule.** Wave N spawns N+1 enemies (wave 1 = 2). A wave is cleared only when `enemies`, `eggs`, and `pending` (queued spawns) are all empty. Enemy tiers are in `TIERS`; `tierFor` biases toward harder tiers on later waves.
- **Unified input.** `pollInput()` merges keyboard state and the Gamepad API into one `input`/`edge` abstraction polled once per tick; game code reads those, never raw key events (except the name-entry text path).
- **Graphics and SFX are procedural.** Sprites are drawn with Canvas paths + `shadowBlur` (see `drawBird`); sound effects are synthesized with the Web Audio API (`sfx`). There are no image assets.
- **Music is three bundled mp3s** in `renderer/audio/` (`intro` title, `bg` level — both looping, `dead` game-over — one-shot). `syncMusic()` runs each tick and swaps `curTrack` based on `state`; `musicOn` is the player's toggle (title-screen button + pause-menu item) while the `M` mute key silences everything. Two things make this work and must be preserved: `media-src 'self'` in the `index.html` CSP, and `autoplayPolicy: 'no-user-gesture-required'` in `main.js` webPreferences (otherwise Chromium blocks the title track until a click).
- **Debug/automation handle.** `window.__neonChicken` exposes state getters/setters and functions (`startGame`, `startWave`, `defeatEnemy`, `killPlayer`, …) for driving the game headlessly. Keep it in sync when adding gameplay you'll want to test.

### Collision note

Player↔enemy resolution lives in `combatCollisions()`. The height comparison decides win/lose/tie; the tie branch must push the two apart (both velocity and a positional separation nudge) or they re-overlap every frame and lock together. Preserve that separation logic when touching combat.

## Packaging & release

`npm run dist` builds via `electron-builder` (config is the `build` field in `package.json`); `build/afterPack.js` ad-hoc signs the macOS bundle so its helper processes run on unsigned downloads (no hardened runtime on that path — a hardened-runtime app that isn't notarized gets killed when quarantined). `build/entitlements.mac.plist` + `hardenedRuntime` apply only when a real cert is configured.

`.github/workflows/release.yml` builds on a macOS/Windows/Linux runner matrix on `v*` tags and publishes the installers — macOS `.dmg` (arm64+x64), Windows NSIS `.exe` (x64+arm64), Linux `.AppImage` (x64) — plus `SHA256SUMS.txt`, to a GitHub Release. It ships only installers (the collect step drops zips and the redundant combined NSIS installer). electron-builder signs automatically if the signing secrets (`CSC_LINK`/`CSC_KEY_PASSWORD`, Apple notarization vars) are set. `dist/`, `node_modules/`, and `scores.txt` are gitignored.
