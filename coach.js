/*
  coach.js — Aboard the Remorhaz

  One instruction layer for every minigame.

  The games were each explaining themselves in their own way, or not at all:
  icefloe carried no instruction element of any kind, weatherstorm one. What a
  player had to DO was spread between a controls card on the splash, a phase
  caption, and in several cases nowhere — so the skill was partly in guessing
  the controls, which is not the skill any of these scenes are about. Failing a
  haul because the sea beat you is the game. Failing it because nobody said to
  click is not.

  So: one bar, in the same place, in the same language, on all eight. It says
  the verb first as a chip (CLICK / HOLD / SPACE / DRAG / WATCH), then what to
  do in a short sentence, and it changes as the scene changes rather than being
  read once on a splash and forgotten.

  The highlight ring is deliberately the same gold pulse the hub uses to mark
  the crew member whose turn it is. A player learns "gold ring means act here"
  once, on the first screen of the game, and it keeps meaning that everywhere.

  Nothing here is injected into a page's own markup: the bar builds itself, so
  a page only ever calls Coach.say(). That keeps the eight scenes from drifting
  apart again.
*/
(function (global) {
  "use strict";

  var CHIPS = {
    CLICK: "click",
    HOLD:  "hold",
    SPACE: "key",
    DRAG:  "drag",
    WATCH: "watch",
    WAIT:  "watch",
    TYPE:  "key"
  };

  var el = {};           // bar, chip, text
  var built = false;
  var targetEl = null;
  var flashTimer = null;

  function reduced() {
    try {
      return !!(global.matchMedia &&
                global.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) { return false; }
  }

  function build() {
    if (built || !global.document || !global.document.body) return;
    var bar = global.document.createElement("div");
    bar.className = "coach-bar";
    bar.id = "coachBar";
    // polite, not assertive: the bar updates often and should never interrupt
    // a screen reader mid-sentence during play.
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-live", "polite");
    bar.innerHTML =
      '<span class="coach-chip" id="coachChip" aria-hidden="true"></span>' +
      '<span class="coach-text" id="coachText"></span>';
    global.document.body.appendChild(bar);
    el.bar  = bar;
    el.chip = bar.querySelector("#coachChip");
    el.text = bar.querySelector("#coachText");
    built = true;
  }

  function ready(fn) {
    if (!global.document) return;
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", fn);
    } else { fn(); }
  }

  var Coach = {

    // The one call a scene needs. `chip` is the verb the player performs;
    // leaving it out gives a bar with no chip, for pure status lines.
    //
    //   Coach.say("Watch for the fish to swarm the net", "WATCH")
    //   Coach.say("Haul the moment they gather", "CLICK")
    //
    say: function (text, chip) {
      build();
      if (!built) return this;
      el.bar.classList.add("show");
      el.bar.classList.remove("is-hit", "is-miss");
      if (chip) {
        el.chip.textContent = String(chip).toUpperCase();
        el.chip.dataset.kind = CHIPS[String(chip).toUpperCase()] || "click";
        el.chip.style.display = "";
      } else {
        el.chip.style.display = "none";
      }
      el.text.textContent = text || "";
      return this;
    },

    // Puts the hub's gold ring on whatever the player should act on. Accepts a
    // selector or an element; passing nothing clears it.
    target: function (node) {
      this.untarget();
      if (!node) return this;
      var n = (typeof node === "string")
        ? (global.document && global.document.querySelector(node))
        : node;
      if (!n) return this;
      n.classList.add("coach-target");
      targetEl = n;
      return this;
    },

    untarget: function () {
      if (targetEl) targetEl.classList.remove("coach-target");
      targetEl = null;
      return this;
    },

    // Immediate confirmation that an action landed, or did not. Colour does the
    // work (green reads as yes, red as no) but never alone — each carries its
    // own words, because colour alone excludes a colourblind player.
    hit:  function (msg) { return this._flash("is-hit",  msg); },
    miss: function (msg) { return this._flash("is-miss", msg); },

    _flash: function (cls, msg) {
      build();
      if (!built) return this;
      if (msg) el.text.textContent = msg;
      // An outcome is not an instruction, so it carries no verb. Without this
      // the chip kept whatever the last say() set, and the bar reported a miss
      // as "CLICK - Too late, the fish scattered" - telling the player to click
      // at the one moment clicking does nothing, and inviting a HOLD after the
      // rope was already aboard. Every scene calls hit/miss through here, so
      // the stale verb showed up in all eight.
      el.chip.style.display = "none";
      el.bar.classList.add("show", cls);
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(function () {
        if (el.bar) el.bar.classList.remove("is-hit", "is-miss");
      }, reduced() ? 1200 : 900);
      return this;
    },

    hide: function () {
      if (built) el.bar.classList.remove("show");
      this.untarget();
      return this;
    },

    // For the rare scene that wants the bar out of the way of a result card.
    isShowing: function () { return built && el.bar.classList.contains("show"); }
  };

  ready(build);

  global.Coach = Coach;
  if (global.Remorhaz) global.Remorhaz.coach = Coach;

})(window);
