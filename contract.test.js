/*
  contract.test.js — repo-wide invariants for Aboard the Remorhaz
  Run with:  node contract.test.js

  These are guards against the specific class of bug that cost this game its
  whole stat system: a shared save blob read with the wrong key spelling,
  failing silently because `undefined || 0` is a perfectly good number.

  Nothing here checks gameplay. It checks that the contract between pages
  cannot drift again without something going red.
*/
const fs   = require('fs');
const path = require('path');

const DIR   = __dirname;
const PAGES = fs.readdirSync(DIR).filter(f => f.endsWith('.html') && f !== '_template.html');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; return; }
  fail++;
  console.log('FAIL  ' + name);
  if (detail) String(detail).split('\n').forEach(l => console.log('        ' + l));
}

function lines(file) {
  return fs.readFileSync(path.join(DIR, file), 'utf8').split('\n');
}

// Blanks out comment bodies while preserving line numbering, so a comment
// that *describes* a banned pattern does not trip the check that bans it.
function codeLines(file) {
  const src = fs.readFileSync(path.join(DIR, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\w])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
  return src.split('\n');
}

/* ── 1. No short-uppercase stat reads ──────────────────────────────────
   character-select.html writes long-lowercase stat keys. Any page reading
   stats.DEX gets undefined -> 0 and silently disables that character's
   modifiers. Remorhaz.stat() accepts either spelling; use it. */
{
  const re = /\.(STR|DEX|INT|WIS|CHA|CON)\b/;
  const hits = [];
  PAGES.forEach(f => codeLines(f).forEach((l, i) => {
    if (re.test(l)) hits.push(`${f}:${i + 1}  ${l.trim().slice(0, 90)}`);
  }));
  check('no short-uppercase stat reads (use Remorhaz.stat)', hits.length === 0, hits.join('\n'));
}

/* ── 2. Character identity comes from one place ───────────────────────
   `_raw.character` was read by the hub but written by nobody, so every
   player got Relyt's dialogue. Identity must resolve through charId(). */
{
  const hits = [];
  PAGES.forEach(f => codeLines(f).forEach((l, i) => {
    if (/\b_?raw\.character\b|\bs\.character\b/.test(l)) hits.push(`${f}:${i + 1}  ${l.trim().slice(0, 90)}`);
  }));
  check('no reads of the nonexistent `character` field', hits.length === 0, hits.join('\n'));
}

/* ── 3. Every page loads the state contract ───────────────────────── */
{
  const missing = PAGES.filter(f => !/src="state\.js"/.test(fs.readFileSync(path.join(DIR, f), 'utf8')));
  check('every page includes state.js', missing.length === 0, missing.join(', '));
}

/* ── 4. state.js loads before any inline script that uses it ───────── */
{
  const bad = [];
  PAGES.forEach(f => {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8');
    const tag = src.indexOf('src="state.js"');
    if (tag === -1) return;
    const use = src.search(/\bRemorhaz\s*\./);
    if (use !== -1 && use < tag) bad.push(f);
  });
  check('state.js tag precedes first Remorhaz usage', bad.length === 0, bad.join(', '));
}

/* ── 5. Every inline script block parses ──────────────────────────────
   Catches a truncated edit before it reaches the live site. Blocks are
   wrapped in an async IIFE so a legitimate top-level await does not read
   as a syntax error. */
{
  const vm = require('vm');
  const bad = [];
  PAGES.forEach(f => {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8');
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
    let m, n = 0;
    while ((m = re.exec(src))) {
      n++;
      try { new vm.Script('(async()=>{' + m[1] + '\n})'); }
      catch (e) { bad.push(`${f} block ${n}: ${e.message}`); }
    }
  });
  check('all inline script blocks parse', bad.length === 0, bad.join('\n'));
}

/* ── 6. No page writes the save without going through a merge ─────────
   A bare setItem with a freshly-built object drops keys other pages own.
   Writers must spread an existing read, or use Remorhaz.patch/recordRun. */
{
  const hits = [];
  PAGES.forEach(f => {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8');
    const re = /localStorage\.setItem\(\s*["']remorhaz["']\s*,\s*JSON\.stringify\(\s*\{/g;
    let m;
    while ((m = re.exec(src))) {
      const after = src.slice(m.index, m.index + 400);
      if (!/\.\.\./.test(after.slice(0, 120))) {
        hits.push(`${f}: setItem with an object literal that does not spread prior state`);
      }
    }
  });
  check('no save write drops sibling keys', hits.length === 0, hits.join('\n'));
}

/* ── 7. The two copies of the response deltas agree ───────────────────
   index.html keeps tone deltas twice: the RESP_DELTAS table the code reads,
   and a `delta:` field beside each authored line. The second copy is unused,
   which is exactly how it would rot unnoticed and mislead the next reader. */
{
  const src = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
  const TONES = ['amicable', 'argumentative', 'placating', 'complimentary'];
  const tableSrc = /const RESP_DELTAS = \{([\s\S]*?)\n  \};/.exec(src);
  const problems = [];

  if (!tableSrc) {
    problems.push('RESP_DELTAS table not found');
  } else {
    const table = {};
    tableSrc[1].trim().split('\n').forEach(line => {
      const npc = /^\s*(\w+):\s*\{/.exec(line);
      if (!npc) return;
      table[npc[1]] = {};
      TONES.forEach(t => {
        const m = new RegExp(t + ':\\s*(-?\\d)').exec(line);
        if (m) table[npc[1]][t] = Number(m[1]);
      });
    });

    Object.keys(table).forEach(npc => {
      const blk = new RegExp('\\n    ' + npc + ': \\{([\\s\\S]*?)\\n    \\},\\n').exec(src);
      if (!blk) return;
      TONES.forEach(t => {
        const m = new RegExp(t + ':\\s*\\{[\\s\\S]*?delta:\\s*(-?\\d)').exec(blk[1]);
        if (m && Number(m[1]) !== table[npc][t]) {
          problems.push(`${npc}.${t}: RESP_DELTAS says ${table[npc][t]}, colocated delta says ${m[1]}`);
        }
      });
    });

    // Every crew member needs a way up, or their warmer dialogue is unreachable.
    Object.keys(table).forEach(npc => {
      if (!TONES.some(t => table[npc][t] > 0)) {
        problems.push(`${npc} has no response that raises standing — their high-tier lines cannot be reached`);
      }
    });
  }
  check('response deltas agree and every crew member can be won over', problems.length === 0, problems.join('\n'));
}

/* ── 8. No authored prose that nothing renders ────────────────────────
   This game kept losing writing. Thorgrim had sixteen response lines and a
   branch that returned before reaching them. combat.html defined four
   `preSpy` lines and referenced them nowhere. seabattle.html had three
   per-character tutorial blocks no code path read. cooking.html set an
   `ingridMood` in all four configs and never looked at it.

   Every one of those was silent: the prose existed, the game ran fine, and
   the player simply never saw it. This finds the shape of that mistake —
   a key whose value is a long string, appearing only where it is defined. */
{
  // Keys reached through a computed lookup (obj[tier], r[charId]) look unread
  // to a text scan, because the call site never spells them out.
  const DYNAMIC = new Set([
    'low', 'mid', 'high',            // standing / mood tiers
    'relyt', 'lucy', 'irene',        // per-character variants
    'thorgrim', 'haldor', 'ingrid', 'kalt', 'ursula',
    'cold', 'terse', 'neutral', 'warmer',
  ]);

  const DEF = /(^|[\s{,])([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(["'`])((?:\\.|(?!\3)[\s\S]){45,}?)\3/g;
  const dead = [];

  PAGES.forEach(f => {
    const src = codeLines(f).join('\n');
    const defs = {};
    let m;
    DEF.lastIndex = 0;
    while ((m = DEF.exec(src))) {
      if (DYNAMIC.has(m[2]) || /^\d+$/.test(m[2])) continue;
      defs[m[2]] = (defs[m[2]] || 0) + 1;
    }
    Object.keys(defs).forEach(k => {
      const uses = (src.match(new RegExp('\\b' + k + '\\b', 'g')) || []).length;
      // Only ever mentioned where it is defined: nothing reads it.
      if (uses <= defs[k]) {
        dead.push(`${f}: "${k}" — ${defs[k]} authored value${defs[k] > 1 ? 's' : ''}, never read`);
      }
    });
  });

  check('no authored prose is defined and never rendered', dead.length === 0, dead.join('\n'));
}

/* ── 9. Every page declares a viewport ────────────────────────────────
   Without this a phone lays the page out at ~980px and scales it down, so
   the responsive rules never engage and every control is a third of its
   intended size. */
{
  const missing = PAGES.filter(f =>
    !/<meta\s+name="viewport"[^>]*width=device-width/.test(fs.readFileSync(path.join(DIR, f), 'utf8')));
  check('every page declares a device-width viewport', missing.length === 0, missing.join(', '));
}

/* ── 10. Motion built in JS respects the motion setting ───────────────
   shared.css collapses CSS animation, but a page that constructs its own
   effect — the Day 7 storm builds a full-screen flash element per strike —
   is out of CSS's reach and has to ask. */
{
  const problems = [];
  const sharedCss = fs.readFileSync(path.join(DIR, 'shared.css'), 'utf8');
  if (!/@media\s*\(prefers-reduced-motion/.test(sharedCss)) {
    problems.push('shared.css has no prefers-reduced-motion block');
  }
  PAGES.forEach(f => {
    const src = codeLines(f).join('\n');
    // Pages that build motion imperatively must consult the setting.
    const buildsMotion = /style\.transition\s*=|style\.animation\s*=|requestAnimationFrame\(/.test(src);
    const asks = /reducedMotion\(\)/.test(src);
    const flashes = /lightning-flash|flashLightning/.test(src);
    if (flashes && !asks) problems.push(`${f}: creates flash elements without checking Remorhaz.reducedMotion()`);
    else if (buildsMotion && !asks && /style\.transition\s*=.*scale|style\.transform\s*=\s*"scale/.test(src)) {
      problems.push(`${f}: sets an inline scale transition without checking Remorhaz.reducedMotion()`);
    }
  });
  check('JS-built motion honours prefers-reduced-motion', problems.length === 0, problems.join('\n'));
}

/* ── 11. House style: British English in prose ────────────────────────
   The writing is British throughout — grey thirteen times and gray never,
   traveller, favour, defence. A stray American spelling is the kind of thing
   nobody notices until a reader does, and then it is all they notice.

   Deliberately conservative. Extracting prose from a file that is HTML, CSS
   and JS at once is easy to get wrong: an earlier version of this check also
   matched single-quoted strings, and every apostrophe in the writing
   ("Ursula's", "doesn't") closed a quote it had never opened, producing spans
   that ran through hundreds of lines of code and reported `addColorStop` as a
   spelling mistake. Double quotes and backticks only, and anything carrying
   code punctuation is discarded rather than guessed at. Missing a real hit
   costs a proofread; a false one costs trust in the whole file. */
{
  const AMERICAN = [
    ['color', 'colour'], ['colors', 'colours'], ['colored', 'coloured'],
    ['favor', 'favour'], ['favors', 'favours'], ['favorite', 'favourite'],
    ['honor', 'honour'], ['gray', 'grey'], ['traveler', 'traveller'],
    ['realize', 'realise'], ['realized', 'realised'], ['recognize', 'recognise'],
  ];

  // Inline CSS built in template strings is the main thing that reads like a
  // sentence without being one — gradients in particular are mostly lowercase
  // words and commas.
  const CODEY = /[{}<>=;]|\bpx\b|\bvar\(|:\s*#|https?:|\.\w+\(|\w+:\s*\d|color-mix|oklch|rgba?\(|gradient|deg,/;

  function proseOf(file) {
    let src = fs.readFileSync(path.join(DIR, file), 'utf8');
    src = src.replace(/<style[\s\S]*?<\/style>/g, '');
    src = src.replace(/<!--[\s\S]*?-->/g, '');
    src = src.replace(/\/\*[\s\S]*?\*\//g, '');
    src = src.replace(/(^|[^:\w])\/\/[^\n]*/g, '$1');

    const out = [];
    const STR = /"((?:[^"\\\n]|\\.){12,}?)"|`((?:[^`\\]|\\.){12,}?)`/g;
    let m;
    while ((m = STR.exec(src))) {
      const t = m[1] || m[2];
      if (!/[a-z] [a-z]/.test(t)) continue;   // not a sentence
      if (CODEY.test(t)) continue;            // markup, style, or a call
      out.push(t);
    }
    const body = src.replace(/<script[\s\S]*?<\/script>/g, '');
    (body.match(/>[^<>{}]{15,}</g) || []).forEach(t => out.push(t));
    return out.join('\n');
  }

  const hits = [];
  PAGES.forEach(f => {
    const text = proseOf(f);
    AMERICAN.forEach(([us, uk]) => {
      const m = new RegExp('\\b' + us + '\\b', 'i').exec(text);
      if (m) {
        const at = Math.max(0, m.index - 45);
        hits.push(`${f}: "${m[0]}" should be "${uk}"  …${text.slice(at, m.index + 45).replace(/\s+/g, ' ')}…`);
      }
    });
  });
  check('prose uses British spelling throughout', hits.length === 0, hits.join('\n'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
