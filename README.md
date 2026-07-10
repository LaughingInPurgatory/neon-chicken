# JOUST — Neon Edition

A modern remake of the 1982 Atari arcade classic **Joust**, as a self-contained neon desktop app. Flap your neon mount to gain height, ram enemy riders from above to unhorse them, collect the eggs they drop before they hatch, and survive wave after wave over a sea of lava.

Built with Electron: the game (HTML5 Canvas + Web Audio, all procedural) runs in the app window, and a tiny main process persists high scores to a plain-text file. No server, no browser to open — just run it.

## Play

Grab the [desktop app](#desktop-app) for your platform, double-click, and the game opens in its own window. Nothing else to install.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move | Arrow keys or `A` / `D` | Left stick / D-pad |
| Flap | `Space`, `↑`, or `W` | `A` (button 0) |
| Start / Confirm | `Enter` | `Start` |
| Pause menu | `Esc` (or `P`) | `Start` |
| Mute | `M` | — |

Flapping is a tap, not a hold — each press gives one upward beat, and gravity is always pulling you down. Gamepads are hot-pluggable.

Pressing `Esc` during play opens a **pause menu** showing the high scores with **Continue**, **Restart Game**, **Music: On/Off**, and **Quit Game** — navigate with the arrows, mouse, or gamepad.

## Music

The game has its own soundtrack: a title theme, looping level music, and a game-over track. Toggle it with the **MUSIC** button on the title screen or the **Music** item in the pause menu. (`M` mutes *all* audio, sound effects included.)

## How to play

- **Jousting:** when you collide with an enemy, whoever's rider is *higher* wins. Hit them from above to defeat them; get hit from above and you lose a life. Equal height bounces both riders apart.
- **Eggs:** a defeated rider drops an egg. Grab it for bonus points (worth more in a streak) — but if you leave it too long it hatches into a faster, tougher rider.
- **Waves:** wave 1 has 2 enemies, and each wave adds one more. A wave ends only when every enemy *and* every unhatched egg is gone.
- **Lava:** the bottom of the arena is deadly. Fly too low and the lava troll's hand may grab you — mash flap to break free.
- **Lives:** you start with 5, and earn an extra life every 20,000 points.

## Power-ups

Dropped by defeated enemies or floating in ambiently. Active effects show as ring timers in the HUD.

| Power-up | Effect |
| --- | --- |
| 🛡 Shield | Temporary invulnerability — enemies you touch are defeated |
| ⚡ Turbo | Faster acceleration and stronger flaps |
| ⏳ Chrono | Slows down enemies and eggs |
| ✕2 Double | Double points |
| ♥ Life | +1 life |

## High scores

Beat the tenth-place score and you'll enter your three initials on the game-over screen (type them, or cycle letters with the D-pad). The top 10 are saved to a plain-text `scores.txt` in the app's per-user data folder — one `NAME SCORE DATE` entry per line. This is the **only** file the app ever writes outside its own bundle. Delete it to reset the leaderboard.

## Features

- Faithful Joust flap physics, height-based combat, and eggs
- Three enemy tiers with escalating aggression, plus a lava troll
- Five power-ups
- All-procedural neon visuals: glowing sprites, particle effects, screen shake, parallax background, bubbling lava, CRT scanlines
- Runtime-synthesized sound effects (Web Audio API), plus a soundtrack — separate title, level, and game-over tracks — with a music on/off toggle
- Keyboard **and** gamepad support throughout

## Desktop app

The game ships as a **self-contained Electron desktop app** that bundles its own browser engine — it needs nothing installed (no Node, no browser). Double-click it and the game opens in a native window; close the window and it quits.

To run or build from source:

```
npm install     # one-time: fetches Electron + electron-builder (a large download)
npm start       # run the app locally
npm test        # run the score-database tests
npm run dist    # package installers into dist/
```

`npm run dist` produces, in `dist/`:

| Platform | Installer |
| --- | --- |
| macOS (Apple Silicon + Intel) | `.dmg` |
| Windows (x64 + ARM) | `.exe` (NSIS) |
| Linux (x64) | `.AppImage` |

Each machine builds its own platform's artifacts (Electron apps can't fully cross-compile), so the full set is produced by CI — see [Automated releases](#automated-releases). High scores are saved to `scores.txt` in the OS's per-user app-data folder (e.g. `~/Library/Application Support/joust-neon-edition/` on macOS, `%APPDATA%` on Windows).

### First launch (unsigned builds)

The released apps are **not** signed with a paid developer certificate (the macOS build is only ad-hoc signed), so the OS will warn the first time you open a downloaded copy:

- **macOS** — double-clicking shows "cannot be opened because the developer cannot be verified," and the window may not appear. Clear it once, either way:
  - **Right-click the app → Open → Open**, or
  - in Terminal: `xattr -cr "/path/to/JOUST Neon Edition.app"` then open it normally.
- **Windows** — SmartScreen shows "Windows protected your PC." Click **More info → Run anyway**.

After that first allow, it launches normally. To remove the warning entirely, the app needs code signing + notarization (see [Automated releases](#automated-releases)).

**Runtime options:** set `JOUST_FULLSCREEN=1` to launch the window fullscreen.

### Automated releases

Pushing a version tag builds the apps for all three platforms in CI (a macOS / Windows / Linux matrix) and publishes them, with `SHA256SUMS.txt`, to a GitHub Release:

```
git tag v1.3.0
git push origin v1.3.0
```

The workflow ([.github/workflows/release.yml](.github/workflows/release.yml)) also runs from the Actions tab on demand (building artifacts without publishing).

**Code signing is optional.** With no secrets configured the apps are unsigned — they run locally but trip Gatekeeper (macOS) and SmartScreen (Windows) on *other* machines. electron-builder signs automatically when these repository secrets are present:

| Secret | Purpose |
| --- | --- |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | base64 code-signing certificate (`.p12`/`.pfx`) and its password — signs macOS and/or Windows builds |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | notarizes the macOS build |

## Requirements

- **To play the desktop app:** nothing — it's self-contained.
- **To run or build from source:** Node.js and `npm install` (pulls Electron).

## Project layout

```
main.js              Electron main process — window + high-score IPC + file I/O
preload.js           contextBridge: exposes window.joustAPI to the game
scores.js            flat-file high-score database (plain node, unit-tested)
renderer/
  index.html         the app window shell (canvas + CSP)
  game.js            the entire game (Canvas + Web Audio + Gamepad)
  audio/             the three mp3 music tracks
build/               electron-builder resources (entitlements, afterPack signing)
test/scores.test.js  score-database tests (npm test)
```

The renderer is sandboxed (context isolation on, no Node access); its only bridge to the system is `window.joustAPI` for reading/saving scores. See [CLAUDE.md](CLAUDE.md) for architecture notes.
