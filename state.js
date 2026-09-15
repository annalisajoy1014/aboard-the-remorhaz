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

    // The captain's read on you: mostly his own dealings, partly what he
    // sees in how his crew treat you.
    thorgrimStanding: function () {
      return (this.standing("thorgrim") * THORGRIM_SELF_WEIGHT) +
             (this.crewStandingAvg()    * THORGRIM_CREW_WEIGHT);
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
