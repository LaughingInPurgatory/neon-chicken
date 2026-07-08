# JOUST — Neon Edition

A modern, single-file web remake of the 1982 Atari arcade classic **Joust**. Flap your neon mount to gain height, ram enemy riders from above to unhorse them, collect the eggs they drop before they hatch, and survive wave after wave over a sea of lava.

No build step, no dependencies, no frameworks — just Node and a browser.

## Play

```
node joust.js
```

Then open **http://localhost:8022**.

Override the port with an environment variable:

```
PORT=9000 node joust.js
```

(`npm start` runs the same thing.)

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

## Standalone executables

You can bundle the game into a self-contained native executable that needs no installed Node — just double-click (or run) the file and open the printed URL.

```
npm install      # one-time: fetches the bundler (@yao-pkg/pkg)
npm run build    # writes binaries to dist/
```

This produces, in `dist/`:

| File | Platform |
| --- | --- |
| `joust-neon-edition-macos-arm64` | macOS (Apple Silicon) |
| `joust-neon-edition-macos-x64` | macOS (Intel) |
| `joust-neon-edition-win-x64.exe` | Windows (x64) |
| `joust-neon-edition-win-arm64.exe` | Windows (ARM) |
| `joust-neon-edition-linux-x64` | Linux (x64) |

Run a binary and it starts the same local server (`PORT=... ` still works). Each executable writes its `scores.txt` **next to the binary**, so keep it in a writable folder. First run of `npm run build` downloads the base Node runtimes it embeds, so it needs network access and takes a minute; later builds are cached.

### Automated releases

Pushing a version tag builds all five binaries in CI and publishes them (zipped, with `SHA256SUMS.txt`) to a GitHub Release:

```
git tag v1.0.0
git push origin v1.0.0
```

The workflow ([.github/workflows/release.yml](.github/workflows/release.yml)) also runs from the Actions tab on demand (building artifacts without publishing).

**Code signing is optional.** With no secrets configured, the binaries are unsigned/ad-hoc — they run locally but trip Gatekeeper (macOS) and SmartScreen (Windows) on *other* machines. To ship signed, notarized binaries, add these repository secrets and the workflow signs automatically:

| Secret | Purpose |
| --- | --- |
| `MACOS_CERTIFICATE`, `MACOS_CERTIFICATE_PWD`, `MACOS_SIGN_IDENTITY` | base64 Developer ID `.p12`, its password, and the identity name — signs the macOS binaries |
| `APPLE_ID`, `APPLE_APP_PASSWORD`, `APPLE_TEAM_ID` | Apple ID, app-specific password, Team ID — notarizes the macOS archives |
| `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PWD` | base64 code-signing `.pfx` and its password — Authenticode-signs the `.exe` files |

## Requirements

To run from source: Node.js (any modern version) and a browser with Canvas, Web Audio, and — optionally — Gamepad API support. No `npm install` needed to *play* from source; the dependency above is only for building the standalone executables.

## Project layout

The whole game — HTTP server, HTML, CSS, and gameplay — lives in the single file **`joust.js`** by design. The only other file created at runtime is `scores.txt`. See [CLAUDE.md](CLAUDE.md) for architecture notes.
