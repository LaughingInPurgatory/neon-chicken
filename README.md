# JOUST — Neon Edition

A modern, single-file web remake of the 1982 Atari arcade classic **Joust**. Flap your neon mount to gain height, ram enemy riders from above to unhorse them, collect the eggs they drop before they hatch, and survive wave after wave over a sea of lava.

No build step, no dependencies, no frameworks — just Node and a browser.

## Play

The easiest way is the [desktop app](#desktop-app) — download it, double-click, and the game opens in its own window. No browser, no install, nothing else needed.

You can also run it [as a plain web server](#also-runs-as-a-plain-web-server) from source:

```
node joust.js
```

Then open **http://localhost:8022** (override with `PORT=9000 node joust.js`; `npm start` is the same).

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move | Arrow keys or `A` / `D` | Left stick / D-pad |
| Flap | `Space`, `↑`, or `W` | `A` (button 0) |
| Start / Confirm | `Enter` | `Start` |
| Pause | `P` | `Start` |
| Mute | `M` | — |

Flapping is a tap, not a hold — each press gives one upward beat, and gravity is always pulling you down. Gamepads are hot-pluggable.

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

Beat the tenth-place score and you'll enter your three initials on the game-over screen (type them, or cycle letters with the D-pad). The top 10 are saved to a plain-text file, `scores.txt`, next to `joust.js` — one `NAME SCORE DATE` entry per line. Delete that file to reset the leaderboard.

## Features

- Faithful Joust flap physics, height-based combat, and eggs
- Three enemy tiers with escalating aggression, plus a lava troll
- Five power-ups
- All-procedural neon visuals: glowing sprites, particle effects, screen shake, parallax background, bubbling lava, CRT scanlines
- Runtime-synthesized sound and music via the Web Audio API (no audio files)
- Keyboard **and** gamepad support throughout

## Desktop app

The game ships as a **self-contained Electron desktop app** that bundles its own browser engine — it needs nothing installed (no Node, no browser). Double-click it and the game opens in a native window; close the window and it quits.

Build the app for your current platform:

```
npm install     # one-time: fetches Electron + electron-builder (a large download)
npm run app     # run the app locally without packaging
npm run dist    # package installers/archives into dist/
```

`npm run dist` produces, in `dist/`:

| Platform | Artifacts |
| --- | --- |
| macOS (Apple Silicon + Intel) | `.dmg` installer and `.zip` |
| Windows (x64 + ARM) | `.exe` (NSIS installer) and `.zip` |
| Linux (x64) | `.AppImage` and `.tar.gz` |

Each machine builds its own platform's artifacts (Electron apps can't fully cross-compile), so the full set is produced by CI — see [Automated releases](#automated-releases). High scores are saved to `scores.txt` in the OS's per-user app-data folder (e.g. `~/Library/Application Support/joust-neon-edition/` on macOS, `%APPDATA%` on Windows).

**Runtime options** (env vars, for the app or `node joust.js`):

| Env | Effect |
| --- | --- |
| `JOUST_FULLSCREEN=1` | Launch the window fullscreen |
| `PORT=9000` | Serve on a specific port (auto-falls back to a free port if it's busy) |

### Automated releases

Pushing a version tag builds the apps for all three platforms in CI (a macOS / Windows / Linux matrix) and publishes them, with `SHA256SUMS.txt`, to a GitHub Release:

```
git tag v1.2.0
git push origin v1.2.0
```

The workflow ([.github/workflows/release.yml](.github/workflows/release.yml)) also runs from the Actions tab on demand (building artifacts without publishing).

**Code signing is optional.** With no secrets configured the apps are unsigned — they run locally but trip Gatekeeper (macOS) and SmartScreen (Windows) on *other* machines. electron-builder signs automatically when these repository secrets are present:

| Secret | Purpose |
| --- | --- |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | base64 code-signing certificate (`.p12`/`.pfx`) and its password — signs macOS and/or Windows builds |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | notarizes the macOS build |

## Also runs as a plain web server

`joust.js` is still a zero-dependency Node HTTP server, so you can run it headless and connect a browser (handy for remote play):

```
node joust.js          # then open http://localhost:8022
node joust.js --window  # or auto-open it in a local Chromium browser (app mode)
```

## Requirements

- **To play the desktop app:** nothing — it's self-contained.
- **To build it:** Node.js and `npm install` (pulls Electron).
- **To run from source as a web server:** just Node.js and a browser with Canvas, Web Audio, and (optionally) Gamepad API support.

## Project layout

The whole game — HTTP server, HTML, CSS, and gameplay — lives in the single file **`joust.js`** by design. The only other file created at runtime is `scores.txt`. See [CLAUDE.md](CLAUDE.md) for architecture notes.
