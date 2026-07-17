'use strict';
/* Minimal tests for the flat-file score DB. Run: npm test */
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createScoreDB } = require('../scores');

let passed = 0;
function ok(cond, msg) { assert.ok(cond, msg); passed++; }

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-chicken-scores-test-'));
  const file = path.join(dir, 'scores.txt');
  const db = createScoreDB(file, 3); // small cap to exercise truncation

  // empty DB
  ok(Array.isArray(db.loadScores()) && db.loadScores().length === 0, 'starts empty');

  // add + sanitize name (lowercase -> upper, trimmed to 3 A-Z)
  let list = await db.addScore('ab!cdef', 100);
  ok(list[0].name === 'ABC' && list[0].score === 100, 'name sanitized to 3 uppercase letters');

  // plain-text, one entry per line "NAME SCORE DATE"
  const raw = fs.readFileSync(file, 'utf8').trim();
  ok(/^ABC 100 \d{4}-\d{2}-\d{2}$/.test(raw), 'file is plain "NAME SCORE DATE" text');

  // sorted descending, truncated to cap of 3
  await db.addScore('AAA', 50);
  await db.addScore('BBB', 300);
  list = await db.addScore('CCC', 200);
  ok(list.length === 3, 'truncated to max cap');
  ok(list[0].name === 'BBB' && list[1].name === 'CCC' && list[2].name === 'ABC', 'sorted descending, lowest dropped');

  // rejects junk without adding
  const before = db.loadScores().length;
  await db.addScore('', 999);
  await db.addScore('ZZ', -5);
  await db.addScore('ZZ', 0);
  await db.addScore('ZZ', 1e12);
  ok(db.loadScores().length === before, 'invalid name/score rejected');

  // malformed lines are skipped on load
  fs.appendFileSync(file, 'this is not a score line\n');
  ok(db.loadScores().length === 3, 'malformed lines skipped');

  fs.rmSync(dir, { recursive: true, force: true });
  console.log('scores.test.js: ' + passed + ' assertions passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
