# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-file, zero-dependency web remake of the arcade game Joust: a Node HTTP server that serves an HTML5 Canvas game, with a plain-text high-score database. There is no build step, no npm install, no framework.

## Hard constraint: everything lives in `joust.js`

The **entire** project — Node server, HTML, CSS, and all game code — must stay in the one file `joust.js`. The only other file allowed to exist at runtime is `scores.txt` (the high-score database, created on first save). This is an explicit, non-negotiable user requirement. Do not split code into modules, add dependencies, or introduce a build tool.

## Run

```
node joust.js            # serves http://localhost:8022
PORT=9000 node joust.js  # override port
npm start                # same as node joust.js
```

There is no test suite and no linter. Verify changes by running the server and driving the game in a browser. `node --check joust.js` is a fast syntax gate before starting the server.

### Packaging to native executables

`npm run build` bundles `joust.js` into standalone binaries in `dist/` (macOS arm64/x64, Windows x64/arm64, Linux x64) via `@yao-pkg/pkg`. Two constraints are load-bearing and must be preserved:

- **`--no-bytecode --public` (in the `build` script) are mandatory.** The served page is built from `GAME.toString()`; if pkg compiles to V8 bytecode, `toString()` returns `[native code]` and the game breaks. Those flags keep the real source in the bundle.
- **Score DB path.** When bundled, `__dirname` is a read-only virtual FS, so `joust.js` detects the bundle (`process.pkg` or `node:sea` `isSea()`) and writes `scores.txt` next to `process.execPath` instead. Preserve the `BUNDLED`/`DATA_DIR` logic near the top when touching score storage.

This is the one sanctioned exception to "no build tool": the tooling lives only in `package.json` devDependencies and produces `dist/` artifacts — `joust.js` itself stays a single file and still runs directly with `node joust.js`.

`.github/workflows/release.yml` runs this build on `v*` tags (on a macOS runner, for the Apple signing toolchain) and publishes the archives to a GitHub Release. Helper scripts in `.github/scripts/` package the binaries and do optional code-signing/notarization that no-ops unless the signing secrets are set (see the README's "Automated releases" table). `dist/`, `release/`, and `node_modules/` are gitignored.

`.claude/launch.json` defines a `joust` server config for the preview tooling (`preview_start` name `joust`, port 8022). Keep its port in sync with the `PORT` default in `joust.js` when changing ports.

## Architecture

`joust.js` has two halves that run in **different JavaScript environments**, which is the key thing to understand:

1. **Server half (Node).** Top-level code: the flat-file score DB (`loadScores`/`saveScores`/`addScore`), the `http` server, and route handlers for `/` (serves the page), `GET /api/scores`, and `POST /api/scores`.

2. **Game half (browser).** One big function, `GAME()`. It is **not called in Node** — it is serialized with `GAME.toString()` and injected into the served HTML via the `PAGE` template literal: `(${GAME.toString()})()`. So `GAME` runs only in the browser, and must be fully self-contained: it cannot reference any server-scope variable or Node API. Everything the browser needs is defined inside `GAME`.

Because `GAME` is embedded in a template-literal string, its source **must never contain a literal `</script>` sequence or an unescaped backtick/`${`** — that would break out of the injected string. Prefer `'...'` string concatenation inside `GAME`; avoid template literals there.

### Score database (`scores.txt`)

Genuinely plain text, one entry per line: `NAME SCORE DATE` (e.g. `ACE 55555 2026-07-07`). Parsed defensively (malformed lines skipped), sorted descending, truncated to the top 10 (`MAX_SCORES`). Writes are serialized through the `writeChain` promise so concurrent POSTs can't interleave. The POST handler sanitizes `name` to 1–3 uppercase A–Z chars and rejects non-positive or absurdly large scores.

### Game structure (inside `GAME`)

Organized as labelled comment sections: config → input → audio → high scores → platforms/waves → entities → particles/FX → rendering → state machine → main loop. Notable design points:

- **Fixed-timestep simulation.** The main loop (`frame`) accumulates real time and steps `tick(DT)` at a fixed 1/60s (with a `freeze` hit-stop mechanism and a step cap), while `render()` runs every animation frame. Put gameplay logic in `tick`/its callees, visual-only work in `render`.
- **State machine.** `state` is one of `ST.INTRO / PLAY / DYING / WAVECLEAR / OVER / NAME`; both `tick` and `render` switch on it. Wave/lives/score progression flows through these states — trace `startGame` → `startWave` → the `PLAY` case → `DYING`/`OVER`/`NAME`.
- **Wave rule.** Wave N spawns N+1 enemies (wave 1 = 2). A wave is cleared only when `enemies`, `eggs`, and `pending` (queued spawns) are all empty. Enemy difficulty tiers are in `TIERS`; `tierFor` biases toward harder tiers on later waves.
- **Unified input.** `pollInput()` merges keyboard state and the Gamepad API into one `input`/`edge` abstraction polled once per tick; game code reads those, never raw key events (except the name-entry text path).
- **All assets are procedural.** Sprites are drawn with Canvas paths + `shadowBlur` (see `drawBird`); sound is synthesized at runtime with the Web Audio API (`sfx`, `updateMusic`). There are no image or audio files, by design.
- **Debug/automation handle.** `window.__joust` exposes state getters/setters and functions (`startGame`, `startWave`, `defeatEnemy`, `killPlayer`, etc.) for driving the game from `preview_eval` during verification. Keep this in sync when adding gameplay you'll want to test headlessly.

### Collision note

Player↔enemy resolution lives in `joustCollisions()`. The height comparison decides win/lose/tie; the tie branch must push the two apart (both velocity and a positional separation nudge) or they re-overlap every frame and lock together. Preserve that separation logic when touching combat.
