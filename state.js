/*
  state.js — Aboard the Remorhaz
  ─────────────────────────────────────────────────────────────────────────
  Single source of truth for the shared save blob (localStorage key
  "remorhaz"). Every page includes this BEFORE its own inline script.

  It exists because the save is one object shared by twelve pages, and the
  two things that shared object is worst at — agreeing on key spelling, and
  not clobbering a good run with a worse one — were the cause of most of
  this game's bugs.

  Three jobs:

    1. STATS. character-select writes long-lowercase keys (dexterity).
       Several pages read short-uppercase (DEX) and silently got 0, which
       killed the stat system on Days 5-7. R.stat() accepts either spelling
       and always answers from normalized data.

    2. STANDING. One persistent 0-10 number per crew member, replacing the
       old `influence` map (hub-only, never read) and the per-scene
       `<npc>Rapport` values (reset to 0 every scene). Old saves migrate.

    3. RUN RECORDS. recordRun() writes a minigame's results only when the
       new attempt beats the stored one, so "Try Again" can never destroy a
       better earlier result.
*/
(function (global) {
  "use strict";

  var KEY = "remorhaz";

  /* ── STATS ───────────────────────────────────────────────────────── */

  var STAT_NAMES = ["strength", "dexterity", "intelligence", "wisdom", "charisma", "constitution"];
  var SHORT_TO_LONG = {
    STR: "strength", DEX: "dexterity", INT: "intelligence",
    WIS: "wisdom",   CHA: "charisma",  CON: "constitution"
  };

  /* ── CREW & STANDING ─────────────────────────────────────────────── */

  var CREW = ["thorgrim", "haldor", "ingrid", "kalt", "ursula"];

  var STANDING_START = 3;   // "professional distance" — the crew owes you nothing yet
  var STANDING_MIN   = 0;
  var STANDING_MAX   = 10;

  // Tier cutoffs match the low/mid/high keys the dialogue data is already
  // written against, so no authored content needs re-keying.
  var TIER_LOW_MAX = 3;     // 0-3  low
  var TIER_MID_MAX = 6;     // 4-6  mid
                            // 7-10 high

  // How much of the captain's read on you is his own experience vs. what he
  // hears from his crew. He notices how you treat his people; he weights his
  // own dealings more heavily.
  var THORGRIM_SELF_WEIGHT = 0.65;
  var THORGRIM_CREW_WEIGHT = 0.35;
  // How far ahead of his crew's opinion the captain's own regard may run.
  var THORGRIM_CREW_LEAD   = 2;

  // One second attempt per scene, then the result stands.
  var RETRY_BUDGET = 1;

  /* ── RAW I/O ─────────────────────────────────────────────────────── */

  function readRaw() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || "{}");
      return (v && typeof v === "object") ? v : {};
    } catch (e) { return {}; }
  }

  function writeRaw(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function toNum(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  /* ── STAT NORMALIZATION ──────────────────────────────────────────── */

  // Accepts {DEX:2} or {dexterity:2} or a mix; always returns all six keys
  // in long-lowercase form. Unknown keys are ignored rather than thrown.
  function normalizeStats(raw) {
    var out = {}, i;
    for (i = 0; i < STAT_NAMES.length; i++) out[STAT_NAMES[i]] = 0;
    if (!raw || typeof raw !== "object") return out;

    Object.keys(raw).forEach(function (k) {
      var n = toNum(raw[k], null);
      if (n === null) return;
      var lower = String(k).toLowerCase();
      if (STAT_NAMES.indexOf(lower) !== -1) { out[lower] = n; return; }
      var long = SHORT_TO_LONG[String(k).toUpperCase()];
      if (long) out[long] = n;
    });
    return out;
  }

  // Accepts "DEX" or "dexterity" (any case) and returns the canonical name.
  function canonicalStat(name) {
    if (!name) return null;
    var lower = String(name).toLowerCase();
    if (STAT_NAMES.indexOf(lower) !== -1) return lower;
    return SHORT_TO_LONG[String(name).toUpperCase()] || null;
  }

  /* ── MIGRATION ───────────────────────────────────────────────────── */

  // Folds the two superseded currencies into `standing`, once, in place.
  //   influence:      0-10, default 2   (hub dialogue; was never read)
  //   <npc>Rapport:  -2..+2, default 0  (per-scene; was reset each scene)
  // Old influence 2 is the old neutral, so it maps onto the new neutral 3.
  function migrate(s) {
    if (s.standing && typeof s.standing === "object") return false;

    var standing = {};
    var influence = (s.influence && typeof s.influence === "object") ? s.influence : {};

    CREW.forEach(function (npc) {
      var base    = toNum(influence[npc], 2) + 1;               // 2 -> 3
      var rapport = toNum(s[npc + "Rapport"], 0);
      standing[npc] = clamp(Math.round(base + rapport), STANDING_MIN, STANDING_MAX);
    });

    s.standing = standing;
    s.standingMigratedAt = "v1";
    return true;
  }

  /* ── PUBLIC API ──────────────────────────────────────────────────── */

  var R = {
    KEY: KEY,
    CREW: CREW.slice(),
    STAT_NAMES: STAT_NAMES.slice(),
    STANDING_START: STANDING_START,

    /* Whole-save access ------------------------------------------- */

    load: function () {
      var s = readRaw();
      if (migrate(s)) writeRaw(s);
      return s;
    },

    // Shallow-merge a patch into the save. This is the ONLY safe way to
    // write: it re-reads first, so a page holding a stale copy of the blob
    // cannot silently revert another page's keys.
    patch: function (fields) {
      var s = readRaw();
      migrate(s);
      Object.keys(fields || {}).forEach(function (k) { s[k] = fields[k]; });
      writeRaw(s);
      return s;
    },

    clear: function () {
      try { localStorage.removeItem(KEY); } catch (e) {}
    },

    /* Character ---------------------------------------------------- */

    hasCharacter: function () {
      var s = readRaw();
      return !!(s.selectedCharacter && (s.selectedCharacter.id || s.selectedCharacter.name));
    },

    // Always one of "relyt" | "lucy" | "irene". Prefers the stored id and
    // falls back to matching the display name, so a save written before the
    // id was recorded still resolves to the right character.
    charId: function () {
      var s = readRaw();
      var ch = s.selectedCharacter || {};
      var id = String(ch.id || "").toLowerCase();
      if (id === "relyt" || id === "lucy" || id === "irene") return id;

      var name = String(ch.name || "").toLowerCase();
      if (name.indexOf("lucy")  !== -1) return "lucy";
      if (name.indexOf("irene") !== -1 || name.indexOf("ladell") !== -1) return "irene";
      if (name.indexOf("relyt") !== -1) return "relyt";
      return "relyt";
    },

    charName: function () {
      var s = readRaw();
      return (s.selectedCharacter && s.selectedCharacter.name) || "Relyt Murcielago";
    },

    /* Stats -------------------------------------------------------- */

    stats: function () {
      var s = readRaw();
      return normalizeStats(s.selectedCharacter && s.selectedCharacter.stats);
    },

    // R.stat("DEX") and R.stat("dexterity") are the same call.
    stat: function (name) {
      var key = canonicalStat(name);
      if (!key) return 0;
      return this.stats()[key] || 0;
    },

    // "+2" / "0" / "-1" — for roll equations and stat boxes.
    statLabel: function (name) {
      var m = this.stat(name);
      return m >= 0 ? "+" + m : String(m);
    },

    /* Standing ----------------------------------------------------- */

    standing: function (npc) {
      var s = this.load();
      return clamp(toNum((s.standing || {})[npc], STANDING_START), STANDING_MIN, STANDING_MAX);
    },

    setStanding: function (npc, value) {
      var s = this.load();
      s.standing = s.standing || {};
      s.standing[npc] = clamp(Math.round(toNum(value, STANDING_START)), STANDING_MIN, STANDING_MAX);
      writeRaw(s);
      return s.standing[npc];
    },

    adjustStanding: function (npc, delta) {
      var d = toNum(delta, 0);
      if (!d) return this.standing(npc);
      return this.setStanding(npc, this.standing(npc) + d);
    },

    // "low" | "mid" | "high" — the keys the authored dialogue uses.
    tierOf: function (value) {
      var v = clamp(toNum(value, STANDING_START), STANDING_MIN, STANDING_MAX);
      if (v <= TIER_LOW_MAX) return "low";
      if (v <= TIER_MID_MAX) return "mid";
      return "high";
    },

    standingTier: function (npc) {
      return this.tierOf(this.standing(npc));
    },

    // Mean standing across the four working crew, excluding the captain.
    crewStandingAvg: function () {
      var self = this, sum = 0, n = 0;
      CREW.forEach(function (npc) {
        if (npc === "thorgrim") return;
        sum += self.standing(npc); n++;
      });
      return n ? sum / n : STANDING_START;
    },

    // The captain's read on you: mostly his own dealings, partly what he sees in
    // how his crew take to you.
    //
    // The cap is the important part. He is the only person aboard you can talk to
    // every single day and never work beside, so without it a player who charmed
    // him each morning and was useless all afternoon ended the voyage as his most
    // trusted passenger — which makes a liar of "Flattery wastes time." He will
    // not think better of you than his crew do, give or take a little goodwill.
    thorgrimStanding: function () {
      var crew = this.crewStandingAvg();
      var own  = Math.min(this.standing("thorgrim"), crew + THORGRIM_CREW_LEAD);
      return (own * THORGRIM_SELF_WEIGHT) + (crew * THORGRIM_CREW_WEIGHT);
    },

    thorgrimTier: function () {
      return this.tierOf(Math.round(this.thorgrimStanding()));
    },

    // Maps standing onto the -2..+2 "mood" scale the minigames already use,
    // so standing can be folded into an existing mood calculation without
    // re-keying any authored dialogue.
    standingMoodBias: function (npc) {
      var v = this.standing(npc);
      if (v >= 8) return 2;
      if (v >= 6) return 1;
      if (v <= 1) return -2;
      if (v <= 2) return -1;
      return 0;
    },

    /* Run records -------------------------------------------------- */

    // Write a minigame's results only if this attempt beat the stored one.
    // All of `fields` move together or not at all, so a retry can never
    // leave a high score paired with a worse run's rapport or bonus.
    // Returns true when the new run was recorded.
    recordRun: function (scoreKey, scoreValue, fields) {
      var s = this.load();
      var prev = toNum(s[scoreKey], null);
      var next = toNum(scoreValue, 0);
      var isBest = (prev === null) || (next >= prev);

      if (isBest) {
        s[scoreKey] = next;
        Object.keys(fields || {}).forEach(function (k) { s[k] = fields[k]; });
        writeRaw(s);
      }
      return isBest;
    },

    // Monotonic single value.
    recordBest: function (key, value) {
      var s = this.load();
      var prev = toNum(s[key], null);
      var next = toNum(value, 0);
      if (prev === null || next > prev) { s[key] = next; writeRaw(s); return true; }
      return false;
    },

    /* Day progress ------------------------------------------------- */

    // Idempotent: completing the same NPC twice cannot duplicate an entry.
    markComplete: function (npc, day) {
      var s = this.load();
      var completed = Array.isArray(s.completed) ? s.completed : [];
      if (completed.indexOf(npc) === -1) completed.push(npc);
      s.completed = completed;

      if (day != null) {
        var days = Array.isArray(s.completedDays) ? s.completedDays : [];
        if (days.indexOf(day) === -1) days.push(day);
        s.completedDays = days;
      }
      writeRaw(s);
      return s;
    },

    /* Retry budget -------------------------------------------------- */

    // Failure is a legitimate way through this story. Every minigame writes a
    // score the crew reacts to, and several branch the voyage outright — a bad
    // storm costs a day to repairs, a bad haul sends you back to the nets. None
    // of that means anything if the player can press a button until the dice
    // agree: an unlimited retry turns every check into a formality and costs
    // the successes their weight along with the failures their sting.
    //
    // So: one second attempt. Then the result is the result, and the player
    // carries it. The count is stored in the save rather than held in memory,
    // because reloading the page was itself the unlimited retry.
    retryKey: function (scene, day) {
      var d = (day == null) ? (toNum(this.load().currentDay, 1)) : day;
      return "retry:" + scene + ":" + d;
    },

    retriesLeft: function (scene, day) {
      var used = toNum(this.load()[this.retryKey(scene, day)], 0);
      return Math.max(0, RETRY_BUDGET - used);
    },

    spendRetry: function (scene, day) {
      if (this.retriesLeft(scene, day) <= 0) return false;
      var s = this.load(), k = this.retryKey(scene, day);
      s[k] = toNum(s[k], 0) + 1;
      writeRaw(s);
      return true;
    },

    // Wires a result card's retry control to that budget. Returns whether the
    // button survived, so the caller can make sure the player is never looking
    // at a card with nothing on it to press.
    offerRetry: function (btn, scene, onRetry) {
      if (!btn) return false;
      var self = this;
      if (this.retriesLeft(scene) <= 0) {
        btn.style.display = "none";
        return false;
      }
      btn.style.display = "";
      btn.textContent = "Try Again \u00b7 one attempt left";
      btn.addEventListener("click", function () {
        if (!self.spendRetry(scene)) { btn.style.display = "none"; return; }
        onRetry();
      });
      return true;
    },

    /* What to do next ---------------------------------------------- */

    // The voyage is nine days, and on any given day exactly one thing is the
    // next thing. Every surface that tells the player what to do — the gold
    // ring on the hub, the objective banner above it, the status line inside a
    // crew panel, the button on a minigame's result card — reads this one
    // function, so none of them can contradict another. Before this existed the
    // panel computed its own answer and the ring computed a different one, and
    // the ring could pulse on a crew member whose panel said NOT YET.
    //
    // Order within a day is fixed: the captain's briefing first, because he
    // sets the day's terms, then the crew whose work the day actually is. Only
    // the current step comes back as `primary` — one gold ring at a time, since
    // three at once is not guidance. `zones` carries everything still
    // outstanding, for callers that want to mark the rest without pulsing them.
    DAYS: [
      { n: 1, label: "Fishing & Cooking",     npcs: ["haldor", "ingrid"] },
      { n: 2, label: "Ship Maintenance",      npcs: ["kalt"] },
      { n: 3, label: "Navigation",            npcs: ["ursula"] },
      { n: 4, label: "Maritime Combat",       npcs: ["haldor"] },
      { n: 5, label: "Ice Floes",             npcs: ["ursula"] },
      { n: 6, label: "Sea Monster Attack",    npcs: ["ursula"] },
      { n: 7, label: "Weather the Storm",     npcs: ["ursula"] },
      { n: 8, label: "Skirting the Shelf",    npcs: [] },
      { n: 9, label: "Landfall · Eiselcross", npcs: ["thorgrim"] }
    ],

    STATIONS: {
      thorgrim: { name: "Captain Thorgrim", where: "at the helm" },
      haldor:   { name: "Haldor",           where: "on the main deck" },
      ingrid:   { name: "Ingrid",           where: "in the galley" },
      kalt:     { name: "Kalt",             where: "in the rigging" },
      ursula:   { name: "Ursula",           where: "in the crow’s nest" }
    },

    // The day table with the voyage's branches applied. Day 5 can add Kalt if
    // the ice opened the hull; Day 8 is either emergency repairs, fair winds,
    // or an uneventful passage, depending on how the storm went.
    daysFor: function (s) {
      s = s || this.load();
      var days = this.DAYS.map(function (d) {
        return { n: d.n, label: d.label, npcs: d.npcs.slice() };
      });
      var d5 = days[4], d8 = days[7], d9 = days[8];
      if (s.d5KaltRequired && d5.npcs.indexOf("kalt") === -1) d5.npcs.push("kalt");
      if (s.repairDayRequired) {
        d8.label = "Emergency Repairs";
        d8.npcs  = ["kalt"];
        if (s.refishRequired) d8.npcs.push("haldor");
        if (s.recookRequired) d8.npcs.push("ingrid");
      } else if (s.skipToSyrinlya) {
        d8.label = "Fair Winds";
        d9.label = "Arrival at Syrinlya";
      }
      return days;
    },

    nextStep: function () {
      var s         = this.load();
      var day       = clamp(toNum(s.currentDay, 1), 1, 9);
      var completed = Array.isArray(s.completed) ? s.completed : [];
      var doneDays  = Array.isArray(s.completedDays) ? s.completedDays : [];
      var St        = this.STATIONS;
      function has(z) { return completed.indexOf(z) !== -1; }
      function at(z) { return St[z].name + " " + St[z].where; }

      if (toNum(s.currentDay, 1) > 9 || doneDays.indexOf(9) !== -1) {
        return { day: 9, dayLabel: "Landfall", primary: null, zones: [],
                 action: "voyage-over", short: "The voyage is over",
                 instruction: "The voyage is over.",
                 label: "The voyage is over." };
      }

      var entry = this.daysFor(s)[day - 1];

      // Day 9 is the captain, and only the captain.
      if (day === 9) {
        return { day: day, dayLabel: entry.label, primary: "thorgrim", zones: ["thorgrim"],
                 action: "landfall", short: "Speak with " + St.thorgrim.name,
                 instruction: "Syrinlya is in sight. Speak with " + at("thorgrim") + ".",
                 label: "Day 9 of 9 · Syrinlya is in sight. Speak with " +
                        at("thorgrim") + "." };
      }

      // The captain's briefing opens every other day.
      if (toNum(s.captainSpokenDay, 0) < day) {
        var rest = entry.npcs.filter(function (z) { return !has(z); });
        return { day: day, dayLabel: entry.label, primary: "thorgrim",
                 zones: ["thorgrim"].concat(rest), action: "brief",
                 short: "Speak with " + St.thorgrim.name,
                 instruction: "Speak with " + at("thorgrim") + " for today\u2019s orders.",
                 label: "Day " + day + " of 9 · " + entry.label +
                        ". Speak with " + at("thorgrim") + " for today’s orders." };
      }

      // Then the day's work, in the order the day lists it.
      var pending = entry.npcs.filter(function (z) { return !has(z); });
      if (pending.length) {
        return { day: day, dayLabel: entry.label, primary: pending[0], zones: pending,
                 action: "work", short: "Speak with " + St[pending[0]].name,
                 instruction: "Speak with " + at(pending[0]) + ".",
                 label: "Day " + day + " of 9 · " + entry.label +
                        ". Speak with " + at(pending[0]) + "." };
      }

      // Nothing outstanding. Day 8 reaches this on an uneventful passage; the
      // hub advances the day on load, so this is the moment in between.
      return { day: day, dayLabel: entry.label, primary: null, zones: [],
               action: "sail-on", short: "The ship sails on",
               instruction: "The work is done \u2014 the Remorhaz sails on.",
               label: "Day " + day + " of 9 · " + entry.label +
                      ". The work is done — the Remorhaz sails on." };
    },

    // Has the player already had this particular exchange with this crew member
    // today?
    //
    // Without this, standing is farmable: the hub lets you reopen a crew panel as
    // often as you like, and every reopen offered another free point. That was
    // harmless while standing was written and never read. It is not harmless now.
    //
    // `scope` matters. Meeting Haldor on deck and talking to him between drills
    // are two different conversations on the same day, and each should count once.
    // Sharing a slot would let whichever happened first silently swallow the other
    // — which is exactly what it did before this argument existed.
    //   "hub"   — the approach conversation on the ship hub (default)
    //   "scene" — dialogue inside that day's minigame
    hasSpokenTo: function (npc, day, scope) {
      var ledger = this.load().dialogueLedger;
      return !!(ledger && ledger[(scope || "hub") + ":" + npc + ":" + day]);
    },

    markSpokenTo: function (npc, day, scope) {
      var s = this.load();
      var ledger = (s.dialogueLedger && typeof s.dialogueLedger === "object") ? s.dialogueLedger : {};
      ledger[(scope || "hub") + ":" + npc + ":" + day] = true;
      s.dialogueLedger = ledger;
      writeRaw(s);
    },

    // Credit a day's work with one crew member: -1 poor, 0 adequate, +1 strong.
    //
    // Two rules, both of which exist because the minigames all offer "Try Again".
    //
    // Re-scoring, not accumulating: a retry REPLACES that day's contribution
    // rather than stacking on it. Otherwise replaying Day 1 fishing ten times
    // would buy ten points of Haldor's regard, and standing would be measuring
    // persistence rather than competence.
    //
    // And it only ever goes up. The crew remember your best day's work, so a
    // retry can improve their regard but never spend it. A game that offers a
    // retry should not punish taking it — that was the bug that let a curious
    // replay of a 24-point run trade it for a 9.
    //
    // Dialogue deltas go through adjustStanding() directly; those are moments,
    // and a moment happens once.
    recordWork: function (npc, day, delta) {
      var s = this.load();
      var ledger = (s.workCredit && typeof s.workCredit === "object") ? s.workCredit : {};
      var slot = npc + ":" + day;
      var prev = toNum(ledger[slot], null);
      var next = clamp(Math.round(toNum(delta, 0)), -1, 1);
      if (prev !== null && next <= prev) return this.standing(npc);
      if (prev === null) prev = 0;

      ledger[slot] = next;
      s.workCredit = ledger;
      s.standing = s.standing || {};
      var base = clamp(toNum(s.standing[npc], STANDING_START), STANDING_MIN, STANDING_MAX);
      s.standing[npc] = clamp(base - prev + next, STANDING_MIN, STANDING_MAX);
      writeRaw(s);
      return s.standing[npc];
    },

    // The arrow that goes beside a stage's skill label. Up if this character is
    // better than most at it, down if worse, nothing if it makes no difference.
    //
    // It is the only thing the player is ever told about their own numbers, so
    // it has to appear everywhere a check does. It lived in two minigames out of
    // eight, which meant the other six tested abilities the player had no way of
    // knowing they were weak at.
    arrow: function (name) {
      var m = this.stat(name);
      if (m >= 1)  return '<span class="stat-arrow up">\u25B2</span> ';
      if (m <= -1) return '<span class="stat-arrow dn">\u25BC</span> ';
      return "";
    },

    // Some motion is built in JavaScript rather than CSS — the Day 7 storm
    // creates a full-screen flash element per lightning strike, and a CSS rule
    // can only shorten that, not decide not to have it. Pages that generate
    // their own motion check here and skip it outright.
    reducedMotion: function () {
      try {
        return !!(global.matchMedia &&
                  global.matchMedia("(prefers-reduced-motion: reduce)").matches);
      } catch (e) { return false; }
    },

    /* Bonuses ------------------------------------------------------ */

    // Ursula's Navigator's Favour: +1 to later navigation and observation
    // checks. Claimed on Day 3; spent on Days 5 and 7.
    navigatorFavour: function () {
      return this.load().navigatorBonus ? 1 : 0;
    }
  };

  global.Remorhaz = R;
  global.R = global.R || R;

})(window);
