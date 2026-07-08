#!/usr/bin/env node
/*
 * JOUST — NEON EDITION
 * A single-file modern homage to the arcade classic.
 *
 * Run:   node joust.js        (then open http://localhost:3000)
 * The only other file this creates is scores.txt — a plain-text
 * high score table, one "NAME SCORE DATE" entry per line.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT) || 8022;
// When bundled into a standalone executable (pkg or Node SEA), __dirname points
// inside a read-only virtual filesystem, so keep the score DB next to the actual
// binary instead. Falls back to the source directory when run with `node`.
const BUNDLED = (function () {
  if (process.pkg) return true;
  try { return require('node:sea').isSea(); } catch (e) { return false; }
})();
const DATA_DIR = BUNDLED ? path.dirname(process.execPath) : __dirname;
const SCORES_FILE = path.join(DATA_DIR, 'scores.txt');
const MAX_SCORES = 10;

/* ==================== flat-file high score DB ==================== */

function loadScores() {
  let txt = '';
  try { txt = fs.readFileSync(SCORES_FILE, 'utf8'); } catch (e) { return []; }
  return txt.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^([A-Z]{1,3})\s+(\d+)\s+(\S+)$/);
      return m ? { name: m[1], score: Number(m[2]), date: m[3] } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SCORES);
}

// Serialize writes so concurrent POSTs never interleave in the file.
let writeChain = Promise.resolve();
function saveScores(list) {
  const txt = list.map((s) => s.name + ' ' + s.score + ' ' + s.date).join('\n') + '\n';
  writeChain = writeChain.then(() => fs.promises.writeFile(SCORES_FILE, txt)).catch(() => {});
  return writeChain;
}

async function addScore(name, score) {
  const list = loadScores();
  list.push({ name, score, date: new Date().toISOString().slice(0, 10) });
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, MAX_SCORES);
  await saveScores(top);
  return top;
}

/* ==================== the game (runs in the browser) ==================== */
/* This whole function is serialized with .toString() and injected into the
 * served page, so it must be fully self-contained. */

function GAME() {
'use strict';

/* -------------------- config -------------------- */
var W = 960, H = 600, LAVA_Y = 556;
var GRAV = 800, FLAP = -270, VY_MIN = -340, VY_MAX = 520, ACC = 620, MAXVX = 290;

var cv = document.getElementById('cv');
cv.width = W; cv.height = H;
var ctx = cv.getContext('2d');

var ST = { INTRO: 1, PLAY: 2, DYING: 3, WAVECLEAR: 4, OVER: 5, NAME: 6 };
var state = ST.INTRO, stateT = 0, paused = false, time = 0;

var player = null, enemies = [], eggs = [], powerups = [], parts = [], texts = [], toasts = [];
var plats = [], enemyPads = [], playerPad = null, pending = [], demo = [];
var wave = 1, score = 0, lives = 5, nextLife = 20000;
var comboN = 0, comboT = 0, eggStreak = 0, ambientT = 0;
var shake = 0, freeze = 0, bannerT = 0, bannerMsg = '';
var troll = { active: false, grab: false, x: 0, y: LAVA_Y + 40, t: 0, escapes: 0 };
var lowT = 0;
var hiscores = [], nameLetters = ['A', 'A', 'A'], nameSlot = 0, submitting = false;
var stars = [], embers = [];

var TIERS = [
  { name: 'BOUNDER', mount: '#ff9f1c', rider: '#ff3860', speed: 0.72, pts: 500 },
  { name: 'HUNTER', mount: '#9db4ff', rider: '#7048e8', speed: 0.88, pts: 750 },
  { name: 'SHADOW LORD', mount: '#a855f7', rider: '#00ffa3', speed: 1.06, pts: 1000 }
];
var PLAYER_MOUNT = '#00e5ff', PLAYER_RIDER = '#ffffff';

var PUP = {
  shield: { col: '#00e5ff', label: 'S', dur: 8, name: 'SHIELD' },
  turbo:  { col: '#ffe600', label: 'T', dur: 8, name: 'TURBO' },
  chrono: { col: '#a855f7', label: 'C', dur: 6, name: 'CHRONO' },
  double: { col: '#ff3860', label: '2', dur: 10, name: 'DOUBLE PTS' },
  life:   { col: '#00ff88', label: '+', dur: 0, name: 'EXTRA LIFE' }
};
var effects = { shield: 0, turbo: 0, chrono: 0, double: 0 };

function rnd(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

for (var si = 0; si < 90; si++) {
  stars.push({ x: rnd(0, W), y: rnd(0, LAVA_Y - 40), r: rnd(0.4, 1.8), spd: rnd(2, 9), ph: rnd(0, 7) });
}

/* -------------------- input (keyboard + gamepad) -------------------- */
var keys = {};
var input = { left: false, right: false, flap: false, start: false };
var edge = { flap: false, start: false, up: false, down: false, left: false, right: false, back: false };
var prevIn = { flap: false, start: false, up: false, down: false, left: false, right: false, back: false };
var padIndex = null, padWasConnected = false;

window.addEventListener('gamepadconnected', function (e) {
  padIndex = e.gamepad.index;
  if (!padWasConnected) { toast('GAMEPAD CONNECTED'); padWasConnected = true; }
});
window.addEventListener('gamepaddisconnected', function (e) {
  if (e.gamepad.index === padIndex) { padIndex = null; padWasConnected = false; toast('GAMEPAD DISCONNECTED'); }
});

window.addEventListener('keydown', function (e) {
  initAudio();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyP' && state === ST.PLAY) { paused = !paused; toast(paused ? 'PAUSED' : 'RESUMED'); }
  if (state === ST.NAME) nameKeyboard(e);
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; });
window.addEventListener('mousedown', initAudio);

function getPad() {
  if (padIndex === null || !navigator.getGamepads) return null;
  var pads = navigator.getGamepads();
  return pads ? pads[padIndex] : null;
}

function pollInput() {
  var pad = getPad();
  var ax = 0, pUp = false, pDown = false, pFlap = false, pStart = false, pBack = false;
  if (pad) {
    ax = pad.axes && pad.axes.length ? pad.axes[0] : 0;
    var b = function (i) { return !!(pad.buttons[i] && pad.buttons[i].pressed); };
    pFlap = b(0);
    pBack = b(1);
    pStart = b(9);
    pUp = b(12); pDown = b(13);
    if (b(14)) ax = -1;
    if (b(15)) ax = 1;
    if (b(8) && !prevIn.back) { /* select = mute */ }
  }
  input.left = !!(keys.ArrowLeft || keys.KeyA) || ax < -0.35;
  input.right = !!(keys.ArrowRight || keys.KeyD) || ax > 0.35;
  input.flap = !!(keys.Space || keys.ArrowUp || keys.KeyW) || pFlap;
  input.start = !!keys.Enter || pStart;
  var up = !!keys.ArrowUp || pUp, down = !!keys.ArrowDown || pDown;
  edge.flap = input.flap && !prevIn.flap;
  edge.start = input.start && !prevIn.start;
  edge.up = up && !prevIn.up;
  edge.down = down && !prevIn.down;
  edge.left = input.left && !prevIn.left;
  edge.right = input.right && !prevIn.right;
  edge.back = pBack && !prevIn.back;
  prevIn.flap = input.flap; prevIn.start = input.start;
  prevIn.up = up; prevIn.down = down;
  prevIn.left = input.left; prevIn.right = input.right; prevIn.back = pBack;
  if (edge.flap || edge.start) initAudio();
}

/* -------------------- audio (all synthesized) -------------------- */
var AC = null, master = null, muted = false, musicNext = 0, musicBeat = 0, noiseBuf = null;

function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain();
    master.gain.value = 0.5;
    master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC = null; }
}

function toggleMute() { muted = !muted; toast(muted ? 'SOUND OFF' : 'SOUND ON'); }

function tone(freq, dur, type, vol, slideTo, when) {
  if (!AC || muted) return;
  var t = (when || AC.currentTime);
  var o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(vol || 0.15, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseHit(dur, vol, freq, q) {
  if (!AC || muted) return;
  var t = AC.currentTime;
  var src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  var f = AC.createBiquadFilter(); f.type = 'bandpass';
  f.frequency.value = freq || 1200; f.Q.value = q || 0.8;
  var g = AC.createGain();
  g.gain.setValueAtTime(vol || 0.25, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

function seq(notes, step, type, vol, dur) {
  if (!AC || muted) return;
  for (var i = 0; i < notes.length; i++) {
    tone(notes[i], dur || 0.09, type || 'square', vol || 0.12, 0, AC.currentTime + i * step);
  }
}

var sfx = {
  flap: function () { noiseHit(0.07, 0.10, 2200, 0.6); tone(170, 0.07, 'triangle', 0.07, 110); },
  clang: function () { tone(870, 0.09, 'square', 0.12, 500); tone(1230, 0.07, 'square', 0.08); noiseHit(0.06, 0.12, 3000, 1.2); },
  kill: function () { tone(640, 0.28, 'sawtooth', 0.16, 90); noiseHit(0.24, 0.2, 700, 0.7); },
  bump: function () { tone(120, 0.06, 'triangle', 0.09); },
  egg: function () { seq([523, 659, 784], 0.06, 'square', 0.11); },
  hatch: function () { tone(1250, 0.05, 'square', 0.08); },
  hatched: function () { tone(300, 0.25, 'sawtooth', 0.13, 620); },
  powerup: function () { seq([440, 554, 659, 880], 0.05, 'triangle', 0.13); },
  life: function () { seq([523, 659, 784, 1046, 1318], 0.08, 'square', 0.12, 0.14); },
  death: function () { tone(420, 0.9, 'sawtooth', 0.18, 55); noiseHit(0.7, 0.16, 400, 0.5); },
  wave: function () { seq([392, 523, 659, 784], 0.08, 'triangle', 0.12, 0.16); },
  over: function () { seq([392, 330, 262, 196, 131], 0.16, 'sawtooth', 0.13, 0.3); },
  sizzle: function () { noiseHit(0.4, 0.18, 500, 0.4); },
  grab: function () { tone(90, 0.3, 'sawtooth', 0.15, 60); }
};

function updateMusic() {
  if (!AC || muted || state !== ST.PLAY || paused) { musicNext = 0; return; }
  var t = AC.currentTime;
  if (!musicNext || musicNext < t) { musicNext = t + 0.05; musicBeat = 0; }
  var bpm = Math.min(172, 102 + wave * 5), half = 30 / bpm;
  var bass = [110, 110, 87.31, 98, 110, 110, 130.81, 98];
  var arp = [220, 261.6, 329.6, 261.6];
  while (musicNext < t + 0.12) {
    var b = musicBeat;
    if (b % 2 === 0) tone(bass[(b >> 1) % 8], half * 1.7, 'triangle', 0.075, 0, musicNext);
    if (b % 4 === 2) noiseHit(0.03, 0.03, 6000, 1);
    if (b % 8 === 7 && wave > 1) tone(arp[(b >> 3) % 4], half, 'square', 0.04, 0, musicNext);
    musicNext += half; musicBeat++;
  }
}

/* -------------------- high scores (client) -------------------- */
function fetchScores() {
  fetch('/api/scores').then(function (r) { return r.json(); })
    .then(function (j) { if (Array.isArray(j)) hiscores = j; }).catch(function () {});
}
function postScore(name, sc) {
  return fetch('/api/scores', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name, score: sc })
  }).then(function (r) { return r.json(); })
    .then(function (j) { if (Array.isArray(j)) hiscores = j; })
    .catch(function () {});
}
fetchScores();

/* -------------------- platforms & waves -------------------- */
function makePlatforms(w) {
  var v = (w - 1) % 3;
  var P = [];
  function add(x, y, wd, type) { P.push({ x: x, y: y, w: wd, h: 16, type: type || 0 }); }
  var topW = Math.max(90, 180 - Math.max(0, w - 4) * 18); // top ledge erodes on later waves
  add(480 - topW / 2, 118, topW, 1);
  add(70, 208 + (v === 2 ? 26 : 0), 195, 1);
  add(695, 208 + (v === 2 ? 26 : 0), 195, 1);
  add(378, 332, 204, 2); // player spawn pad
  add(-70, 300 + (v === 1 ? 42 : 0), 175, 0);
  add(855, 300 + (v === 1 ? 42 : 0), 175, 0);
  add(105, 482, 235, 0);
  add(620, 482, 235, 0);
  plats = P;
  enemyPads = [
    { x: 167, y: 208 + (v === 2 ? 26 : 0) },
    { x: 792, y: 208 + (v === 2 ? 26 : 0) },
    { x: 480, y: 118 },
    { x: 222, y: 482 },
    { x: 737, y: 482 }
  ];
  playerPad = { x: 480, y: 332 };
}

function tierFor(w) {
  var r = Math.random();
  var pShadow = clamp((w - 3) * 0.13, 0, 0.5);
  var pHunter = clamp((w - 1) * 0.2, 0, 0.55);
  if (r < pShadow) return 2;
  if (r < pShadow + pHunter) return 1;
  return 0;
}

function startWave(n) {
  wave = n;
  makePlatforms(n);
  enemies = []; eggs = []; powerups = []; pending = [];
  eggStreak = 0;
  var count = n + 1; // wave 1 => 2 enemies
  for (var i = 0; i < count; i++) {
    pending.push({ t: 1.1 + i * 0.85, pad: enemyPads[i % enemyPads.length], tier: tierFor(n) });
  }
  ambientT = rnd(7, 15);
  bannerMsg = 'WAVE ' + n;
  bannerT = 2.2;
  sfx.wave();
}

/* -------------------- entities -------------------- */
function newRider(x, y) {
  return {
    x: x - 16, y: y - 36, px: x - 16, py: y - 36, w: 32, h: 36,
    vx: 0, vy: 0, facing: 1, onGround: false, flapAnim: 0, flapCd: 0, runPh: 0
  };
}

function newPlayer() {
  var p = newRider(playerPad.x, playerPad.y);
  p.invuln = 3; p.alive = true;
  return p;
}

function newEnemy(pad, tier) {
  var e = newRider(pad.x, pad.y);
  e.tier = tier; e.spawnT = 0.9;
  e.aiT = 0; e.dir = Math.random() < 0.5 ? -1 : 1; e.wantFlap = false; e.targetY = rnd(120, 440);
  materializeFx(pad.x, pad.y - 20, TIERS[tier].mount);
  return e;
}

function applyPhysics(e, dt, accMul, maxMul) {
  e.px = e.x; e.py = e.y;
  e.vy += GRAV * dt;
  e.vy = clamp(e.vy, VY_MIN * (maxMul || 1), VY_MAX);
  e.vx = clamp(e.vx, -MAXVX * (maxMul || 1), MAXVX * (maxMul || 1));
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  // horizontal wrap
  if (e.x + e.w < 0) { e.x += W + e.w; e.px = e.x; }
  if (e.x > W) { e.x -= W + e.w; e.px = e.x; }
  // ceiling
  if (e.y < 2) { e.y = 2; e.vy = Math.abs(e.vy) * 0.35; }
  // platforms
  e.onGround = false;
  for (var i = 0; i < plats.length; i++) {
    var p = plats[i];
    if (e.x + e.w <= p.x || e.x >= p.x + p.w || e.y + e.h <= p.y || e.y >= p.y + p.h) continue;
    if (e.py + e.h <= p.y + 1 && e.vy >= 0) { e.y = p.y - e.h; e.vy = 0; e.onGround = true; }
    else if (e.py >= p.y + p.h - 1 && e.vy < 0) { e.y = p.y + p.h; e.vy = Math.abs(e.vy) * 0.35; }
    else {
      if (e.px + e.w / 2 < p.x + p.w / 2) e.x = p.x - e.w; else e.x = p.x + p.w;
      e.vx *= -0.55;
    }
  }
  if (e.onGround) e.runPh += Math.abs(e.vx) * dt * 0.09;
}

function flap(e, power) {
  e.vy += FLAP * (power || 1);
  if (e.vy < VY_MIN * (power || 1)) e.vy = VY_MIN * (power || 1);
  e.flapAnim = 0.22;
  featherFx(e.x + e.w / 2, e.y + e.h * 0.7, 3);
}

function overlap(a, b, pad) {
  var m = pad || 0;
  return a.x < b.x + b.w - m && a.x + a.w > b.x + m && a.y < b.y + b.h - m && a.y + a.h > b.y + m;
}

function wrapDx(fromX, toX) {
  var dx = toX - fromX;
  if (dx > W / 2) dx -= W;
  if (dx < -W / 2) dx += W;
  return dx;
}

/* -------------------- player update -------------------- */
function updatePlayer(dt) {
  var p = player;
  if (!p || !p.alive) return;
  var turbo = effects.turbo > 0;
  var acc = ACC * (turbo ? 1.6 : 1);
  if (troll.grab) {
    // pinned by the lava troll — flap to escape!
    p.x = troll.x - p.w / 2; p.y = troll.y - p.h + 6;
    if (edge.flap) {
      sfx.flap(); troll.y -= 17; troll.escapes--;
      featherFx(p.x + p.w / 2, p.y + p.h, 5);
      if (troll.escapes <= 0 || troll.y < LAVA_Y - 100) {
        troll.grab = false; troll.active = false;
        p.vy = -320; p.invuln = Math.max(p.invuln, 0.8);
        toast('ESCAPED THE TROLL!');
      }
    }
    troll.y += 15 * dt;
    if (troll.y - p.h + 20 > LAVA_Y) { troll.grab = false; troll.active = false; killPlayer('lava'); }
    return;
  }
  if (input.left) { p.vx -= acc * dt; p.facing = -1; }
  if (input.right) { p.vx += acc * dt; p.facing = 1; }
  if (!input.left && !input.right && p.onGround) p.vx *= Math.max(0, 1 - 5 * dt);
  if (edge.flap) { flap(p, turbo ? 1.22 : 1); sfx.flap(); }
  applyPhysics(p, dt, 1, turbo ? 1.25 : 1);
  if (p.invuln > 0) p.invuln -= dt;

  // lava
  if (p.y + p.h >= LAVA_Y + 8) { killPlayer('lava'); return; }

  // lava troll watches for low fliers
  if (p.y + p.h > LAVA_Y - 62 && !p.onGround) lowT += dt; else lowT = Math.max(0, lowT - dt * 2);
  if (!troll.active && lowT > 0.55 && Math.random() < dt * 1.4) {
    troll.active = true; troll.grab = false;
    troll.x = p.x + p.w / 2; troll.y = LAVA_Y + 30; troll.t = 1.4;
    sfx.grab();
  }

  // eggs
  for (var i = eggs.length - 1; i >= 0; i--) {
    if (overlap(p, eggs[i], 2)) {
      eggStreak++;
      var pts = 250 * eggStreak;
      addPoints(pts, eggs[i].x, eggs[i].y, '+' + pts + ' EGG');
      burst(eggs[i].x + 7, eggs[i].y + 8, '#fffbe6', 14, 150);
      eggs.splice(i, 1);
      sfx.egg();
    }
  }

  // powerups
  for (var j = powerups.length - 1; j >= 0; j--) {
    var u = powerups[j];
    if (overlap(p, { x: u.x - 14, y: u.y - 14, w: 28, h: 28 }, 0)) {
      applyPowerup(u.type);
      burst(u.x, u.y, PUP[u.type].col, 22, 190);
      ringFx(u.x, u.y, PUP[u.type].col);
      powerups.splice(j, 1);
    }
  }
}

function applyPowerup(type) {
  var def = PUP[type];
  if (type === 'life') {
    lives = Math.min(lives + 1, 9);
    sfx.life();
    floatText(player.x + player.w / 2, player.y - 12, 'EXTRA LIFE!', '#00ff88');
  } else {
    effects[type] = def.dur;
    sfx.powerup();
    floatText(player.x + player.w / 2, player.y - 12, def.name + '!', def.col);
  }
}

function killPlayer(cause) {
  var p = player;
  if (!p.alive || p.invuln > 0 && cause !== 'lava') return;
  if (effects.shield > 0 && cause !== 'lava') return;
  p.alive = false;
  lives--;
  effects.shield = effects.turbo = effects.chrono = effects.double = 0;
  bigExplosion(p.x + p.w / 2, p.y + p.h / 2, PLAYER_MOUNT);
  if (cause === 'lava') sfx.sizzle();
  sfx.death();
  shake = 16; freeze = 0.09;
  state = ST.DYING; stateT = 1.9;
}

/* -------------------- enemies -------------------- */
function updateEnemy(e, dt) {
  if (e.spawnT > 0) { e.spawnT -= dt; return; }
  var t = TIERS[e.tier];
  e.aiT -= dt;
  if (e.aiT <= 0) {
    e.aiT = rnd(0.22, 0.55);
    var px = player && player.alive ? player.x : W / 2;
    var py = player && player.alive ? player.y : 260;
    var dx = wrapDx(e.x, px);
    if (e.tier === 0) {
      if (Math.random() < 0.35) e.dir = Math.random() < 0.5 ? -1 : 1;
      if (Math.random() < 0.25) e.targetY = rnd(110, 450);
      e.wantFlap = e.y > e.targetY;
    } else if (e.tier === 1) {
      e.dir = dx > 0 ? 1 : -1;
      if (Math.random() < 0.15) e.dir *= -1;
      e.wantFlap = e.y > py - 14 || Math.random() < 0.12;
    } else {
      e.dir = dx > 0 ? 1 : -1;
      e.wantFlap = e.y > py - 46 || Math.random() < 0.2;
    }
  }
  // lava avoidance is life-or-death: check every frame, not just on AI decisions
  if (e.y + e.h > LAVA_Y - 150) e.wantFlap = true;
  if (e.y + e.h > LAVA_Y - 60 && e.flapCd > 0.09) e.flapCd = 0.09; // emergency flapping
  var slow = effects.chrono > 0 ? 0.42 : 1;
  var sm = t.speed * Math.min(1.42, 1 + wave * 0.03) * slow;
  e.vx += e.dir * ACC * sm * dt;
  e.facing = e.dir;
  e.flapCd -= dt * slow;
  if (e.wantFlap && e.flapCd <= 0) {
    e.flapCd = rnd(0.22, 0.5);
    flap(e, 0.92 * slow + 0.08);
  }
  applyPhysics(e, dt * slow, sm, sm);
  if (e.y + e.h >= LAVA_Y + 6) { e.dead = 'lava'; sfx.sizzle(); burst(e.x + e.w / 2, LAVA_Y, '#ff6b00', 16, 130); }
}

function joustCollisions() {
  var p = player;
  // enemy vs enemy: light bounce so they don't stack
  for (var a = 0; a < enemies.length; a++) {
    for (var b = a + 1; b < enemies.length; b++) {
      var ea = enemies[a], eb = enemies[b];
      if (ea.spawnT > 0 || eb.spawnT > 0) continue;
      if (overlap(ea, eb, 6)) {
        var push = ea.x < eb.x ? -1 : 1;
        ea.vx = push * 130; eb.vx = -push * 130;
      }
    }
  }
  if (!p || !p.alive) return;
  for (var i = enemies.length - 1; i >= 0; i--) {
    var e = enemies[i];
    if (e.spawnT > 0 || e.dead) continue;
    if (!overlap(p, e, 4)) continue;
    var shielded = effects.shield > 0 || p.invuln > 0;
    if (p.y + 7 < e.y || effects.shield > 0) {
      defeatEnemy(i);
    } else if (e.y + 7 < p.y) {
      if (shielded) {
        var push2 = p.x < e.x ? -1 : 1;
        e.vx = -push2 * 200; e.vy = -120;
      } else {
        killPlayer('joust');
        return;
      }
    } else {
      // height tie: shove them apart. dir is the way the PLAYER should go.
      var dir = p.x < e.x ? -1 : 1;
      p.vx = dir * 190; e.vx = -dir * 190;
      p.vy -= 55; e.vy -= 55;
      // separate positionally too, so they don't re-overlap and clang forever
      var gap = (p.w + e.w) / 2 - Math.abs((p.x + p.w / 2) - (e.x + e.w / 2)) + 2;
      if (gap > 0) { p.x += dir * gap / 2; e.x -= dir * gap / 2; }
      sfx.clang(); sfx.bump();
      sparkFx((p.x + e.x + e.w) / 2, (p.y + e.y) / 2 + 12);
      shake = Math.max(shake, 5); freeze = Math.max(freeze, 0.05);
    }
  }
}

function defeatEnemy(i) {
  var e = enemies[i];
  var t = TIERS[e.tier];
  comboN = comboT > 0 ? comboN + 1 : 1;
  comboT = 1.6;
  var pts = t.pts * comboN;
  addPoints(pts, e.x + e.w / 2, e.y, '+' + pts + (comboN > 1 ? '  x' + comboN : ''));
  bigExplosion(e.x + e.w / 2, e.y + e.h / 2, t.mount);
  sfx.kill(); sfx.clang();
  shake = Math.max(shake, 9); freeze = Math.max(freeze, 0.07);
  // the fallen rider leaves an egg
  eggs.push({ x: e.x + e.w / 2 - 7, y: e.y, w: 14, h: 17, vx: e.vx * 0.3, vy: -90, timer: 9, tier: e.tier, settled: false, wob: rnd(0, 7) });
  // sometimes a power-up escapes the wreckage
  if (Math.random() < 0.2) spawnPowerup(e.x + e.w / 2, e.y - 8);
  enemies.splice(i, 1);
}

/* -------------------- eggs -------------------- */
function updateEgg(g, dt) {
  var slow = effects.chrono > 0 ? 0.42 : 1;
  g.timer -= dt * slow;
  g.py = g.y;
  g.vy += GRAV * 0.9 * dt;
  g.x += g.vx * dt; g.y += g.vy * dt;
  if (g.x < 2) { g.x = 2; g.vx *= -0.5; }
  if (g.x + g.w > W - 2) { g.x = W - 2 - g.w; g.vx *= -0.5; }
  g.settled = false;
  for (var i = 0; i < plats.length; i++) {
    var p = plats[i];
    if (g.x + g.w <= p.x || g.x >= p.x + p.w || g.y + g.h <= p.y || g.y >= p.y + p.h) continue;
    if (g.py + g.h <= p.y + 2 && g.vy >= 0) {
      g.y = p.y - g.h;
      if (Math.abs(g.vy) > 60) { g.vy *= -0.42; } else { g.vy = 0; g.vx *= 0.8; g.settled = true; }
    }
  }
  if (g.timer < 2.5 && g.timer > 0 && (g.timer * 6 | 0) % 2 === 0 && Math.random() < dt * 8) sfx.hatch();
  if (g.y > LAVA_Y - 6) { g.gone = true; sfx.sizzle(); burst(g.x + 7, LAVA_Y, '#ff6b00', 10, 110); }
  if (g.timer <= 0) {
    // it hatches — an angrier rider on a fresh mount
    g.gone = true;
    var tier = Math.min(2, g.tier + 1);
    var e = newRider(g.x + 7, g.y + g.h);
    e.tier = tier; e.spawnT = 0.7; e.aiT = 0; e.dir = 1; e.wantFlap = false; e.targetY = rnd(120, 440); e.flapCd = 0;
    enemies.push(e);
    hatchFx(g.x + 7, g.y + 8);
    sfx.hatched();
    floatText(g.x + 7, g.y - 10, 'HATCHED!', TIERS[tier].mount);
  }
}

/* -------------------- powerups -------------------- */
function spawnPowerup(x, y) {
  var r = Math.random(), type;
  if (r < 0.25) type = 'shield';
  else if (r < 0.5) type = 'turbo';
  else if (r < 0.7) type = 'chrono';
  else if (r < 0.9) type = 'double';
  else type = 'life';
  powerups.push({ type: type, x: clamp(x, 30, W - 30), y: clamp(y, 60, LAVA_Y - 90), t: 12, ph: rnd(0, 7) });
}

function updatePowerups(dt) {
  ambientT -= dt;
  if (ambientT <= 0 && powerups.length < 3) {
    spawnPowerup(rnd(80, W - 80), rnd(120, 420));
    ambientT = rnd(9, 18);
  }
  for (var i = powerups.length - 1; i >= 0; i--) {
    var u = powerups[i];
    u.t -= dt; u.ph += dt * 2.4;
    u.y += Math.sin(u.ph) * 12 * dt;
    if (Math.random() < dt * 12) {
      parts.push({ x: u.x + rnd(-9, 9), y: u.y + rnd(-9, 9), vx: 0, vy: -18, g: 0, life: 0.5, ml: 0.5, col: PUP[u.type].col, sz: 1.6, shape: 0 });
    }
    if (u.t <= 0) powerups.splice(i, 1);
  }
  for (var k in effects) { if (effects[k] > 0) effects[k] = Math.max(0, effects[k] - dt); }
}

/* -------------------- scoring -------------------- */
function addPoints(n, x, y, label) {
  var v = effects.double > 0 ? n * 2 : n;
  score += v;
  floatText(x, y, effects.double > 0 ? label + ' x2' : label, '#ffe600');
  while (score >= nextLife) {
    nextLife += 20000;
    lives = Math.min(lives + 1, 9);
    sfx.life();
    toast('EXTRA LIFE AT ' + score + '!');
  }
}

/* -------------------- particles & fx -------------------- */
function burst(x, y, col, n, spd) {
  for (var i = 0; i < n; i++) {
    var a = rnd(0, Math.PI * 2), s = rnd(spd * 0.3, spd);
    parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 300, life: rnd(0.35, 0.8), ml: 0.8, col: col, sz: rnd(1.5, 3.4), shape: 0 });
  }
}
function sparkFx(x, y) {
  for (var i = 0; i < 10; i++) {
    var a = rnd(0, Math.PI * 2), s = rnd(120, 300);
    parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 150, life: rnd(0.12, 0.3), ml: 0.3, col: '#fff9c4', sz: rnd(1, 2), shape: 1 });
  }
}
function featherFx(x, y, n) {
  for (var i = 0; i < n; i++) {
    parts.push({ x: x + rnd(-6, 6), y: y, vx: rnd(-35, 35), vy: rnd(20, 70), g: -40, life: rnd(0.4, 0.9), ml: 0.9, col: 'rgba(220,240,255,0.7)', sz: rnd(1.5, 2.6), shape: 2, ph: rnd(0, 7) });
  }
}
function ringFx(x, y, col) {
  parts.push({ x: x, y: y, vx: 0, vy: 0, g: 0, life: 0.45, ml: 0.45, col: col, sz: 6, shape: 3 });
}
function bigExplosion(x, y, col) {
  burst(x, y, col, 34, 320);
  burst(x, y, '#ffffff', 12, 180);
  ringFx(x, y, col);
  ringFx(x, y, '#ffffff');
}
function hatchFx(x, y) {
  burst(x, y, '#fffbe6', 18, 170);
  ringFx(x, y, '#ffe600');
}
function materializeFx(x, y, col) {
  for (var i = 0; i < 16; i++) {
    parts.push({ x: x + rnd(-18, 18), y: y + rnd(20, 40), vx: 0, vy: rnd(-90, -30), g: 0, life: rnd(0.4, 0.9), ml: 0.9, col: col, sz: rnd(1.5, 3), shape: 0 });
  }
}
function floatText(x, y, msg, col) {
  texts.push({ x: x, y: y, msg: msg, col: col || '#fff', life: 1.15, ml: 1.15 });
}
function toast(msg) {
  toasts.push({ msg: msg, life: 2.4 });
  if (toasts.length > 3) toasts.shift();
}

function updateFx(dt) {
  for (var i = parts.length - 1; i >= 0; i--) {
    var p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy += (p.g || 0) * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.shape === 2) p.x += Math.sin((p.ph += dt * 9)) * 22 * dt;
    if (p.shape === 3) p.sz += 240 * dt;
  }
  for (var j = texts.length - 1; j >= 0; j--) {
    texts[j].life -= dt; texts[j].y -= 34 * dt;
    if (texts[j].life <= 0) texts.splice(j, 1);
  }
  for (var k = toasts.length - 1; k >= 0; k--) {
    toasts[k].life -= dt;
    if (toasts[k].life <= 0) toasts.splice(k, 1);
  }
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) comboN = 0; }
  if (shake > 0) shake = Math.max(0, shake - 42 * dt);
  // rising lava embers
  if (Math.random() < dt * 14) {
    embers.push({ x: rnd(0, W), y: LAVA_Y + rnd(0, 20), vy: rnd(-60, -20), life: rnd(0.8, 2), ml: 2, sz: rnd(1, 2.6) });
  }
  for (var m = embers.length - 1; m >= 0; m--) {
    var em = embers[m];
    em.life -= dt; em.y += em.vy * dt; em.x += Math.sin(time * 3 + em.y * 0.05) * 12 * dt;
    if (em.life <= 0) embers.splice(m, 1);
  }
}

/* -------------------- lava troll -------------------- */
function updateTroll(dt) {
  if (!troll.active) return;
  var p = player;
  if (troll.grab) return; // handled in updatePlayer
  troll.t -= dt;
  // hand rises toward its target height
  var targetY = LAVA_Y - 66;
  troll.y += (targetY - troll.y) * Math.min(1, dt * 5);
  if (p && p.alive && p.invuln <= 0 && effects.shield <= 0 &&
      Math.abs((p.x + p.w / 2) - troll.x) < 26 && p.y + p.h > troll.y - 12) {
    troll.grab = true; troll.escapes = 5;
    sfx.grab(); shake = Math.max(shake, 6);
    toast('FLAP TO ESCAPE!');
  }
  if (troll.t <= 0) troll.active = false;
}

/* -------------------- state machine -------------------- */
function startGame() {
  score = 0; lives = 5; nextLife = 20000; comboN = 0; comboT = 0;
  effects = { shield: 0, turbo: 0, chrono: 0, double: 0 };
  troll.active = troll.grab = false; lowT = 0;
  startWave(1);
  player = newPlayer();
  state = ST.PLAY; paused = false;
}

function makeDemo() {
  makePlatforms(1);
  demo = [];
  for (var i = 0; i < 3; i++) {
    var e = newRider(rnd(150, 800), rnd(120, 300));
    e.tier = i % 3; e.spawnT = 0; e.aiT = 0; e.dir = 1; e.wantFlap = false; e.targetY = rnd(110, 380); e.flapCd = 0;
    demo.push(e);
  }
  parts = []; texts = [];
}
makeDemo();

function tick(dt) {
  time += dt;
  pollInput();
  updateMusic();
  if (edge.back && state === ST.PLAY) {} // reserved

  switch (state) {
    case ST.INTRO:
      for (var i = 0; i < demo.length; i++) {
        var d = demo[i];
        d.aiT -= dt;
        if (d.aiT <= 0) {
          d.aiT = rnd(0.3, 0.6);
          if (Math.random() < 0.3) d.dir *= -1;
          if (Math.random() < 0.3) d.targetY = rnd(100, 380);
          d.wantFlap = d.y > d.targetY;
        }
        d.vx += d.dir * ACC * 0.6 * dt; d.facing = d.dir;
        d.flapCd -= dt;
        if (d.wantFlap && d.flapCd <= 0) { d.flapCd = rnd(0.25, 0.5); d.vy += FLAP * 0.9; d.flapAnim = 0.22; }
        applyPhysics(d, dt, 0.6, 0.75);
        if (d.y + d.h > LAVA_Y - 40) d.vy = Math.min(d.vy, -160);
      }
      updateFx(dt);
      if (edge.flap || edge.start) startGame();
      break;

    case ST.PLAY:
      if (paused) { if (edge.start) paused = false; return; }
      if (edge.start) { paused = true; toast('PAUSED'); return; }
      for (var s = pending.length - 1; s >= 0; s--) {
        pending[s].t -= dt;
        if (pending[s].t <= 0) { enemies.push(newEnemy(pending[s].pad, pending[s].tier)); pending.splice(s, 1); }
      }
      updatePlayer(dt);
      updateTroll(dt);
      for (var e2 = enemies.length - 1; e2 >= 0; e2--) {
        updateEnemy(enemies[e2], dt);
        if (enemies[e2].dead) enemies.splice(e2, 1);
      }
      if (state !== ST.PLAY) { updateFx(dt); break; } // player may have died mid-update
      joustCollisions();
      for (var g2 = eggs.length - 1; g2 >= 0; g2--) {
        updateEgg(eggs[g2], dt);
        if (eggs[g2].gone) eggs.splice(g2, 1);
      }
      updatePowerups(dt);
      updateFx(dt);
      if (bannerT > 0) bannerT -= dt;
      if (enemies.length === 0 && eggs.length === 0 && pending.length === 0) {
        var bonus = 1000 + wave * 250;
        addPoints(bonus, W / 2, 250, 'WAVE CLEAR +' + bonus);
        state = ST.WAVECLEAR; stateT = 2.4;
        sfx.wave();
      }
      break;

    case ST.WAVECLEAR:
      updateFx(dt);
      for (var e3 = 0; e3 < enemies.length; e3++) updateEnemy(enemies[e3], dt);
      if (player && player.alive) updatePlayer(dt);
      stateT -= dt;
      if (stateT <= 0) { startWave(wave + 1); state = ST.PLAY; }
      break;

    case ST.DYING:
      for (var e4 = enemies.length - 1; e4 >= 0; e4--) {
        updateEnemy(enemies[e4], dt);
        if (enemies[e4].dead) enemies.splice(e4, 1);
      }
      for (var g3 = eggs.length - 1; g3 >= 0; g3--) {
        updateEgg(eggs[g3], dt);
        if (eggs[g3].gone) eggs.splice(g3, 1);
      }
      updateFx(dt);
      stateT -= dt;
      if (stateT <= 0) {
        troll.active = troll.grab = false; lowT = 0;
        if (lives > 0) {
          player = newPlayer();
          state = ST.PLAY;
        } else {
          state = ST.OVER; stateT = 3;
          sfx.over();
        }
      }
      break;

    case ST.OVER:
      updateFx(dt);
      stateT -= dt;
      if (stateT <= 0) {
        var qualifies = score > 0 && (hiscores.length < 10 || score > hiscores[hiscores.length - 1].score);
        if (qualifies) {
          nameLetters = ['A', 'A', 'A']; nameSlot = 0; submitting = false;
          state = ST.NAME;
        } else {
          fetchScores(); makeDemo(); state = ST.INTRO;
        }
      }
      break;

    case ST.NAME:
      updateFx(dt);
      nameGamepad();
      break;
  }
}

/* -------------------- name entry -------------------- */
var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function cycleLetter(dirn) {
  var i = LETTERS.indexOf(nameLetters[nameSlot]);
  nameLetters[nameSlot] = LETTERS[(i + dirn + 26) % 26];
  sfx.hatch();
}
function submitName() {
  if (submitting) return;
  submitting = true;
  sfx.powerup();
  postScore(nameLetters.join(''), score).then(function () {
    makeDemo(); state = ST.INTRO;
  });
}
function nameKeyboard(e) {
  if (submitting) return;
  if (e.key && e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
    nameLetters[nameSlot] = e.key.toUpperCase();
    if (nameSlot < 2) nameSlot++; else submitName();
    sfx.hatch();
  } else if (e.code === 'Backspace') { if (nameSlot > 0) nameSlot--; }
  else if (e.code === 'Enter') submitName();
}
function nameGamepad() {
  if (submitting) return;
  if (edge.up) cycleLetter(1);
  if (edge.down) cycleLetter(-1);
  if (edge.left && nameSlot > 0) nameSlot--;
  if (edge.right && nameSlot < 2) nameSlot++;
  if (edge.flap) { if (nameSlot < 2) nameSlot++; else submitName(); }
  if (edge.back && nameSlot > 0) nameSlot--;
  if (edge.start) submitName();
}

/* -------------------- rendering -------------------- */
function drawBird(o, mount, rider, alpha) {
  var cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(o.facing, 1);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = mount;
  ctx.shadowBlur = 14;

  // legs
  ctx.strokeStyle = mount;
  ctx.lineWidth = 2.4;
  var run = o.onGround && Math.abs(o.vx) > 20 ? Math.sin(o.runPh * 6) * 6 : 0;
  ctx.beginPath();
  ctx.moveTo(-3, 8); ctx.lineTo(-5 + run, 17);
  ctx.moveTo(4, 8); ctx.lineTo(6 - run, 17);
  ctx.stroke();

  // body
  ctx.fillStyle = mount;
  ctx.beginPath();
  ctx.ellipse(0, 4, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // tail
  ctx.beginPath();
  ctx.moveTo(-11, 3); ctx.lineTo(-19, -3); ctx.lineTo(-11, 8);
  ctx.closePath(); ctx.fill();
  // neck + head
  ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(8, 2); ctx.quadraticCurveTo(13, -2, 14, -8); ctx.stroke();
  ctx.beginPath(); ctx.arc(14.5, -9.5, 4, 0, Math.PI * 2); ctx.fill();
  // beak
  ctx.fillStyle = '#ffe600';
  ctx.beginPath(); ctx.moveTo(17, -11); ctx.lineTo(25, -8.5); ctx.lineTo(17, -7); ctx.closePath(); ctx.fill();
  // eye
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#05010f';
  ctx.beginPath(); ctx.arc(15.5, -10, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 14;

  // wing
  var wingAng = o.flapAnim > 0 ? -0.9 + (0.22 - o.flapAnim) * 8 : 0.35 + Math.sin(time * 4 + cx) * 0.06;
  ctx.save();
  ctx.translate(-2, 2);
  ctx.rotate(wingAng);
  ctx.fillStyle = mount;
  ctx.globalAlpha = alpha * 0.9;
  ctx.beginPath();
  ctx.ellipse(-6, 0, 10, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = alpha;

  // rider
  ctx.shadowColor = rider;
  ctx.fillStyle = rider;
  ctx.fillRect(-4, -13, 7, 10); // torso
  ctx.beginPath(); ctx.arc(-0.5, -16.5, 3.6, 0, Math.PI * 2); ctx.fill(); // head
  ctx.fillStyle = mount; // helmet crest
  ctx.fillRect(-3.5, -21.5, 6, 2.4);
  // lance
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#ffffff';
  ctx.beginPath(); ctx.moveTo(1, -11); ctx.lineTo(19, -18); ctx.stroke();

  ctx.restore();
}

function drawBackground() {
  var grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#04010e');
  grd.addColorStop(0.65, '#0d0325');
  grd.addColorStop(1, '#26041c');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // stars (two parallax drift speeds baked into spd)
  for (var i = 0; i < stars.length; i++) {
    var s = stars[i];
    var x = (s.x - time * s.spd) % W; if (x < 0) x += W;
    ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(time * 1.4 + s.ph));
    ctx.fillStyle = s.r > 1.2 ? '#cfe9ff' : '#8ea6ff';
    ctx.fillRect(x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;

  // distant neon ridges
  drawRidge(430, 90, '#1a0b3a', 'rgba(168,85,247,0.45)', 0.5);
  drawRidge(480, 60, '#12062b', 'rgba(0,229,255,0.35)', 0.8);
}

function drawRidge(baseY, amp, fill, glow, freqMul) {
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (var x = 0; x <= W; x += 16) {
    var y = baseY - Math.abs(Math.sin(x * 0.011 * freqMul + 1.7) * amp) - Math.abs(Math.sin(x * 0.031 * freqMul) * amp * 0.35);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = glow;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawPlatforms() {
  for (var i = 0; i < plats.length; i++) {
    var p = plats[i];
    var edgeCol = p.type === 2 ? '#ff2d95' : p.type === 1 ? '#a855f7' : '#00e5ff';
    var g = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    g.addColorStop(0, '#241a3f');
    g.addColorStop(1, '#0d0620');
    ctx.fillStyle = g;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.shadowColor = edgeCol;
    ctx.shadowBlur = 10;
    ctx.fillStyle = edgeCol;
    ctx.fillRect(p.x, p.y, p.w, 2.5);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.25;
    ctx.fillRect(p.x, p.y + 2.5, p.w, 3);
    ctx.globalAlpha = 1;
  }
}

function drawLava() {
  var g = ctx.createLinearGradient(0, LAVA_Y - 8, 0, H);
  g.addColorStop(0, '#ffdd55');
  g.addColorStop(0.25, '#ff7b00');
  g.addColorStop(1, '#7a0d00');
  ctx.fillStyle = g;
  ctx.shadowColor = '#ff7b00';
  ctx.shadowBlur = 26;
  ctx.beginPath();
  ctx.moveTo(0, H); ctx.lineTo(0, LAVA_Y);
  for (var x = 0; x <= W; x += 12) {
    ctx.lineTo(x, LAVA_Y + Math.sin(x * 0.045 + time * 2.2) * 3.5 + Math.sin(x * 0.013 - time * 1.1) * 2.5);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  // embers
  for (var i = 0; i < embers.length; i++) {
    var em = embers[i];
    ctx.globalAlpha = clamp(em.life / em.ml, 0, 1) * 0.9;
    ctx.fillStyle = em.sz > 1.8 ? '#ffdd55' : '#ff7b00';
    ctx.fillRect(em.x, em.y, em.sz, em.sz);
  }
  ctx.globalAlpha = 1;
}

function drawTroll() {
  if (!troll.active) return;
  ctx.save();
  ctx.translate(troll.x, troll.y);
  ctx.strokeStyle = '#ff7b00';
  ctx.fillStyle = '#c1440e';
  ctx.shadowColor = '#ff7b00';
  ctx.shadowBlur = 14;
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(0, LAVA_Y - troll.y + 20); ctx.lineTo(0, 8); ctx.stroke(); // arm
  ctx.lineWidth = 4;
  for (var f = -1; f <= 1; f++) { // claw fingers
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.quadraticCurveTo(f * 12, -2, f * 9, -12);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEgg(g) {
  var flash = g.timer < 2.5 && ((g.timer * 6) | 0) % 2 === 0;
  ctx.save();
  ctx.translate(g.x + g.w / 2, g.y + g.h / 2);
  ctx.rotate(Math.sin(time * 3 + g.wob) * 0.12);
  ctx.fillStyle = flash ? '#ff3860' : '#fffbe6';
  ctx.shadowColor = flash ? '#ff3860' : '#ffe600';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.ellipse(0, 0, g.w / 2, g.h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(-2, -3, 2.4, 3.4, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawPowerup(u) {
  var def = PUP[u.type];
  var bobA = 0.75 + 0.25 * Math.sin(u.ph * 2);
  var fade = u.t < 2 ? (Math.sin(time * 12) > 0 ? 1 : 0.3) : 1;
  ctx.save();
  ctx.translate(u.x, u.y);
  ctx.globalAlpha = bobA * fade;
  ctx.shadowColor = def.col;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = def.col;
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(10,5,25,0.75)';
  ctx.fill();
  ctx.fillStyle = def.col;
  ctx.font = 'bold 13px "Courier New", monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(def.label, 0, 1);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawParticles() {
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    var a = clamp(p.life / p.ml, 0, 1);
    ctx.globalAlpha = a;
    if (p.shape === 3) {
      ctx.strokeStyle = p.col;
      ctx.lineWidth = 2.5 * a;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2); ctx.stroke();
    } else if (p.shape === 1) {
      ctx.strokeStyle = p.col;
      ctx.lineWidth = p.sz;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
    } else {
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz);
    }
  }
  ctx.globalAlpha = 1;
}

function drawTexts() {
  ctx.textAlign = 'center';
  ctx.font = 'bold 15px "Courier New", monospace';
  for (var i = 0; i < texts.length; i++) {
    var t = texts[i];
    ctx.globalAlpha = clamp(t.life / t.ml, 0, 1);
    ctx.fillStyle = t.col;
    ctx.shadowColor = t.col;
    ctx.shadowBlur = 8;
    ctx.fillText(t.msg, t.x, t.y);
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function neonText(msg, x, y, size, col, align) {
  ctx.font = 'bold ' + size + 'px "Courier New", monospace';
  ctx.textAlign = align || 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = col;
  ctx.shadowBlur = 16;
  ctx.fillStyle = col;
  ctx.fillText(msg, x, y);
  ctx.shadowBlur = 0;
}

function drawHUD() {
  neonText('SCORE ' + score, 18, 32, 20, '#ffe600', 'left');
  var hs = hiscores.length ? hiscores[0].score : 0;
  neonText('HI ' + Math.max(hs, score), W / 2, 32, 20, '#ff2d95', 'center');
  neonText('WAVE ' + wave, W - 18, 32, 20, '#00e5ff', 'right');
  // lives as mini birds
  for (var i = 0; i < lives; i++) {
    ctx.save();
    ctx.translate(28 + i * 26, 52);
    ctx.scale(0.55, 0.55);
    ctx.fillStyle = PLAYER_MOUNT;
    ctx.shadowColor = PLAYER_MOUNT;
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.ellipse(0, 4, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(11, -6, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // active power-up timers
  var px = W - 30;
  for (var k in effects) {
    if (effects[k] <= 0) continue;
    var def = PUP[k];
    ctx.save();
    ctx.translate(px, 58);
    ctx.strokeStyle = def.col;
    ctx.shadowColor = def.col;
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 11, -Math.PI / 2, -Math.PI / 2 + (effects[k] / def.dur) * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = def.col;
    ctx.font = 'bold 11px "Courier New", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(def.label, 0, 1);
    ctx.restore();
    px -= 32;
  }
}

function drawScoreTable(y0) {
  neonText('— HIGH SCORES —', W / 2, y0, 22, '#ff2d95');
  ctx.font = 'bold 17px "Courier New", monospace';
  if (!hiscores.length) {
    neonText('NO CHAMPIONS YET — BE THE FIRST', W / 2, y0 + 44, 15, '#8ea6ff');
    return;
  }
  for (var i = 0; i < hiscores.length; i++) {
    var s = hiscores[i];
    var y = y0 + 32 + i * 24;
    var col = i === 0 ? '#ffe600' : i < 3 ? '#00e5ff' : '#8ea6ff';
    ctx.shadowColor = col; ctx.shadowBlur = 6;
    ctx.fillStyle = col;
    ctx.textAlign = 'left';
    ctx.fillText((i + 1 < 10 ? ' ' : '') + (i + 1) + '.  ' + s.name, W / 2 - 190, y);
    ctx.textAlign = 'right';
    ctx.fillText(String(s.score), W / 2 + 80, y);
    ctx.globalAlpha = 0.55;
    ctx.fillText(s.date, W / 2 + 250, y);
    ctx.globalAlpha = 1;
  }
  ctx.shadowBlur = 0;
}

function drawTitle() {
  var pulse = 0.75 + 0.25 * Math.sin(time * 2.4);
  ctx.save();
  ctx.translate(W / 2, 120);
  ctx.font = 'bold 92px "Courier New", monospace';
  ctx.textAlign = 'center';
  // chromatic ghost layers
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#ff2d95';
  ctx.fillText('JOUST', -3, 0);
  ctx.fillStyle = '#00e5ff';
  ctx.fillText('JOUST', 3, 0);
  ctx.globalAlpha = 1;
  ctx.shadowColor = '#ffe600';
  ctx.shadowBlur = 30 * pulse;
  ctx.fillStyle = '#fffbe6';
  ctx.fillText('JOUST', 0, 0);
  ctx.shadowBlur = 0;
  ctx.restore();
  neonText('· N E O N   E D I T I O N ·', W / 2, 152, 17, '#a855f7');
}

function drawIntro() {
  for (var i = 0; i < demo.length; i++) {
    var d = demo[i];
    drawBird(d, TIERS[d.tier].mount, TIERS[d.tier].rider, 0.55);
  }
  drawTitle();
  drawScoreTable(205);
  if (Math.sin(time * 4) > -0.3) {
    neonText('PRESS FLAP TO START', W / 2, 505, 22, '#00e5ff');
  }
  neonText('KEYS: ARROWS / A D MOVE · SPACE FLAP · P PAUSE · M MUTE', W / 2, 532, 12, '#8ea6ff');
  neonText('GAMEPAD: STICK MOVE · A FLAP · START PAUSE', W / 2, 550, 12, '#8ea6ff');
}

function drawNameEntry() {
  neonText('GAME OVER', W / 2, 130, 56, '#ff3860');
  neonText('NEW HIGH SCORE: ' + score, W / 2, 190, 26, '#ffe600');
  neonText('ENTER YOUR INITIALS', W / 2, 250, 18, '#00e5ff');
  for (var i = 0; i < 3; i++) {
    var x = W / 2 - 70 + i * 70;
    var active = i === nameSlot && !submitting;
    var col = active ? '#ffe600' : '#8ea6ff';
    if (!active || Math.sin(time * 6) > -0.2) {
      neonText(nameLetters[i], x, 330, 52, col);
    }
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = active ? 12 : 4;
    ctx.beginPath();
    ctx.moveTo(x - 24, 344); ctx.lineTo(x + 24, 344);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  neonText(submitting ? 'SAVING…' : 'TYPE LETTERS OR D-PAD TO CYCLE · ENTER / START TO SAVE', W / 2, 420, 14, '#8ea6ff');
}

function drawScanlines() {
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = '#000';
  for (var y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
  ctx.globalAlpha = 1;
  var vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function render() {
  ctx.save();
  if (shake > 0) ctx.translate(rnd(-shake, shake) * 0.6, rnd(-shake, shake) * 0.6);

  drawBackground();
  drawPlatforms();

  if (state === ST.INTRO) {
    drawParticles();
    drawLava();
    drawIntro();
  } else if (state === ST.NAME) {
    drawLava();
    drawParticles();
    drawNameEntry();
  } else {
    // spawn telegraphs
    for (var s = 0; s < pending.length; s++) {
      var sp = pending[s];
      if (sp.t < 0.9) {
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(time * 14);
        ctx.fillStyle = TIERS[sp.tier].mount;
        ctx.shadowColor = TIERS[sp.tier].mount;
        ctx.shadowBlur = 18;
        ctx.fillRect(sp.pad.x - 14, sp.pad.y - 52, 28, 52);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }
    for (var i = 0; i < eggs.length; i++) drawEgg(eggs[i]);
    for (var j = 0; j < powerups.length; j++) drawPowerup(powerups[j]);
    for (var k = 0; k < enemies.length; k++) {
      var e = enemies[k];
      var a = e.spawnT > 0 ? 0.35 + 0.3 * Math.sin(time * 16) : 1;
      drawBird(e, TIERS[e.tier].mount, TIERS[e.tier].rider, a);
    }
    if (player && player.alive) {
      var pa = 1;
      if (player.invuln > 0) pa = Math.sin(time * 18) > 0 ? 0.9 : 0.35;
      drawBird(player, PLAYER_MOUNT, PLAYER_RIDER, pa);
      if (effects.shield > 0) {
        ctx.strokeStyle = '#00e5ff';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 14;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 8);
        ctx.beginPath();
        ctx.arc(player.x + player.w / 2, player.y + player.h / 2, 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
    }
    drawTroll();
    drawLava();
    drawParticles();
    drawTexts();
    drawHUD();

    if (bannerT > 0 && state === ST.PLAY) {
      ctx.globalAlpha = clamp(bannerT / 0.4, 0, 1);
      neonText(bannerMsg, W / 2, 260, 54, '#ffe600');
      neonText(wave === 1 ? 'PREPARE TO JOUST' : 'THEY GROW STRONGER…', W / 2, 300, 17, '#ff2d95');
      ctx.globalAlpha = 1;
    }
    if (state === ST.WAVECLEAR) {
      neonText('WAVE ' + wave + ' CLEAR!', W / 2, 260, 46, '#00ff88');
    }
    if (state === ST.OVER) {
      ctx.fillStyle = 'rgba(4,1,14,0.55)';
      ctx.fillRect(0, 0, W, H);
      neonText('GAME OVER', W / 2, 280, 68, '#ff3860');
      neonText('FINAL SCORE: ' + score, W / 2, 330, 24, '#ffe600');
    }
    if (paused) {
      ctx.fillStyle = 'rgba(4,1,14,0.6)';
      ctx.fillRect(0, 0, W, H);
      neonText('PAUSED', W / 2, 290, 52, '#00e5ff');
      neonText('P / START TO RESUME', W / 2, 330, 16, '#8ea6ff');
    }
    if (troll.grab) {
      neonText('FLAP! FLAP! FLAP!', W / 2, 220, 30, '#ff7b00');
    }
  }

  // toasts
  for (var tt = 0; tt < toasts.length; tt++) {
    ctx.globalAlpha = clamp(toasts[tt].life / 0.5, 0, 1);
    neonText(toasts[tt].msg, W / 2, 80 + tt * 24, 15, '#00ff88');
  }
  ctx.globalAlpha = 1;

  drawScanlines();
  ctx.restore();
}

/* -------------------- main loop -------------------- */
var last = 0, accum = 0, DT = 1 / 60;
function frame(tms) {
  requestAnimationFrame(frame);
  var now = tms / 1000;
  var d = Math.min(0.1, now - last || 0.016);
  last = now;
  if (freeze > 0) { freeze -= d; render(); return; }
  accum += d;
  var steps = 0;
  while (accum >= DT && steps < 6) { tick(DT); accum -= DT; steps++; }
  render();
}
requestAnimationFrame(frame);

// expose a handle for debugging / automated playtesting
window.__joust = {
  get state() { return state; },
  set state(v) { state = v; },
  ST: ST,
  get player() { return player; },
  get enemies() { return enemies; },
  get eggs() { return eggs; },
  get powerups() { return powerups; },
  get pending() { return pending; },
  get wave() { return wave; },
  get lives() { return lives; },
  get score() { return score; },
  set score(v) { score = v; },
  set lives(v) { lives = v; },
  get hiscores() { return hiscores; },
  startGame: startGame,
  startWave: startWave,
  defeatEnemy: defeatEnemy,
  killPlayer: killPlayer
};
}

/* ==================== the page ==================== */

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>JOUST — Neon Edition</title>
<style>
  html, body {
    margin: 0; padding: 0; height: 100%;
    background: #020208;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  canvas {
    width: min(100vw, 160vh);
    height: auto;
    aspect-ratio: 8 / 5;
    box-shadow: 0 0 90px rgba(0, 229, 255, 0.12), 0 0 30px rgba(255, 45, 149, 0.10);
    border-radius: 4px;
    cursor: none;
  }
</style>
</head>
<body>
<canvas id="cv"></canvas>
<script>
(${GAME.toString()})();
</script>
</body>
</html>`;

/* ==================== http server ==================== */

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
    return;
  }

  if (url === '/api/scores' && req.method === 'GET') {
    json(res, 200, loadScores());
    return;
  }

  if (url === '/api/scores' && req.method === 'POST') {
    try {
      const raw = await readBody(req, 1024);
      const data = JSON.parse(raw);
      const name = String(data.name || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
      const score = Math.floor(Number(data.score));
      if (!name || !Number.isFinite(score) || score <= 0 || score > 99999999) {
        json(res, 400, { error: 'invalid name or score' });
        return;
      }
      json(res, 200, await addScore(name, score));
    } catch (e) {
      json(res, 400, { error: 'bad request' });
    }
    return;
  }

  if (url === '/favicon.ico') { res.writeHead(204); res.end(); return; }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log('JOUST — Neon Edition');
  console.log('  play:   http://localhost:' + PORT);
  console.log('  scores: ' + SCORES_FILE);
});
