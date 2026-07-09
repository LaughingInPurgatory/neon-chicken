'use strict';
/*
 * Flat-file high-score database. Plain text, one "NAME SCORE DATE" entry per
 * line (e.g. "ACE 55555 2026-07-07"). This is the only file the app ever writes
 * outside its own bundle. No Electron dependency, so it can be unit-tested with
 * plain node.
 */
const fs = require('node:fs');
const path = require('node:path');

function createScoreDB(file, maxScores) {
  maxScores = maxScores || 10;

  function loadScores() {
    let txt = '';
    try { txt = fs.readFileSync(file, 'utf8'); } catch (e) { return []; }
    return txt.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^([A-Z]{1,3})\s+(\d+)\s+(\S+)$/);
        return m ? { name: m[1], score: Number(m[2]), date: m[3] } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxScores);
  }

  // Serialize writes so rapid saves can't interleave in the file.
  let writeChain = Promise.resolve();
  function saveScores(list) {
    const txt = list.map((s) => s.name + ' ' + s.score + ' ' + s.date).join('\n') + '\n';
    writeChain = writeChain
      .then(() => fs.promises.mkdir(path.dirname(file), { recursive: true }))
      .then(() => fs.promises.writeFile(file, txt))
      .catch(() => {});
    return writeChain;
  }

  // Sanitizes input; a bad name/score is ignored and the current table returned.
  async function addScore(rawName, rawScore) {
    const name = String(rawName || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    const score = Math.floor(Number(rawScore));
    if (!name || !Number.isFinite(score) || score <= 0 || score > 99999999) {
      return loadScores();
    }
    const list = loadScores();
    list.push({ name, score, date: new Date().toISOString().slice(0, 10) });
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, maxScores);
    await saveScores(top);
    return top;
  }

  return { loadScores, addScore, file };
}

module.exports = { createScoreDB };
