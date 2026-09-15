# Cooking with Chef Ingrid — Design Handoff
## Day 1 · The Galley · *Aboard the Remorhaz*

---

## Overview

The player brings their fishing catch to Chef Ingrid Firebrew in the ship's galley.
The fishing result is stored in `localStorage.remorhaz.lastCatch.roll` (1–4) and
determines Ingrid's mood, game difficulty, and every visual beat throughout the session.

This is a **three-act cooking mini-game** preceded by an optional eel-subduing prelude.
Total runtime: ~4–6 minutes. The player earns up to 45 points; **35+ grants Cook's
Utensils Proficiency**, which appears as an award on the result card.

---

## Design Language

Pull all typography, colour tokens, corner brackets, snow, page-header, and back-button
from **`shared.css`** — do not redefine them. Page-specific styles go in `<style>` inline.

**Fonts**
| Usage | Family |
|---|---|
| Stage labels, headers, all-caps | IM Fell English SC |
| Body dialogue | IM Fell English (italic) |
| Casual / handwritten feel | Caveat |

**Key colour tokens (from shared.css `--` variables)**
```
--sea-deep     dark navy bg                oklch(0.10 0.04 245)
--paper        warm off-white text         oklch(0.90 0.035 78)
--paper-dim    muted cream                 oklch(0.74 0.04 75)
--paper-deep   faded amber                 oklch(0.55 0.05 70)
--ink          near-black warm             oklch(0.22 0.03 50)
--hull-darkest deep brown                  oklch(0.16 0.03 45)
--hull-dark    brown                       oklch(0.24 0.04 50)
--hull-mid     mid brown                   oklch(0.33 0.05 55)
--lamp         warm gold                   oklch(0.86 0.17 72)
--lamp-warm    deep amber gold             oklch(0.72 0.18 60)
--lamp-deep    burnt orange               oklch(0.52 0.16 45)
--blood        muted red                   oklch(0.46 0.16 30)
--rope         rope tan                    oklch(0.66 0.07 70)
--rope-dark    dark rope                   oklch(0.42 0.06 60)
--ice-dim      cool blue-grey              oklch(0.62 0.03 225)
```

---

## Page Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  [← Return to Deck]          Day 1 · Cooking          corner ┐     │
│                           Glassblade Trading Co.             │     │
│  ┌──────────────────────────────────────────┐ ┌──────────────┐     │
│  │                                          │ │  [portrait]  │     │
│  │                GAME PANEL                │ │  Ingrid      │     │
│  │           (screens swap here)            │ │  Firebrew    │     │
│  │                                          │ │  ──────────  │     │
│  │                                          │ │  dialogue    │     │
│  │                                          │ │  ──────────  │     │
│  │                                          │ │  phase label │     │
│  │                                          │ │  instruction │     │
│  │                                          │ │  score tally │     │
│  └──────────────────────────────────────────┘ └──────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

**Outer frame**: `.game-area` — `width: min(92vw, 1200px)`, `height: min(76vh, 680px)`,
deep box-shadow, flexbox row.

**Game panel** (left, `flex: 1`): screens stack with `position: absolute; inset: 0`.
One screen is `.active` at a time; transitions use a full-bleed dark overlay that
fades in/out (350ms).

**NPC sidebar** (right, `width: 300px`):
- Dark gradient bg: `color-mix(in oklch, var(--paper) 11%, var(--ink))` → `color-mix(in oklch, var(--paper) 7%, var(--sea-deep))`
- Portrait: 100px circle, `border: 2px solid var(--paper-deep)`, `outline: 5px solid` semi-transparent paper-deep
- Portrait image: `assets/ingrid.png`
- Name: **Chef Ingrid Firebrew** — IM Fell English SC 18px
- Role: *Galley Master · Day 1* — Caveat 14px, `var(--paper-deep)`
- Dialogue: IM Fell English italic 15px, opacity-fades on swap (260ms)
- Phase label: IM Fell English SC 11px, `var(--blood)`, all-caps
- Instruction: Caveat 13px, `var(--paper-deep)`
- Score tally: appears after Stage I — three rows (Heat / Seasoning / Plating) + Total row in `var(--lamp)`

---

## Difficulty System (per Catch Roll)

The catch roll from the fishing game sets the entire difficulty profile.
These four moods should be reflected subtly in Ingrid's posture / expression if
the portrait is illustrated with mood variants; otherwise the dialogue carries it.

| Roll | Catch | Ingrid Mood | Heat Window | Plate Tolerance | Spice Targets |
|---|---|---|---|---|---|
| 1 | 🐟 Silver Fish | Cold, barely tolerates you | 1700ms (very tight) | 32px (strict) | narrow ranges |
| 2 | 🐍 Sea Eel | Terse + eel subdue required | 2200ms | 38px | wider, shifted |
| 3 | 🐠 Arctic Halibut | Neutral, professional | 2600ms | 46px | standard |
| 4 | 🐡 Arctic Char | Faintly approving | 3600ms (generous) | 60px (forgiving) | wide ranges |

**Difficulty tag** (shown on intro screen):
- Roll 1: `MEAGRE HAUL · INGRID IS UNIMPRESSED`
- Roll 2: `SEA EEL · SUBDUE IT FIRST`
- Roll 3: `FINE CATCH · STANDARD EXPECTATIONS`
- Roll 4: `EXCEPTIONAL HAUL · INGRID IS... WILLING`

---

## Screens

All screens share background:
`linear-gradient(to bottom, oklch(0.14 0.04 50), oklch(0.10 0.03 45))` — galley dark brown.

### Screen 0 — Intro

```
  — THE GALLEY —

       [catch emoji, 52px]
    [Catch Name, lamp gold 22px]
    [Ingrid's intro line, italic 16px]

  [DIFFICULTY TAG — blood red, 11px spaced]

        [ENTER THE GALLEY]
```

- Catch emoji is large and centred
- Difficulty tag sits below the body text in `var(--blood)`, spaced caps
- Primary CTA button: `.btn-primary` from shared.css

---

### Screen 1 — Stage 0: Eel Subdue *(Roll 2 only)*

```
  — BEFORE WE BEGIN —
  It is still alive. Hold it down.

  ┌────────────────────────────────────┐
  │                🐍                 │   ← eel moves randomly
  │                                    │
  └────────────────────────────────────┘

         0 / 5 hits

  [████████████████████████] ← timer bar
```

**Eel arena**: `380 × 200px`, dark brown bg `oklch(0.12 0.03 45)`, `border: 1px solid var(--rope-dark)`, `overflow: hidden`, `cursor: crosshair`.

**Eel token**: 52px emoji, `position: absolute`. On click it jumps to a new random position.
Add a brief CSS `transform: scale(0.85)` or shake on hit for tactile feedback.

**Counter**: IM Fell English SC 28px, `var(--lamp)`, shows `0 / 5 hits` incrementing.

**Timer bar**: 380px wide, 10px tall, `border-radius: 5px`.
Fill: `linear-gradient(to right, var(--lamp-warm), var(--blood))`, starts full, drains over 5s.

Failure → timer drains completely → eel escapes → narrow heat window by 400ms → advance to Stage I.
Success → 5 hits → brief Ingrid reaction → advance to Stage I.

---

### Screen 2 — Stage I: The Heat

**Canvas**: `480 × 280px`. This is the most visually rich screen.

#### Canvas Scene — Galley Stovetop

**Background (wall)**
- Linear gradient top→bottom: `#1a1108` → `#0d0906` (deep soot brown)
- Stone block grid: fine lines every 48px horizontal and 32px vertical,
  `rgba(60,40,20,0.4)` — gives texture without distraction

**Hearth glow**
- Radial gradient centered at `(CW×0.5, CH×0.85)`, radius 160px
- `rgba(220,130,30, intensity)` where intensity scales with heatLevel (0 → 1 at heat=60)
- Paints the whole lower area in firelight orange

**Stove base**
- Main body: `#1c1410`, fills `(CW×0.2, CH×0.72)` to bottom
- Ledge top: `#2a1e14`, 4% height strip

**Flames** (5 animated flame shapes above stove)
- Each flame: quadratic bezier curve, wider at base, narrowing to point
- Gradient per flame: `rgba(220,100,10,0.95)` at base → `rgba(240,180,20,0.85)` mid → `rgba(255,230,80,0)` tip
- Height oscillates with `Math.sin(timestamp × 0.006 + i × 1.2)` — each flame has its own phase
- Flame height and intensity scale with heatLevel

**Pan**
- Main ellipse (dark): `cx = CW×0.5`, `cy = CH×0.62`, `rx=100, ry=18`, fill `#0e0a06`
- Interior ellipse (slightly lighter): offset 4px upward, `rx=94, ry=16`, fill `#1a1209`
- Handle: thick rounded line from pan right edge angling up-right, `#2a1e14`, lineWidth 8

**Fish in pan** (colour morphs through 4 states):
```
Heat 0–30:   grey-silver   rgb(120,110,100) → rgb(180,155,110)
Heat 30–60:  raw beige     → rgb(210,170,90)
Heat 60–75:  golden (PERFECT ZONE) with radial shimmer overlay, globalAlpha 0.35
Heat 75–100: overcooked → char rgb(60,35,20)
```
Fish shape: ellipse `(cx, cy, 58, 14, -0.12)` + vertical texture lines + small tail fin triangle at left end.
In the perfect zone, add a warm golden radial shimmer (`rgba(243,195,118,1)` centre → transparent).

**Steam wisps** (appear above heat=45)
- Wavy upward strokes above the pan
- Number of wisps = `floor(heat / 25)`, max ~4
- Each wisp: `quadraticCurveTo` with `Math.sin(time + i)` lateral drift
- `globalAlpha ≈ 0.18 × (heat/100)`, stroke `#c8c8d8`, lineWidth 2

**Sizzle sparks** (appear above heat=80)
- 6 bright dots orbiting pan edge
- `rgba(243,195,118,...)`, radius 1.5px
- Orbit: `cos/sin(timestamp × 0.003 + i × 60°)`, elliptical (Y compressed 0.25)
- globalAlpha randomised per frame for spark flicker

**Thermometer** (right side of canvas)
```
x = CW - 52px, y = CH×0.12, w = 28px, h = CH×0.78
```
- Track: `roundRect` fill `#0e0a06`
- Perfect zone band: amber highlight `rgba(243,195,118,0.22)` positioned by percentages
  - When heat is IN perfect zone: pulsing dashed amber border `0.6 + 0.4×sin(Date.now()×0.01)` opacity
- Fill column: gradient `#2a8eff` (cold/blue) → `#f3c376` (warm/gold) → `#e07030` (hot/orange) → `#8d1a0a` (danger)
- Bulb at bottom: circle radius 14, colour changes at heat>50 (orange) and heat>80 (red)
- Sideways "PERFECT" label rotated −90°, centred on the zone band
  - Amber when in zone, 45% opacity otherwise

**UI below canvas**
```
[LIFT FROM HEAT]       ← disabled until canvas starts, becomes active after 0.5s

[heat result label]    ← appears after lift: "PERFECT TIMING", "OVERCOOKED", etc.
                          IM Fell English SC 13px, var(--lamp), centred
```

**Lift button**: large, prominent — `padding: 14px 36px`, scale 1.03 on hover, red on hover.
Disabled state: `opacity: 0.4`.

**Score outcomes** (shown in result label + Ingrid dialogue):
| Heat at lift | Label | Points |
|---|---|---|
| Well before perfect zone | `RAW — TOO SOON` | 3 |
| Slightly before | `SLIGHTLY EARLY` | 8 |
| In perfect zone (edge) | `GOOD TIMING` | 10–14 |
| In perfect zone (centre) | `PERFECT TIMING` | 15 |
| Overcooked | `OVERCOOKED` | 6 |
| Maxed out / burnt | `BURNT` | 0 |

---

### Screen 3 — Stage II: The Seasoning

```
             [fish emoji, 36px, drop-shadow glow]

  [🧂 SALT]           [🌶 PEPPER]         [🌿 SEA HERBS]
  [spice jar icon]    [spice jar icon]    [spice jar icon]
  [vertical meter]    [vertical meter]    [vertical meter]

               [taste feedback, Caveat italic, lamp]

  [TASTE TEST]          [FINISHED SEASONING]
```

**Fish preview**: 36px, `filter: drop-shadow(0 0 8px color-mix(lamp 40%, transparent))`, 70% opacity.

**Spice jars** (`54 × 72px` each, `border-radius: 4px 4px 2px 2px`):
- Gradient: `oklch(0.35 0.06 55)` top → `oklch(0.22 0.04 50)` bottom
- Border: `1px solid var(--hull-light)`
- `box-shadow: inset 0 2px 4px rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.5)`
- Emoji icon centred inside: 🧂 / 🌶️ / 🌿
- **Pouring state**: `transform: rotate(-25deg) translateY(-6px)` + an animated pour stream:
  small thin gradient line below jar, animates height 14→20px and opacity 0.8→0.5 in a
  0.2s loop — looks like seasoning pouring out

**Vertical meters** (`20px wide × 120px tall`):
- Track: `oklch(0.12 0.03 45)`, `border: 1px solid var(--rope-dark)`, border-radius 10px
- **Target zone highlight**: absolute overlay inside meter, positioned by `bottom%` and `height%`
  from config — amber dashed border top and bottom, `rgba(lamp, 0.30)` fill
- Fill column: starts at 0, grows upward
  - Within target zone: `linear-gradient(to top, var(--lamp-warm), var(--lamp))`
  - Below target: `linear-gradient(to top, var(--sea-light), var(--ice-dim))` (cool blue)
  - Over target: `linear-gradient(to top, var(--blood), oklch(0.6 0.18 30))` (red warning)
- Percentage label above meter: IM Fell English SC 10px, `var(--paper-deep)`

**Hold to pour**: `mousedown` on jar → fill rises at ~1.8%/tick; `mouseup` stops.
The jar visually tilts when pouring; releasing restores it.

**Taste Test button** (one-use):
- Style: subtle, `border: 1px solid var(--paper-deep)`, no fill, IM Fell English SC 11px
- After use: disabled, `opacity: 0.3`
- Feedback text below in Caveat italic `var(--lamp)` — e.g., "more salt, less pepper."

**Target zones by difficulty**:
| Roll | Salt | Pepper | Herbs | Notes |
|---|---|---|---|---|
| 1 | 38–52% | 28–42% | 25–38% | Narrow, precise required |
| 2 | 50–68% | 36–52% | 42–58% | Shifted higher (eel is salty) |
| 3 | 38–58% | 32–52% | 34–54% | Standard |
| 4 | 30–58% | 26–54% | 28–56% | Wide, forgiving |

---

### Screen 4 — Stage III: The Plate

**Part A — Drag items onto plate**

```
  ┌──────────────────────────────────────────────────┐
  │   ┌─────────────────────┐   ┌───────────────┐   │
  │   │   plate (circle)    │   │  FOOD TRAY    │   │
  │   │                     │   │               │   │
  │   │   zone hints appear │   │ [🐟] The Fish │   │
  │   │   while dragging    │   │ [🍋] Lemon    │   │
  │   │                     │   │ [🥄] Sauce    │   │
  │   └─────────────────────┘   └───────────────┘   │
  └──────────────────────────────────────────────────┘
```

**Plate** (`260 × 260px` container, circle):
- Radial gradient: `oklch(0.94 0.03 78)` centre → `oklch(0.82 0.04 75)` edge — warm parchment
- `box-shadow: 0 8px 32px rgba(0,0,0,0.6), inset 0 2px 8px rgba(255,255,255,0.4)`
- `border: 2px solid oklch(0.70 0.04 72)` (plate rim)
- Decorative inner ring: `inset: 14px`, 1px border, 50% opacity
- Zone hints: semi-transparent amber circles (`48×48px`) appear at target positions while
  dragging — opacity 0 normally, 0.35 while dragging. Fade back to 0 on drop.

**Food tokens** (on plate after drop, `52×52px circles`):
- Background: `radial-gradient(circle, oklch(0.30 0.06 55), oklch(0.16 0.03 45))` — dark warm surface
- Emoji centred, 26px
- Accurate placement (within tolerance): gold ring `box-shadow: 0 0 0 3px var(--lamp)`
- Dragging state: `scale(1.15)`, stronger shadow

**Food tray** (right side, vertical stack):
- Dark bg `oklch(0.14 0.04 50)`, subtle border
- Each row: 48px token circle + Caveat label
- Token goes dim (`opacity: 0.25`) after placed

**Dragging UX**:
- Pointer capture — token follows cursor as a fixed-position clone
- Drop target check: must land within plate circle (90% radius threshold)
- If dropped off plate: token snaps back (simply remove floater, tray token stays active)

**Ingrid reacts after each item placed**: dialogue changes based on accuracy.

---

**Part B — Garnish Choice** (shown after all 3 items placed, replaces plate workspace)

```
  Choose a garnish for presentation.

  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │    🌿    │  │    🫧    │  │    🧈    │
  │   Dill   │  │   Roe    │  │  Butter  │
  └──────────┘  └──────────┘  └──────────┘

         [PRESENT THE DISH]  ← disabled until chosen
```

**Garnish cards**: bordered boxes, `padding: 10px 16px`, hover: amber border + faint amber bg.
Chosen state: amber border + `rgba(lamp, 0.14)` bg.

**Bonus points per choice** (based on catch roll):
| Garnish | Best with | Bonus pts |
|---|---|---|
| 🌿 Dill | Roll 4 (char) | 3pts; Roll 3: 2pts; others: 1pt |
| 🫧 Roe | Roll 2 (eel) | 3pts; Roll 4: 2pts; others: 1pt |
| 🧈 Butter | Roll 1 (silver fish) | 3pts; all others: 2pts |

Ingrid reacts to the choice immediately when selected.

---

### Screen 5 — Result Card

Parchment card, animated entrance (`translateY(36px) → 0`, opacity 0→1, 0.55s ease).

```
  — [TAG] —
  [SCORE]
  out of 45 points

  [🍳 Cook's Utensils Proficiency Awarded]   ← only if score ≥ 35

  [verdict text, italic, 16px]

  ─────────────────────
  "[Ingrid's final quote]"
```

**Card style**:
- `linear-gradient(135deg, var(--paper) 0%, var(--paper-dim) 100%)`
- `color: var(--ink)`; all text dark
- Subtle inner border: `inset 0 0 0 1px rgba(255,255,255,0.3)`
- Radial warm glow overlay at bottom-right (lamp at 10% opacity)

**Score number**: IM Fell English SC 52px, `var(--ink)`, line-height 1

**Proficiency box**: amber tinted bg, `border: 1px solid var(--lamp)`, IM Fell English SC 12px

**Result tiers**:
| Score | Tag | Ingrid final quote |
|---|---|---|
| 42–45 | MASTERWORK | "Take the tools. You have earned them. Do not make me regret this." |
| 35–41 | PROFICIENT | "You have thirty-five points. Here are the utensils. Learn to use them properly." |
| 28–34 | ACCEPTABLE | "You have potential. Some. Return tomorrow and do not embarrass me." |
| 18–27 | EDIBLE · BARELY | "...Edible. Barely. Sit down." |
| 0–17 | A LEARNING EXPERIENCE | "We will not speak of this. You will try again." |

**Action buttons** below card (outside the card):
- `[Return to Deck]` → `index.html` (primary)
- `[Try Again]` → `window.location.reload()` (secondary)

---

## NPC Content — Chef Ingrid Firebrew

**Portrait**: `assets/ingrid.png` — 100px circle, centred in sidebar.
Illustrated style should suggest: mid-50s, weathered, competent. Disapproving at rest.
Four optional mood variants could be painted (cold / terse / neutral / warmer) but
the dialogue alone carries the character if single-expression portrait is used.

### Dialogue by Stage and Difficulty

**Intro (on entering)**:
- Roll 1: *"...This. These tiny silver fish. You bring me this."*
- Roll 2: *"A sea eel. Alive. Of course it is alive."*
- Roll 3: *"Halibut. Acceptable. Come. We begin."*
- Roll 4: *"Arctic Char. You did not embarrass yourselves entirely."*

**Stage I (heat timing)**:
*"Knowing how long to leave the fish on the stove is key. Pull it off too soon — it is raw. Leave it too long — it is coal."*

**Heat results**:
- Perfect centre: *"...Timing. Better than I expected. Do not let it go to your head."*
- Good: *"Acceptable. The centre could have been better, but I have seen worse."*
- Raw: *"It is raw. You pulled it from the heat before it was ready. I can fix this. Do not touch anything."*
- Overcooked: *"You left it too long. It will be dry. The crew will not complain — they are too cold to care — but I notice."*
- Burnt: *"You have turned good fish into charcoal. I am... not surprised. Stand back."*

**Stage II (seasoning intro)**:
*"The size of the fish determines how much it needs. Too much salt and you are seasoning the ocean. Too little and it is flavorless — and you will answer for it."*

**Stage III (plating intro)**:
*"Proper presentation requires knowing what people will want to see. Place the fish first — it is the centrepiece. Everything else supports it."*

**Garnish choices**:
- Best match (3pts): *"...Yes. That pairs well. You thought about this."*
- Neutral (2pts): *"A reasonable choice."*
- Poor match (1pt): *"If you must."*

---

## Transition & Animation Summary

| Element | Behaviour |
|---|---|
| Screen changes | Dark overlay fades in (350ms), screen swaps, overlay fades out |
| Ingrid dialogue | `opacity: 0` → wait 260ms → set text → `opacity: 1` (CSS `transition: opacity 0.3s`) |
| Heat canvas | `requestAnimationFrame` loop, continuous |
| Fish colour | Interpolated in canvas draw loop — no CSS transition needed |
| Thermometer fill | Redrawn each frame |
| Perfect zone pulse | `Math.sin(Date.now() × 0.01)` inline in draw call |
| Spice meters | CSS `transition: height 0.12s ease` on fill div |
| Pour stream | CSS `@keyframes pour-stream` — height oscillates 14→20px, opacity 0.8→0.5 |
| Jar tilt | CSS `transform: rotate(-25deg) translateY(-6px)` with `transition: 0.1s` |
| Food token drag | Fixed-positioned clone follows pointer; CSS `transition: transform 0.15s` on floater |
| Placed token glow | CSS `box-shadow: 0 0 0 3px var(--lamp)` added via `.accurate` class |
| Result card | CSS `@keyframes card-rise` — `translateY(36px) → 0`, opacity 0→1, 0.55s cubic |

---

## State & Navigation

**Reads from** `localStorage.remorhaz`:
- `lastCatch.roll` — 1–4, sets difficulty

**Writes to** `localStorage.remorhaz`:
- `completed` — adds `"ingrid"` on any finish
- `completedDays` — adds `1` when both `"haldor"` and `"ingrid"` are complete
- `currentDay` — advances to `2` when Day 1 is fully complete
- `cookingScore` — total points
- `cooksProficiency` — boolean

**Back button**: `← Return to Deck` → `index.html` (fixed top-left)

---

## Files in This Handoff

```
Cooking - Day 1/
├── README.md         ← this document
├── cooking.html      ← fully working prototype (all logic implemented)
└── assets/
    └── ingrid.png    ← NPC portrait (replace with illustrated version)
```

The prototype is complete and playable. Claude Design's role is to replace the
programmer-art canvas and HTML elements with illustrated, atmospheric visuals
matching the quality of the ship hub — while keeping all class names, IDs, and
JavaScript hooks intact so the game logic continues to function.

---

*Part of the Remorhaz Interactive Narrative Project — Day 1 of 9.*
