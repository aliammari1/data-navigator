/* ──────────────────────────────────────────────────────────────────────────────
 *  05 · FOLD — the fold moment
 *  ─────────────────────────────────────────────────────────────────────────────
 *  A short sticky interlude (StickyScene, 2 pages) staging the one physical
 *  gesture every broadsheet reader knows: the paper folds. Above the fold,
 *  the front page recaps the morning so far — the file, the figures, the
 *  anomaly chased down and corrected. Then the top half of the sheet rotates
 *  away (rotateX 0 → −68°, perspective 1200, hinged at the crease) and the
 *  second half of the edition rises from below: "how it's made", page 4.
 *
 *  Choreography (scene progress 0 → 1, segments via useSegment):
 *    0.00–0.10  dwell — the sheet sits flat, counters set the figures in type
 *    0.10–0.60  FOLD   — upper half hinges back; crease ink + shadow intensify;
 *                        the paper-back shade (#e4dac5) creeps over the verso
 *    0.45–0.90  REVEAL — front-page columns sink and fade; the below-the-fold
 *                        teaser rises through the crease into the lower half
 *    0.86–0.96  STAMP  — "à suivre — p.4" slams onto the teaser corner
 *
 *  Motion contract: 100 % transform/opacity. The hinge is a single rotateX on
 *  a composited layer; everything else is translate/scale/opacity driven off
 *  the same scroll value. prefers-reduced-motion collapses the whole scene to
 *  a static two-half sheet in normal document flow — no pinning, no jack.
 * ───────────────────────────────────────────────────────────────────────────── */

/** Scene timing table — one source of truth for every segment in this act. */
const FOLD_SEGMENTS = {
  /** upper half hinges from 0° to −68° */
  fold: [0.1, 0.6],
  /** teaser rises while the front-page columns sink away */
  reveal: [0.45, 0.9],
  /** "à suivre" stamp slams near the end of the scene */
  stamp: [0.86, 0.96],
  /** scroll hint fades as soon as the reader commits */
  hint: [0.02, 0.14],
} as const;

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · DATA — the morning recap, set in type
 * ════════════════════════════════════════════════════════════════════════════ */

type FoldStat = {
  id: string;
  /** French data label, per the newsroom's house style */
  label: string;
  /** full sentence for assistive tech — the chip itself is typographic */
  srLabel: string;
  icon: ReactNode;
  /** animated figure (CountUpInk) — omit when the value is a clock time */
  count?: { end: number; decimals?: number; suffix?: string };
  /** literal figure when counting makes no sense (16 h 04 is not a number) */
  staticValue?: string;
  unit?: string;
  /** provenance line — where the figure comes from, printed small */
  footnote: string;
  /** day-over-day movement, set in vermilion like a margin correction */
  delta: string;
  /** eight-point sparkline, deterministic, drawn in soft ink at ≥xl */
  spark: ReadonlyArray<number>;
};

/** The three figures the front page led with — repeated here as the recap. */
const FOLD_RECAP_STATS: ReadonlyArray<FoldStat> = [
  {
    id: "rows",
    label: "Lignes traitées",
    icon: <Database aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
    count: { end: 2147380 },
    unit: "lignes",
    footnote: "DailyTransactions_2026-06-11.csv · 41 colonnes",
    delta: "+3,1 % vs mercredi",
    spark: [62, 70, 74, 81, 78, 84, 90, 96],
  },
  {
    id: "success",
    label: "Réussite",
    icon: <CircleCheck aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
    count: { end: 97.4, decimals: 1, suffix: " %" },
    footnote: "tous canaux · pondérée volume",
    delta: "+0,6 pt après correctif",
    spark: [96, 95, 31, 58, 84, 95, 97, 97],
  },
  {
    id: "anomaly",
    label: "Anomalie résolue",
    icon: <Flag aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
    staticValue: "16 h 04",
    footnote: "USSD · creux détecté à 04 h 12",
    delta: "11 h 52 du creux au correctif",
    // minutes-to-resolution across the last eight incidents — trending down
    spark: [310, 240, 270, 190, 150, 120, 96, 71],
  },
];

/** Hourly success curve (%) — the dip at 04 h is the lead story's anomaly. */
const FOLD_HOURLY: ReadonlyArray<number> = [
  82, 84, 83, 80, 31, 46, 71, 83, 89, 92, 94, 95, 96, 95, 93, 94, 97, 97, 96, 94, 91, 89, 86, 84,
];
/** Index of the 04 h reading — circled in vermilion by the editor's pen. */
const FOLD_HOURLY_MARK = 4;

type FoldColumn = {
  id: string;
  title: string;
  paras: ReadonlyArray<string>;
  /** column 2 carries the hourly curve as a printed graphic */
  withChart?: boolean;
  /** column 4 carries the canal weather table */
  withTable?: boolean;
  /** classic newspaper jump line — "Suite page 4" */
  jump?: string;
};

/**
 * The front-page continuation that lives BELOW the crease before the teaser
 * rises over it. Four short columns, justified like real broadsheet body —
 * a faithful recap of sections 02–04 so the fold reads as a summary, not
 * decoration. Columns 2–4 collapse away on narrow paper.
 */
const FOLD_RECAP_COLUMNS: ReadonlyArray<FoldColumn> = [
  {
    id: "une",
    title: "Ce que la une racontait",
    paras: [
      "A single file arrived at 06 h 00 — DailyTransactions_2026-06-11.csv, 2 147 380 lignes, " +
        "41 colonnes — and never left the building. By 06 h 02 the desk had profiled every " +
        "canal and set the masthead figures in type.",
      "No upload, no sampling, no « send to the cloud for processing ». The whole front page " +
        "was composed on one machine; the network cable stayed coiled in the drawer.",
    ],
  },
  {
    id: "bandeau",
    title: "Ce que le bandeau chiffrait",
    paras: [
      "Réussite 97,4 % tous canaux ; USSD en tête à 41 % du volume ; montant journalier " +
        "4,2 M TND ; latence médiane des requêtes 0,8 s sur 2,1 M de lignes.",
    ],
    withChart: true,
  },
  {
    id: "enquete",
    title: "Ce que l'enquête a établi",
    paras: [
      "At 04 h 12 the success curve fell to 31 % on canal USSD — a gateway timeout, not " +
        "fraud. Twelve DuckDB queries traced it, the window was flagged in red pen, and the " +
        "correctif shipped at 16 h 04, before the evening run.",
    ],
    jump: "Suite et fabrication, page 4 — sous le pli.",
  },
  {
    id: "meteo",
    title: "La météo des canaux",
    paras: ["Part de volume et tendance par canal, relevées à l'heure du bouclage."],
    withTable: true,
  },
];

type FoldCanalRow = {
  canal: string;
  part: string;
  /** typographic trend glyph — set in mono like a weather table */
  tendance: "↗" | "→" | "↘";
  note: string;
};

/** Five canals, share of volume and tendency — the analyst's weather report. */
const FOLD_CANAL_WEATHER: ReadonlyArray<FoldCanalRow> = [
  { canal: "USSD", part: "41 %", tendance: "↗", note: "stable après correctif" },
  { canal: "SMS", part: "23 %", tendance: "→", note: "rien à signaler" },
  { canal: "APP", part: "19 %", tendance: "↗", note: "+1,8 pt sur la semaine" },
  { canal: "WEB", part: "11 %", tendance: "↘", note: "−0,4 pt, surveillé" },
  { canal: "AGENT", part: "6 %", tendance: "→", note: "saisonnier, normal" },
];

type FoldIndexItem = {
  page: string;
  title: string;
  note: string;
  /** only anchors that exist on this page — others stay plain print */
  href?: string;
};

/** "À l'intérieur" — the teaser's index of what waits below the fold. */
const FOLD_TEASER_INDEX: ReadonlyArray<FoldIndexItem> = [
  {
    page: "p.4",
    title: "Les sept presses",
    note: "la chaîne de fabrication, de l'ingestion à l'export",
    href: "#workflow",
  },
  {
    page: "p.5",
    title: "Petites annonces",
    note: "trente et quelques capacités, classées par rubrique",
    href: "#capabilities",
  },
  {
    page: "p.6",
    title: "L'entretien",
    note: "une IA de bureau qui répond, réseau débranché",
  },
];

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · PRINT FURNITURE — crop marks, sheet masthead, crease
 * ════════════════════════════════════════════════════════════════════════════ */

/** Printer's crop mark — hairline cross at each corner of the sheet. */
function FoldCropMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={`h-4 w-4 ${className ?? ""}`}>
      <line x1="8" y1="0" x2="8" y2="5.5" stroke={INK_FADED} strokeWidth="1" />
      <line x1="8" y1="10.5" x2="8" y2="16" stroke={INK_FADED} strokeWidth="1" />
      <line x1="0" y1="8" x2="5.5" y2="8" stroke={INK_FADED} strokeWidth="1" />
      <line x1="10.5" y1="8" x2="16" y2="8" stroke={INK_FADED} strokeWidth="1" />
    </svg>
  );
}

/** The sheet's own miniature masthead — this is a page OF the paper, after all. */
function FoldSheetMastStrip() {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pt-3 sm:px-8">
      <span className="flex items-center gap-2 font-serif text-[13px] font-bold tracking-tight text-[#1c1914]">
        <Newspaper aria-hidden className="h-3.5 w-3.5 -translate-y-px" strokeWidth={2.2} />
        {EDITION.masthead}
        <span className="hidden font-grotesk text-[9px] font-semibold uppercase tracking-[0.24em] text-[#857c69] md:inline">
          · première partie
        </span>
      </span>
      <span className={`${T.folio} hidden sm:block`}>
        {EDITION.volume} · {EDITION.issue}
      </span>
      <span className={T.folio}>{EDITION.datelineShort}</span>
    </div>
  );
}

/**
 * The crease. A zero-height seam between the two halves of the sheet that
 * carries three layers: the ink line of the fold itself, the soft shadow the
 * hinged half throws onto the page below, and a bindery tag ("plier ici").
 * Both opacities are driven by the fold segment; static numbers serve the
 * reduced-motion variant. Opacity-only — the gradients never animate.
 */
function FoldCrease({
  line,
  shadow,
}: {
  line?: MotionValue<number> | number;
  shadow?: MotionValue<number> | number;
}) {
  return (
    <div className="relative z-30 h-0 w-full">
      {/* the fold's ink — a thin gradient so the crease dies out at the margins */}
      <motion.div
        aria-hidden
        style={{ opacity: line ?? 0.6 }}
        className="absolute inset-x-0 top-[-1.5px] h-[3px] bg-gradient-to-r from-transparent via-[#1c1914] to-transparent"
      />
      {/* shadow cast on the lower page as the upper half tilts away */}
      <motion.div
        aria-hidden
        style={{ opacity: shadow ?? 0.16 }}
        className="pointer-events-none absolute inset-x-0 top-[1px] h-12 bg-gradient-to-b from-[#1c1914]/30 to-transparent"
      />
      {/* bindery tag, riding the crease like a production note */}
      <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 -rotate-1">
        <span className="flex items-center gap-2 border border-dashed border-[#857c69] bg-[#eee6d6] px-3 py-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[#4a4438]">
          <Scissors aria-hidden className="h-3 w-3" />
          plier ici — ne pas couper
        </span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · ABOVE THE FOLD — recap headline + the three figures
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * One recap figure, printed as a chip: label, animated value, provenance and
 * delta. A deterministic half-degree tilt (sin of the index) keeps the three
 * chips from looking machine-aligned — they were set by hand, after all.
 */
function FoldStatChip({ stat, index }: { stat: FoldStat; index: number }) {
  const tilt = Math.sin(index * 2.7) * 0.7;
  return (
    <SettleIn delay={index * 0.08} y={14}>
      <div
        style={{ transform: `rotate(${tilt}deg)` }}
        className="flex h-full flex-col border-2 border-[#1c1914] bg-[#f6f1e7] px-2.5 py-2 shadow-[3px_3px_0_#1c1914] sm:px-4 sm:py-3"
      >
        <div className="flex items-center gap-1.5 text-[#4a4438]">
          {stat.icon}
          <span className="font-grotesk text-[8.5px] font-bold uppercase tracking-[0.18em] sm:text-[10px]">
            {stat.label}
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          {stat.count ? (
            <CountUpInk
              end={stat.count.end}
              decimals={stat.count.decimals ?? 0}
              suffix={stat.count.suffix ?? ""}
              duration={1.4}
              className="text-[clamp(0.95rem,2.6vw,1.65rem)] font-semibold tracking-tight text-[#1c1914]"
            />
          ) : (
            <span
              className={`${T.num} text-[clamp(0.95rem,2.6vw,1.65rem)] font-semibold tracking-tight text-[#1c1914]`}
            >
              {stat.staticValue}
            </span>
          )}
          {stat.unit && (
            <span className="hidden font-mono text-[10px] text-[#857c69] md:inline">
              {stat.unit}
            </span>
          )}
        </div>
        {/* eight readings, drawn small in soft ink — wide desks only */}
        <div className="mt-1.5 hidden h-6 xl:block">
          <InkLine data={stat.spark} w={140} h={24} stroke={INK_SOFT} duration={0.9} />
        </div>
        <p className="mt-1 hidden font-mono text-[9px] leading-snug text-[#857c69] lg:block">
          {stat.footnote}
        </p>
        <p className="mt-auto hidden pt-1 font-mono text-[9.5px] font-semibold text-[#bf3415] md:block">
          {stat.delta}
        </p>
      </div>
    </SettleIn>
  );
}

/**
 * The upper half of the sheet — everything the reader keeps when the paper
 * is folded. Mini masthead, oversized recap headline, the three figures, and
 * page furniture (folio, correction, sign-off stamp). Height-budgeted to fit
 * 44 % of the stage at every breakpoint; justify-center absorbs the slack.
 */
function FoldSheetUpper({ className }: { className?: string }) {
  return (
    <div className={`relative flex min-h-0 flex-col ${className ?? ""}`}>
      <FoldSheetMastStrip />
      <Rule className="mx-4 mt-2 w-auto sm:mx-8" />

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-1.5 px-4 sm:gap-2.5 sm:px-8">
        <RiseIn amount={0.2}>
          <p className={`${T.kicker} text-[#bf3415]`}>Au-dessus du pli · le récapitulatif</p>
        </RiseIn>
        {/* DeckReveal lines force the same two-line break at every width */}
        <div role="heading" aria-level={2}>
          <DeckReveal
            stagger={0.1}
            className="font-serif text-[clamp(1.7rem,4.5vw,4.2rem)] font-semibold leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
            lines={[
              <span key="l1">Above the fold —</span>,
              <span key="l2">
                the <PenUnderline delay={0.55}>story so far</PenUnderline>.
              </span>,
            ]}
          />
        </div>
        <SettleIn delay={0.15}>
          <p className={`${T.ui} hidden max-w-[62ch] md:block`}>
            One file arrived at 06 h 00. By press time it was a front page: every canal counted,
            one anomaly chased to its burrow, and the proof signed before the evening run.
          </p>
        </SettleIn>
      </div>

      {/* the desk's sign-off, stamped beside the headline on wide paper */}
      <div className="absolute right-8 top-14 hidden lg:block xl:right-12">
        <Stamp color={STAMP_GREEN} tilt={-7}>
          Bouclé 16 h 04
        </Stamp>
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 sm:gap-3 sm:px-8 lg:gap-4">
        {FOLD_RECAP_STATS.map((stat, i) => (
          <FoldStatChip key={stat.id} stat={stat} index={i} />
        ))}
      </div>

      {/* page-foot furniture: folio left, correction centre, jump right */}
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2.5 pt-2 sm:px-8 sm:pb-3">
        <span className={T.folio}>la une · p.1</span>
        <span className="hidden font-serif text-[11px] italic text-[#857c69] xl:block">
          Correction — Wednesday's edition put réussite at 96,8 % ; the desk regrets the optimism.
        </span>
        <span className={`${T.folio} hidden sm:block`}>suite p.4, sous le pli ↓</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · BELOW THE CREASE, BEFORE THE TURN — front-page continuation
 * ════════════════════════════════════════════════════════════════════════════ */

/** The hourly curve as a printed graphic — anomaly circled at 04 h. */
function FoldHourlyChart() {
  return (
    <figure className="mt-2.5 border border-[#d6ccb6] bg-[#f6f1e7]/70 p-2">
      <div className="h-16">
        <InkLine data={FOLD_HOURLY} markIndex={FOLD_HOURLY_MARK} w={260} h={64} duration={1.1} />
      </div>
      <figcaption className="mt-1.5 font-mono text-[9px] leading-snug text-[#857c69]">
        Réussite horaire (%) — le creux de 04 h 12 sur USSD, corrigé à 16 h 04.
      </figcaption>
    </figure>
  );
}

/** The canal weather table — share, tendency, terse forecast per canal. */
function FoldCanalWeather() {
  return (
    <div className="mt-2.5 border-t border-[#d6ccb6]">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-[#d6ccb6] py-1 font-grotesk text-[8.5px] font-bold uppercase tracking-[0.18em] text-[#857c69]">
        <span>canal</span>
        <span className="text-right">part</span>
        <span className="text-right">tend.</span>
      </div>
      {FOLD_CANAL_WEATHER.map((row) => (
        <div
          key={row.canal}
          className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-[#d6ccb6]/60 py-[5px] font-mono text-[10px] text-[#1c1914]"
        >
          <span className="flex items-baseline gap-2">
            {row.canal}
            <span className="hidden truncate text-[8.5px] text-[#857c69] xl:inline">
              {row.note}
            </span>
          </span>
          <span className="text-right tabular-nums">{row.part}</span>
          <span
            className={`text-right ${row.tendance === "↘" ? "text-[#bf3415]" : "text-[#4a4438]"}`}
          >
            {row.tendance}
          </span>
        </div>
      ))}
    </div>
  );
}

/** One justified broadsheet column: ordinal, title, body, optional graphic. */
function FoldRecapColumn({ col, index }: { col: FoldColumn; index: number }) {
  // column 1 always prints; 2–3 need md; the weather table needs lg
  const visibility =
    index === 0 ? "flex" : index < 3 ? "hidden md:flex" : "hidden lg:flex";
  const divider = index > 0 ? "md:border-l md:border-[#d6ccb6] md:pl-5 lg:pl-7" : "";
  return (
    <div className={`${visibility} min-h-0 flex-col ${divider}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-grotesk text-[10px] font-bold uppercase tracking-[0.22em] text-[#1c1914]">
          {col.title}
        </h3>
        <span className="font-mono text-[9px] text-[#857c69]">col. {index + 1}</span>
      </div>
      <Rule className="mt-1.5" />
      <div className="mt-2.5 min-h-0 space-y-2.5 overflow-hidden">
        {col.paras.map((p, pi) => (
          <p
            key={p.slice(0, 24)}
            className={`font-serif text-[13px] leading-[1.6] text-[#4a4438] [hyphens:auto] [text-align:justify] ${
              index === 0 && pi === 0
                ? "first-letter:float-left first-letter:mr-1.5 first-letter:font-serif first-letter:text-[2.1em] first-letter:font-bold first-letter:leading-[0.85] first-letter:text-[#1c1914]"
                : ""
            }`}
          >
            {p}
          </p>
        ))}
        {col.withChart && <FoldHourlyChart />}
        {col.withTable && <FoldCanalWeather />}
        {col.jump && (
          <p className="font-serif text-[12.5px] font-medium italic leading-snug text-[#bf3415]">
            → {col.jump}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The front-page continuation that occupies the lower half until the teaser
 * rises over it. In the sticky scene this layer sinks (y +36) and fades as
 * the reveal segment advances — old news literally giving way to the next page.
 */
function FoldRecapColumns({ className }: { className?: string }) {
  return (
    <div
      className={`grid h-full grid-cols-1 gap-x-6 gap-y-4 px-4 py-4 sm:px-8 sm:py-5 md:grid-cols-3 lg:grid-cols-[1.1fr_1fr_1.1fr_0.9fr] lg:gap-x-7 ${className ?? ""}`}
    >
      {FOLD_RECAP_COLUMNS.map((col, i) => (
        <FoldRecapColumn key={col.id} col={col} index={i} />
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · BELOW THE FOLD — the teaser that rises through the crease
 * ════════════════════════════════════════════════════════════════════════════ */

/** One line of the "à l'intérieur" index; rows with anchors become links. */
function FoldTeaserIndexRow({ item }: { item: FoldIndexItem }) {
  const body = (
    <span className="flex flex-col items-center gap-0.5 text-center">
      <span className="font-mono text-[10px] font-semibold tracking-[0.12em] text-[#bf3415]">
        {item.page}
      </span>
      <span className="flex items-center gap-1 font-serif text-[15px] font-bold leading-tight text-[#1c1914]">
        {item.title}
        {item.href && (
          <ArrowUpRight
            aria-hidden
            className="h-3 w-3 text-[#2b4a8b] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        )}
      </span>
      <span className="font-grotesk text-[11px] leading-snug text-[#4a4438]">{item.note}</span>
    </span>
  );
  return item.href ? (
    <a
      href={item.href}
      className="group focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bf3415]"
    >
      {body}
    </a>
  ) : (
    <div>{body}</div>
  );
}

/**
 * The teaser proper: "Below the fold — how it's made." A big ArrowDown in a
 * letterpress block, the LA FABRICATION kicker pointing at #workflow, and a
 * three-entry inside-index. The parent layer handles the rise; this component
 * only owns the arrow's idle bob (reduced-motion: none) and the "à suivre"
 * stamp, whose entrance is driven by the stamp segment passed from the stage.
 * In the static variant no MotionValue arrives, so a constant-1 fallback keeps
 * the stamp printed flat — hooks stay unconditional either way.
 */
function FoldTeaser({ stampProgress }: { stampProgress?: MotionValue<number> }) {
  const reduce = useReducedMotion();
  const settled = useMotionValue(1);
  const sp = stampProgress ?? settled;
  const stampOpacity = useTransform(sp, [0, 1], [0, 1]);
  const stampScale = useTransform(sp, [0, 1], [1.6, 1]);
  const stampRotate = useTransform(sp, [0, 1], [4, -6]);

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-2.5 px-4 py-5 text-center sm:gap-3.5 sm:px-8">
      <p className={`${T.kicker} text-[#bf3415]`}>Sous le pli · la suite</p>

      <div
        role="heading"
        aria-level={2}
        className="font-serif text-[clamp(1.6rem,4.3vw,4rem)] font-semibold leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
      >
        Below the fold — how it's made.
      </div>

      <p className={`${T.ui} hidden max-w-[58ch] sm:block`}>
        Seven presses run in order — ingest, profile, analyse, interrogate, chart, compose,
        export — and not one of them touches a network. The making-of begins overleaf.
      </p>

      {/* the big arrow: a letterpress block the reader can actually push */}
      <a
        href="#workflow"
        aria-label="Continuer vers la fabrication, page 4"
        className="group mt-1 inline-block focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bf3415]"
      >
        <motion.span
          aria-hidden
          animate={reduce ? undefined : { y: [0, 7, 0] }}
          transition={reduce ? undefined : { duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="flex h-14 w-14 items-center justify-center border-2 border-[#1c1914] bg-[#f6f1e7] shadow-[4px_4px_0_#1c1914] transition-all group-hover:translate-x-[2px] group-hover:translate-y-[2px] group-hover:shadow-[1px_1px_0_#1c1914] sm:h-16 sm:w-16"
        >
          <ArrowDown className="h-7 w-7 text-[#1c1914]" strokeWidth={2.4} />
        </motion.span>
      </a>

      <a
        href="#workflow"
        className="flex items-center gap-1.5 font-grotesk text-[12px] font-bold uppercase tracking-[0.2em] text-[#bf3415] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bf3415]"
      >
        La fabrication, p.4
        <ArrowRight aria-hidden className="h-3.5 w-3.5" />
      </a>

      {/* à l'intérieur — the inside index, wide paper only */}
      <div className="mt-1 hidden w-full max-w-3xl grid-cols-3 gap-5 border-t border-[#d6ccb6] pt-3 md:grid">
        {FOLD_TEASER_INDEX.map((item) => (
          <FoldTeaserIndexRow key={item.page} item={item} />
        ))}
      </div>

      {/* the end-of-scene stamp — slams during the final segment */}
      <motion.div
        aria-hidden
        style={{ opacity: stampOpacity, scale: stampScale, rotate: stampRotate }}
        className="absolute right-3 top-3 sm:right-8 sm:top-6"
      >
        <span className="inline-block border-[2.5px] border-[#bf3415] px-2.5 py-1 font-grotesk text-[10px] font-black uppercase tracking-[0.18em] text-[#bf3415] [border-radius:3px]">
          à suivre — p.4
        </span>
      </motion.div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · STAGE CHROME — fold meter and scroll hint
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A pressroom gauge for the fold itself: a vermilion bar (scaleX, hinged
 * left) plus a zero-padded percentage read off the MotionValue. The readout
 * is the one place this scene touches React state — a cheap integer that
 * changes at most 100 times across two viewport-heights of scroll.
 */
function FoldMeter({ fold }: { fold: MotionValue<number> }) {
  const [pct, setPct] = useState(0);
  useMotionValueEvent(fold, "change", (v) => setPct(Math.round(v * 100)));
  return (
    <div aria-hidden className="hidden items-center gap-2.5 md:flex">
      <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[#857c69]">pli</span>
      <div className="h-[3px] w-28 bg-[#d6ccb6]">
        <motion.div
          style={{ scaleX: fold, transformOrigin: "left center" }}
          className="h-full w-full bg-[#bf3415]"
        />
      </div>
      <span className="w-12 font-mono text-[10px] tabular-nums text-[#4a4438]">
        {String(pct).padStart(3, "0")} %
      </span>
    </div>
  );
}

/** Bottom-of-stage hint; gone by the time the fold is truly under way. */
function FoldHint({ progress }: { progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [FOLD_SEGMENTS.hint[0], FOLD_SEGMENTS.hint[1]], [1, 0]);
  const y = useTransform(progress, [FOLD_SEGMENTS.hint[0], FOLD_SEGMENTS.hint[1]], [0, 8]);
  return (
    <motion.div
      style={{ opacity, y }}
      className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center"
    >
      <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.24em] text-[#857c69]">
        <ArrowDown aria-hidden className="h-3 w-3" />
        faites défiler — le journal se plie
        <ArrowDown aria-hidden className="h-3 w-3" />
      </span>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · THE STAGE — sticky scene wiring (all hooks live here, top level)
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Receives the StickyScene progress as a prop — never created inside the
 * render callback — and derives every transform for the act:
 *
 *   rotateX      0 → −68°   the hinge (perspective 1200, origin bottom)
 *   backShade    0 → 0.85   #e4dac5 creeping over the verso as light leaves it
 *   creaseLine   peaks mid-fold, then relaxes — paper under tension
 *   creaseShadow 0.05 → 0.5 the fold's shadow on the page below
 *   columns      sink (+36px) and fade as the reveal claims the lower half
 *   teaser       rises 104 % → 0 through the crease, clipped by overflow
 *   sheetY       0 → −3 %   the whole sheet eases up to recentre on page 4
 */
function FoldStage({ progress }: { progress: MotionValue<number> }) {
  const fold = useSegment(progress, FOLD_SEGMENTS.fold[0], FOLD_SEGMENTS.fold[1]);
  const reveal = useSegment(progress, FOLD_SEGMENTS.reveal[0], FOLD_SEGMENTS.reveal[1]);
  const stampIn = useSegment(progress, FOLD_SEGMENTS.stamp[0], FOLD_SEGMENTS.stamp[1]);

  const rotateX = useTransform(fold, [0, 1], [0, -68]);
  const backShade = useTransform(fold, [0, 1], [0, 0.85]);
  const creaseLine = useTransform(fold, [0, 0.55, 1], [0.15, 1, 0.6]);
  const creaseShadow = useTransform(fold, [0, 1], [0.05, 0.5]);
  const columnsOpacity = useTransform(reveal, [0, 0.45], [1, 0]);
  const columnsY = useTransform(reveal, [0, 1], [0, 36]);
  const teaserY = useTransform(reveal, [0, 1], ["104%", "0%"]);
  const teaserOpacity = useTransform(reveal, [0, 0.3, 1], [0, 0.4, 1]);
  const sheetY = useTransform(fold, [0, 1], ["0%", "-3%"]);

  return (
    <div className="relative flex h-full flex-col">
      {/* stage chrome — rubrique slug, fold gauge, dateline */}
      <div className="relative z-40 flex items-center justify-between gap-4 px-4 pt-4 sm:px-8">
        <span className={T.folio}>Rubrique nº 05 — le pli</span>
        <FoldMeter fold={fold} />
        <span className={`${T.folio} hidden sm:block`}>
          Édition du matin · {EDITION.datelineShort}
        </span>
      </div>

      {/* the sheet — two halves hinged at the crease */}
      <motion.div
        style={{ y: sheetY }}
        className="relative z-10 mx-auto min-h-0 w-full max-w-[1680px] flex-1 px-3 pb-10 pt-3 sm:px-6 lg:px-10"
      >
        <div className="relative flex h-full min-h-0 flex-col">
          {/* printer's crop marks at the trim corners */}
          <FoldCropMark className="absolute -left-2 -top-2 hidden sm:block" />
          <FoldCropMark className="absolute -right-2 -top-2 hidden sm:block" />
          <FoldCropMark className="absolute -bottom-2 -left-2 hidden sm:block" />
          <FoldCropMark className="absolute -bottom-2 -right-2 hidden sm:block" />

          {/* UPPER HALF — hinges backward at the crease. One composited layer:
              rotateX + perspective on this element, nothing else animates. */}
          <motion.div
            style={{
              rotateX,
              transformPerspective: 1200,
              transformOrigin: "bottom center",
            }}
            className="ed-fiber relative z-20 flex min-h-0 basis-[44%] flex-col overflow-hidden bg-[#eee6d6] will-change-transform [backface-visibility:hidden]"
          >
            <DoubleRule />
            <FoldSheetUpper className="min-h-0 flex-1" />
            {/* the paper's back: light drains off the verso as it tilts away */}
            <motion.div
              aria-hidden
              style={{ opacity: backShade }}
              className="pointer-events-none absolute inset-0 bg-[#e4dac5]"
            />
          </motion.div>

          <FoldCrease line={creaseLine} shadow={creaseShadow} />

          {/* LOWER HALF — continuation columns beneath, teaser rising over */}
          <div className="ed-fiber relative min-h-0 flex-1 overflow-hidden bg-[#eee6d6] shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)]">
            <motion.div
              style={{ opacity: columnsOpacity, y: columnsY }}
              className="absolute inset-0"
            >
              <FoldRecapColumns />
            </motion.div>
            <motion.div style={{ y: teaserY, opacity: teaserOpacity }} className="absolute inset-0">
              <FoldTeaser stampProgress={stampIn} />
            </motion.div>
            {/* verso folios — the pages hiding under the fold */}
            <span className={`${T.folio} pointer-events-none absolute bottom-1.5 left-4 z-10`}>
              p.3
            </span>
            <span className={`${T.folio} pointer-events-none absolute bottom-1.5 right-4 z-10`}>
              p.4
            </span>
          </div>
        </div>
      </motion.div>

      <FoldHint progress={progress} />
    </div>
  );
}

/**
 * Reduced-motion variant: the same sheet, laid flat in normal flow. Upper
 * half, crease at rest, continuation columns, then the teaser printed in
 * full — two halves, no pinning, no hinge, nothing jumps. Every child
 * already short-circuits its own entrance animations via useReducedMotion.
 */
function FoldStaticStage() {
  return (
    <div className="mx-auto w-full max-w-[1680px] px-3 py-14 sm:px-6 lg:px-10">
      <div className="ed-fiber relative bg-[#eee6d6]">
        <DoubleRule />
        <FoldSheetUpper className="pb-1" />
      </div>
      <FoldCrease />
      <div className="ed-fiber relative bg-[#eee6d6] shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)]">
        <FoldRecapColumns />
        <Rule className="mx-4 sm:mx-8" />
        <FoldTeaser />
        <span className={`${T.folio} pointer-events-none absolute bottom-1.5 left-4`}>p.3</span>
        <span className={`${T.folio} pointer-events-none absolute bottom-1.5 right-4`}>p.4</span>
      </div>
      <FolioLine page="p.3 — le pli" note="motion réduite — pli présenté à plat" className="mt-5" />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  FOLD · SECTION ROOT
 *  StickyScene-based ⇒ no contentVisibility (sticky needs real layout).
 *  The render callback only forwards the MotionValue to FoldStage — hooks
 *  never run inside it.
 * ════════════════════════════════════════════════════════════════════════════ */

function FoldSection() {
  const reduce = useReducedMotion();
  return (
    <section id="fold" aria-label="Le pli — la suite de l'édition" className="relative">
      {reduce ? (
        <FoldStaticStage />
      ) : (
        <StickyScene pages={2}>{(progress) => <FoldStage progress={progress} />}</StickyScene>
      )}
    </section>
  );
}
