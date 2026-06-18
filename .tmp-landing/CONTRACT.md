# THE DAILY EDITION — Section Builder Contract

You are building ONE section of a single-file landing page (`src/app/page.tsx`) for
**Data Navigator** — an offline-first Electron + Next.js desktop app that turns a telecom
operator's daily `DailyTransactions.csv` into a finished morning report (DuckDB engine,
embedded offline AI, forecasting, geo analysis, report export to PDF/DOCX/PPTX, LAN
collaboration, voice). The audience: telecom analysts and the security teams that approve
their tools. Nothing leaves the machine — that is the product's soul.

## The concept

The landing page IS a living broadsheet newspaper — "The Daily Edition" — being typeset,
inked, proofed and delivered as the reader scrolls. Your section is one rubrique of that
newspaper. Warm paper, ink type, vermilion editor's pen. NOT a SaaS template: no glass
cards, no glows, no dark-navy, no purple gradients, no rounded-2xl card grids, no
three-equal-columns, no emoji.

## Mandatory reading

READ `.tmp-landing/preamble.tsx` FIRST — it defines the design language and every shared
symbol available to you (constants `EDITION/INK/PAPER/VERMILION/PRESS_BLUE/...`, easings
`EASE_INK/EASE_PRESS/SPRING_*`, class recipes `T.*`, motion primitives `Parallax,
StickyScene, useSegment, RiseIn, SettleIn, DeckReveal, CountUpInk, TypeOn,
useDriftProgress`, ink accents `InkPath, PenUnderline, PenCircle, PenStrike`, furniture
`Rule, DoubleRule, SectionMast, FolioLine, Stamp, MarginNote, PullQuote, Byline,
DropCapParagraph`, charts `InkLine, InkBars, InkArea, InkGauge, InkDotMap, inkScale,
inkPathFrom`, actions `InkButton, InkLink`). Use them — do not reinvent them.

## Hard rules

1. **Fragment only.** Write ONLY your section's code: NO imports, NO "use client", NO
   default export. Your code is concatenated after the preamble inside the same module.
2. **Prefix discipline.** EVERY top-level identifier (components, helpers, data consts,
   types) MUST start with your assigned prefix (e.g. prefix `Masthead` →
   `MastheadSection`, `MastheadPlate`, `MASTHEAD_DECKS`). The ONLY component another
   section will reference is `<Prefix>Section`.
3. **Available symbols.** React hooks (`useState useEffect useRef useMemo useCallback
   useId`), motion (`motion, AnimatePresence, useScroll, useTransform, useSpring,
   useMotionValue, useMotionValueEvent, useInView, useReducedMotion`, type
   `MotionValue`), `Link`, types `ReactNode/CSSProperties/RefObject`, everything exported
   by the preamble (use WITHOUT import), and lucide icons (see 4).
4. **Icons.** Use any lucide-react icon by its official export name; list every icon you
   used in your manifest. The assembler merges them into the import line. Verify the name
   exists in lucide-react (e.g. `Newspaper`, `Printer`, `Stamp` is TAKEN by the preamble
   component — alias concerns: do NOT use a lucide icon whose name collides with a
   preamble export (`Stamp`, `Rule`, `Check` is fine—it's already imported). If you need
   lucide's `Stamp`, skip it; pick another glyph.
5. **No hooks inside callbacks.** `StickyScene` children and `.map()` bodies must not
   call hooks — make a real child component and pass the `MotionValue` / index as props.
6. **Motion budget.** transform / opacity / pathLength only. No animated `filter`,
   `box-shadow`, `width/height/top/left`. `backdrop-blur` forbidden. All looping
   animation must come from the `ed-*` utility classes (`ed-tape`, `ed-tape-fast`,
   `ed-tape-reverse`, `ed-tape-hold`, `ed-rumble`, `ed-caret`, `ed-stamp`) or
   motion values; gate everything behind `useReducedMotion`.
7. **Surfaces.** Page background is `#f6f1e7` (paper). Your section sits directly on it
   or on `#eee6d6` / `#e4dac5` blocks. Ink `#1c1914`, rules `#d6ccb6`, accent vermilion
   `#bf3415` (sparingly — it's the editor's pen, not a brand wash), links/secondary
   `#2b4a8b`. Tailwind arbitrary values with these exact hexes. Square corners
   everywhere (no rounded-* except `rounded-full` for dots/ports). Shadows only the
   offset-print kind: `shadow-[4px_4px_0_#1c1914]` or softened paper lift
   `shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)]`.
8. **Type.** Headlines: `font-serif` (Fraunces) with `[font-variation-settings:'WONK'_1]`
   for display sizes, tight leading (~0.95–1.05), sizes via clamp e.g.
   `text-[clamp(2.4rem,5.5vw,4.8rem)]`. Kickers/labels: `T.kicker` or
   `font-grotesk uppercase tracking-[0.2em+]`. Data: `font-mono tabular-nums`. Sentence
   case for headlines (newspaper style), never Title Case.
9. **Copy.** English editorial voice, French data labels (canaux, réussite, journalier…).
   Organic numbers (2 147 380 · 97,4 % · 16 h 04). Banned words: elevate, seamless,
   unleash, next-gen, game-changer, empower, revolutionize, supercharge. No lorem ipsum.
   Write like a sharp newsroom: specific, dry wit allowed.
10. **Responsive + perf.** Must hold at 360px, 768px, 1280px, 1680px. Root element:
    `<section id="<given-id>" className="relative" style={{ contentVisibility: "auto", containIntrinsicSize: "auto <approx-height>px" }}>`
    (StickyScene-based sections SKIP contentVisibility — sticky needs layout). Heavy
    loops must mount only `whileInView`/`useInView`.
11. **A11y.** Decorative SVG `aria-hidden`; real buttons for interactions; visible
    focus (`focus-visible:outline-2 focus-visible:outline-[#bf3415]`); `aria-expanded`
    on accordions.
12. **Size & quality.** Target the line count in your brief (±15%). Reach it with REAL
    substance — richer data sets, more editorial micro-detail (datelines, folios,
    corrections, annotations), responsive variants, doc comments explaining design
    intent. NEVER pad with blank lines, repeated blocks, or commentary noise. Biome
    formats with 100-col lines; write naturally.
13. **Determinism.** No `Math.random()`, no `Date.now()`, no `new Date()` — derive
    pseudo-organic variation from index math (`Math.sin(i * 2.7)` etc).
14. **Self-check.** Before finishing, re-read your fragment for: prefix discipline,
    balanced JSX, no imports/exports, no hooks-in-callbacks, icon names listed in
    manifest, banned-word sweep.

## Deliverables

1. Write your fragment to `.tmp-landing/fragments/<NN>-<prefix>.tsx`
2. Write `.tmp-landing/fragments/<NN>-<prefix>.manifest.json`:
   `{ "component": "<Prefix>Section", "icons": ["IconA", ...], "lines": <count> }`
3. Return the same manifest as your structured output.

## Page order (for context — build ONLY yours)

01 Spine (nav + progress) → 02 Masthead (front page) → 03 Tape (KPI ticker) →
04 Lead (anomaly investigation) → 05 Fold (the fold moment) → 06 Press (golden path
presses, sticky) → 07 Classified (30+ features index) → 08 Desk (DuckDB engine) →
09 Bureau (offline AI interview) → 10 Carto (geo plate) → 11 Almanac (forecast) →
12 Archive (history/versions) → 13 Colophon (architecture/security) → 14 Letters
(testimonials) → 15 Questions (FAQ) → 16 Subscribe (CTA) → 17 Folio (footer)

App routes you may link to: `/signup` (Get started), `/login` (Sign in), `/dashboard`
(Open the app). Anchors: `#workflow` (Press), `#capabilities` (Classified), `#faq`
(Questions), `#subscribe` (Subscribe), `#lead` (Lead story), `#top`.
