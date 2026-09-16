/*
  playthrough.test.js — does the voyage actually end differently?
  Run with:  node playthrough.test.js

  state.test.js proves the standing API is correct in isolation. This proves
  something harder and more important: that nine days of choices add up to
  endings a player can tell apart.

  It simulates whole voyages at the state layer — the same calls the pages make,
  with the same deltas, in day order — and checks the summary the ending screen
  would print. If a future change quietly flattens the consequence curve (an NPC
  who can no longer be won over, a scene that stops crediting work, a tier that
  swallows its neighbours), an archetype's ending stops matching and this fails.
*/
const fs   = require('fs');
const path = require('path');

let store = {};
global.window = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
eval(fs.readFileSync(path.join(__dirname, 'state.js'), 'utf8'));
const R = global.window.Remorhaz;

let pass = 0, fail = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) === JSON.stringify(b)) { pass++; return; }
  fail++;
  console.log(`FAIL  ${m}\n        got  ${JSON.stringify(a)}\n        want ${JSON.stringify(b)}`);
};

/* The hub's RESP_DELTAS, mirrored from index.html. Kept here deliberately: if
   the two drift, contract.test.js check 7 catches the drift, and this file
   catches what the drift would do to a player's ending. */
const RESP_DELTAS = {
  thorgrim: { amicable: 0, argumentative: -1, placating:  1, complimentary: 1 },
  haldor:   { amicable: 0, argumentative:  1, placating: -1, complimentary: 1 },
  ingrid:   { amicable: 1, argumentative: -1, placating: -1, complimentary: 1 },
  kalt:     { amicable: 0, argumentative: -1, placating:  1, complimentary: 1 },
  ursula:   { amicable: 0, argumentative:  0, placating:  1, complimentary: 1 },
};

/* Which crew member each day's work belongs to, and who is worth talking to. */
const SCHEDULE = [
  { day: 1, work: [['haldor', 'fishing'], ['ingrid', 'cooking']] },
  { day: 2, work: [['kalt', 'maintenance']] },
  { day: 3, work: [['ursula', 'navigation']], sceneTalk: ['ursula'] },
  { day: 4, work: [['haldor', 'combat']],     sceneTalk: ['haldor'] },
  { day: 5, work: [['ursula', 'icefloe']] },
  { day: 6, work: [['ursula', 'seabattle']] },
  { day: 7, work: [['ursula', 'weatherstorm']] },
  { day: 8, work: [] },
];

/* The ending screen's label ladder, mirrored from end.html buildStats(). */
const regard = v =>
  v >= 9 ? 'Would sail with you again' :
  v >= 7 ? 'Trusted' :
  v >= 4 ? 'Respectful' :
  v >= 2 ? 'Professional' :
           'Cold';

// One voyage. `tone` is the hub/scene response the player always picks;
// `workDelta` is how well every shift goes.
function voyage(tone, workDelta) {
  store = {};
  SCHEDULE.forEach(({ day, work, sceneTalk }) => {
    // The captain is worth a word every morning.
    if (!R.hasSpokenTo('thorgrim', day)) {
      R.adjustStanding('thorgrim', RESP_DELTAS.thorgrim[tone]);
      R.markSpokenTo('thorgrim', day);
    }
    work.forEach(([npc]) => {
      if (!R.hasSpokenTo(npc, day)) {                  // the approach on deck
        R.adjustStanding(npc, RESP_DELTAS[npc][tone]);
        R.markSpokenTo(npc, day);
      }
      R.recordWork(npc, day, workDelta);               // and the shift itself
    });
    (sceneTalk || []).forEach(npc => {                 // dialogue inside the scene
      if (!R.hasSpokenTo(npc, day, 'scene')) {
        R.adjustStanding(npc, RESP_DELTAS[npc][tone]);
        R.markSpokenTo(npc, day, 'scene');
      }
    });
  });
  const out = {};
  ['haldor', 'ingrid', 'kalt', 'ursula'].forEach(n => { out[n] = regard(R.standing(n)); });
  out.captain = regard(Math.round(R.thorgrimStanding()));
  return out;
}

/* ── The three archetypes ─────────────────────────────────────────────── */

// Warm and capable. Should be welcome anywhere on this ship.
const best = voyage('complimentary', 1);
eq(best.captain, 'Trusted',    'model shipmate — the captain trusts you');
eq(best.haldor,  'Trusted',    'model shipmate — Haldor');
eq(best.ursula,  'Would sail with you again', 'model shipmate — Ursula, who you work beside most');
eq(best.ingrid,  'Respectful', 'model shipmate — Ingrid, only two shifts together');
eq(best.kalt,    'Respectful', 'model shipmate — Kalt, likewise');

// Good at the work, disagreeable about it. Haldor is the outlier by design:
// his own written replies reward pushback where everyone else punishes it.
const prickly = voyage('argumentative', 1);
eq(prickly.captain, 'Professional', 'competent but argumentative — his crew vouch for you; he does not');
eq(prickly.haldor,  'Trusted',      'competent but argumentative — Haldor likes being argued with');
eq(prickly.ingrid,  'Professional', 'competent but argumentative — Ingrid is not won by argument');

// Kind, and no use at all. The captain must be able to tell this apart from
// competence, or the flattery route trivialises him.
const kindly = voyage('complimentary', -1);
eq(kindly.captain, 'Respectful', 'warm but useless — charm alone will not make him trust you');
eq(kindly.ursula,  'Respectful', 'warm but useless — Ursula');

// Neither use nor manners.
const worst = voyage('argumentative', -1);
eq(worst.captain, 'Cold', 'no use and no manners — the captain is done with you');
eq(worst.kalt,    'Cold', 'no use and no manners — Kalt');

/* ── The properties that matter more than any single number ───────────── */

// Every crew member must be able to move, or their authored range is dead.
['haldor', 'ingrid', 'kalt', 'ursula'].forEach(n => {
  eq(best[n] !== worst[n], true, `${n}'s regard responds to how you play`);
});

// Being good at the job and being decent about it must be separable axes —
// otherwise there is only one way to play and the choices are decoration.
eq(prickly.captain !== kindly.captain, true, 'competence and courtesy are different axes');

// The captain will not think better of you than his crew do. This is the rule
// that stops a player charming him every morning and being useless every
// afternoon — he is the only person aboard you never actually work beside.
store = {};
['haldor', 'ingrid', 'kalt', 'ursula'].forEach(n => R.setStanding(n, 2));
R.setStanding('thorgrim', 10);
const flatteredOnly = R.thorgrimTier();
store = {};
['haldor', 'ingrid', 'kalt', 'ursula'].forEach(n => R.setStanding(n, 9));
R.setStanding('thorgrim', 10);
eq([flatteredOnly, R.thorgrimTier()], ['low', 'high'],
   'his regard is capped by his crew\'s, and released when they vouch for you');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
