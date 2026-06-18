/* ────────────────────────────────────────────────────────────────────────────
 *  03 · TAPE — LA BOURSE DES CANAUX
 *
 *  The market-quotes band between the front page and the lead story. The
 *  conceit: the four delivery channels of a telecom operator (USSD, app,
 *  web, SMS) are listed equities on a tiny private exchange — the exchange
 *  floor being the reader's own machine. Two counter-scrolling ticker rows
 *  carry the day's quotes (business figures on the upper tape, machine-room
 *  figures on the lower), and beneath them the "cote officielle" is typeset
 *  like the stock listings page of a 1950s broadsheet: agate type, hairline
 *  rules, dotted leaders, right-aligned tabular figures.
 *
 *  Editorial through-line: USSD dipped at 16 h 04 during yesterday's
 *  session. The tape shows it, the listing circles it in the editor's pen,
 *  and a margin note hands the reader to the enquiry on page 3 (#lead).
 *
 *  Motion discipline:
 *  • The looping tapes are pure CSS (`ed-tape` / `ed-tape-reverse` inside an
 *    `ed-tape-hold` wrapper — hover pauses both rows). The animation is
 *    paused via `animation-play-state` whenever the band is off-screen, and
 *    under prefers-reduced-motion the rows render as static, hand-scrollable
 *    strips instead.
 *  • Everything else is the shared vocabulary: CountUpInk for the listed
 *    figures, InkLine sparklines that draw themselves, one PenCircle and one
 *    PenStrike — the red pen is rationed, as the contract demands.
 *
 *  Layout checkpoints: 360 px (3-column listing, sparkline drops below the
 *  figures), 768 px (volume column returns), 1280 px (sparkline takes its
 *  own column), 1536 px (the margin note hangs in the actual margin).
 * ──────────────────────────────────────────────────────────────────────── */

/* ═══ §A — VOCABULARY · direction glyphs of the exchange floor ═══════════ */

type TapeDirection = "up" | "down" | "flat";

/**
 * The three moods of a quote. ▲ prints in stamp green, ▼ in the editor's
 * vermilion (bad news is always the editor's business), = in faded ink —
 * a flat quote is barely worth the lead it's set in.
 */
const TAPE_DIR_META: Record<TapeDirection, { glyph: string; color: string; label: string }> = {
  up: { glyph: "▲", color: STAMP_GREEN, label: "en hausse" },
  down: { glyph: "▼", color: VERMILION, label: "en baisse" },
  flat: { glyph: "=", color: INK_FADED, label: "stable" },
};

type TapeQuoteDatum = {
  /** ticker symbol — French data label, set in agate caps */
  readonly sym: string;
  /** quoted value, units baked in (organic numbers: 41,2 % · 643 DT · 412 ms) */
  readonly val: string;
  /** movement vs the previous session, omitted when the glyph says enough */
  readonly delta?: string;
  readonly dir: TapeDirection;
};

/* ═══ §B — THE TAPES · two rows of quotes, counter-scrolling ═════════════ */

/**
 * Upper tape — LA COTE. Business figures a desk chief reads first:
 * channel shares, success rate, volumes, revenue, the shape of the day.
 */
const TAPE_QUOTES_COTE: ReadonlyArray<TapeQuoteDatum> = [
  { sym: "USSD", val: "41,2 %", delta: "0,8", dir: "up" },
  { sym: "App mobile", val: "27,9 %", delta: "1,2", dir: "up" },
  { sym: "Web", val: "18,4 %", delta: "0,3", dir: "down" },
  { sym: "SMS", val: "12,5 %", dir: "flat" },
  { sym: "Réussite", val: "97,4 %", delta: "0,2", dir: "up" },
  { sym: "Échecs", val: "2,6 %", delta: "0,2", dir: "down" },
  { sym: "Volume", val: "2 147 380", delta: "63 114", dir: "up" },
  { sym: "Panier moyen", val: "643 DT", delta: "4", dir: "up" },
  { sym: "Recette jour", val: "1,38 M DT", delta: "2,1 %", dir: "up" },
  { sym: "MSISDN actifs", val: "412 087", delta: "1 904", dir: "up" },
  { sym: "Heure de pointe", val: "20 h 15", dir: "flat" },
  { sym: "Ticket médian", val: "4,7 DT", dir: "flat" },
  { sym: "Recharges", val: "1 204 511", delta: "2,4 %", dir: "up" },
];

/**
 * Lower tape — LE MOTEUR. The machine-room quotes: what the engine did to
 * earn its column inches. "Paquets sortants 0" is the house's standing
 * boast — the only figure on this exchange guaranteed never to move.
 */
const TAPE_QUOTES_MOTEUR: ReadonlyArray<TapeQuoteDatum> = [
  { sym: "P95 latence", val: "412 ms", delta: "38", dir: "down" },
  { sym: "Lignes/sec", val: "1 204 992", dir: "up" },
  { sym: "Import CSV", val: "9,4 s", delta: "1,1", dir: "down" },
  { sym: "Requêtes DuckDB", val: "184", dir: "flat" },
  { sym: "Anomalies résolues", val: "11/12", delta: "3", dir: "up" },
  { sym: "RAM moteur", val: "612 Mo", delta: "48", dir: "down" },
  { sym: "Prévision J+7", val: "±2,1 %", dir: "flat" },
  { sym: "Exports PDF", val: "14", delta: "6", dir: "up" },
  { sym: "Paquets sortants", val: "0", dir: "flat" },
  { sym: "Modèle local", val: "3,8 Go", dir: "flat" },
  { sym: "Sessions LAN", val: "4", delta: "1", dir: "up" },
  { sym: "Dictées vocales", val: "27", delta: "9", dir: "up" },
  { sym: "Cartes géo", val: "6", delta: "2", dir: "up" },
];

/* ═══ §C — LA COTE OFFICIELLE · the four listed channels ═════════════════ */

type TapeListingDatum = {
  /** floor code, printed vermilion before the canal name — pure affectation */
  readonly code: string;
  readonly canal: string;
  /** lucide glyph, pre-rendered so the datum stays a plain object */
  readonly icon: ReactNode;
  /** part de marché, % — animated by CountUpInk (fr-FR ⇒ comma decimals) */
  readonly part: number;
  /** transactions de la séance — the four volumes reconcile, to the line,
   *  with the masthead's 2 147 380 (someone at the desk checked) */
  readonly volume: number;
  /** mouvement vs veille, pre-formatted */
  readonly delta: string;
  readonly dir: TapeDirection;
  /** volume horaire en milliers de tx, 17 points: 06 h → 22 h */
  readonly serie: ReadonlyArray<number>;
  /** session high / low, set as agate sub-lines under the volume */
  readonly pic: string;
  readonly creux: string;
  /** index of the sparkline point the editor circled (USSD only) */
  readonly markIndex?: number;
  /** circled low figure + the hand-off to page 3 */
  readonly enquete?: { creuxVal: string; heure: string };
};

const TAPE_LISTINGS: ReadonlyArray<TapeListingDatum> = [
  {
    code: "USS",
    canal: "USSD",
    icon: <Hash className="h-3.5 w-3.5" aria-hidden strokeWidth={2.4} />,
    part: 41.2,
    volume: 884_721,
    delta: "0,8",
    dir: "up",
    // the 16 h dip (index 10) is the section's whole story — 71 → 22 → 58
    serie: [38, 41, 52, 61, 66, 64, 59, 63, 68, 71, 22, 58, 66, 72, 75, 69, 54],
    pic: "75 311 tx/h · 20 h",
    creux: "22 408 tx/h · 16 h",
    markIndex: 10,
    enquete: { creuxVal: "22 408", heure: "16 h 04" },
  },
  {
    code: "APM",
    canal: "App mobile",
    icon: <Smartphone className="h-3.5 w-3.5" aria-hidden strokeWidth={2.4} />,
    part: 27.9,
    volume: 599_119,
    delta: "1,2",
    dir: "up",
    // evening-heavy: the app trades best after dinner
    serie: [22, 25, 31, 38, 42, 45, 43, 47, 52, 55, 57, 60, 66, 71, 74, 70, 61],
    pic: "74 022 tx/h · 20 h",
    creux: "21 940 tx/h · 06 h",
  },
  {
    code: "WEB",
    canal: "Web",
    icon: <Globe className="h-3.5 w-3.5" aria-hidden strokeWidth={2.4} />,
    part: 18.4,
    volume: 395_118,
    delta: "0,3",
    dir: "down",
    // office-hours hump, asleep by midnight — a civil servant of a channel
    serie: [9, 14, 26, 38, 47, 52, 55, 53, 49, 44, 38, 30, 26, 22, 19, 15, 11],
    pic: "55 480 tx/h · 12 h",
    creux: "9 214 tx/h · 06 h",
  },
  {
    code: "SMS",
    canal: "SMS",
    icon: <MessageSquare className="h-3.5 w-3.5" aria-hidden strokeWidth={2.4} />,
    part: 12.5,
    volume: 268_422,
    delta: "0,0",
    dir: "flat",
    // barely a pulse; SMS has traded sideways since 2019 and is proud of it
    serie: [18, 19, 21, 22, 23, 22, 22, 23, 24, 23, 22, 23, 24, 25, 24, 22, 20],
    pic: "25 130 tx/h · 19 h",
    creux: "17 902 tx/h · 06 h",
  },
];

/* ═══ §D — SECONDARY VALUES · the agate block + week of sessions ═════════ */

type TapeAgateDatum = {
  readonly sym: string;
  readonly val: string;
  readonly delta?: string;
  readonly dir: TapeDirection;
};

/**
 * Petites valeurs — the dense small-print listings that make a stock page
 * feel inhabited. Every figure is the kind the report actually carries.
 */
const TAPE_AGATE: ReadonlyArray<TapeAgateDatum> = [
  { sym: "Rejets réseau", val: "1,1 %", delta: "0,2", dir: "down" },
  { sym: "Doublons détectés", val: "1 312", delta: "118", dir: "up" },
  { sym: "3ᵉ essai", val: "0,4 %", dir: "flat" },
  { sym: "Transferts P2P", val: "221 904", delta: "0,6 %", dir: "down" },
  { sym: "Factures payées", val: "184 113", delta: "3,1 %", dir: "up" },
  { sym: "Forfaits data", val: "388 270", delta: "1,9 %", dir: "up" },
  { sym: "Roaming", val: "12 406", dir: "flat" },
  { sym: "Ticket min", val: "0,2 DT", dir: "flat" },
  { sym: "Ticket max", val: "1 980 DT", delta: "260", dir: "up" },
  { sym: "Écart-type", val: "18,3 DT", delta: "0,4", dir: "down" },
  { sym: "Kiosques actifs", val: "1 027", delta: "12", dir: "up" },
  { sym: "Codes erreur vus", val: "17", delta: "3", dir: "down" },
];

/** Five sessions of total volume, in thousands — the bar chart beside the
 *  session commentary. Wednesday's bar (the séance under review) is hot. */
const TAPE_WEEK_VOLUMES: ReadonlyArray<number> = [1_982, 1_871, 2_046, 2_084, 2_147];
const TAPE_WEEK_LABELS: ReadonlyArray<string> = ["sam 07", "dim 08", "lun 09", "mar 10", "mer 11"];

/**
 * Market-wide hourly volume, 06 h → 22 h, in thousands of transactions.
 * Each value is the COLUMN SUM of the four listings' series above — the
 * pulse chart and the per-canal sparklines tell one arithmetic truth.
 * Index 10 (16 h) is the hour the bell rang: 193 → 139, fifty-four
 * thousand transactions short of the previous hour.
 */
const TAPE_HOURLY: ReadonlyArray<number> = [
  87, 99, 130, 159, 178, 183, 179, 186, 193, 193, 139, 171, 182, 190, 192, 176, 146,
];

/** Hour labels, every other tick — agate type needs air at 360 px. */
const TAPE_HOURLY_LABELS: ReadonlyArray<string> = [
  "06", "", "08", "", "10", "", "12", "", "14", "", "16", "", "18", "", "20", "", "22",
];

/** Index of the 16 h bar — printed vermilion, ringed by the footnote. */
const TAPE_HOURLY_ALERT_INDEX = 10;

type TapeMoverDatum = {
  readonly name: string;
  readonly delta: string;
  readonly dir: TapeDirection;
};

/**
 * Palmarès de la séance — biggest movers among the sub-services, exactly
 * like the gainers/losers boards on a real listings page. The fall in
 * network rejections sits on the "losers" board on a technicality; nobody
 * at the desk is mourning it.
 */
const TAPE_MOVERS_UP: ReadonlyArray<TapeMoverDatum> = [
  { name: "Factures payées", delta: "3,1 %", dir: "up" },
  { name: "Recharges", delta: "2,4 %", dir: "up" },
  { name: "Forfaits data", delta: "1,9 %", dir: "up" },
  { name: "App mobile", delta: "1,2 %", dir: "up" },
  { name: "USSD", delta: "0,8 %", dir: "up" },
];

const TAPE_MOVERS_DOWN: ReadonlyArray<TapeMoverDatum> = [
  { name: "Roaming entrant", delta: "1,4 %", dir: "down" },
  { name: "Transferts P2P", delta: "0,6 %", dir: "down" },
  { name: "Web", delta: "0,3 %", dir: "down" },
  { name: "Rejets réseau", delta: "0,2 %", dir: "down" },
  { name: "Timeouts", delta: "0,1 %", dir: "down" },
];

type TapeIndexDatum = {
  /** instrument label, set under the dial */
  readonly label: string;
  /** needle position, 0–100 */
  readonly value: number;
  /** printed figure (organic, comma decimals) */
  readonly display: number;
  readonly decimals: number;
  /** one agate line of context under the figure */
  readonly note: string;
};

/**
 * Les trois indices de la place — instrument plates for the numbers the
 * desk glances at before reading anything else. Charge moteur is the only
 * dial that likes being low: 38 % at peak means the machine was reading
 * two million lines with one hand.
 */
const TAPE_INDICES: ReadonlyArray<TapeIndexDatum> = [
  { label: "indice de réussite", value: 97.4, display: 97.4, decimals: 1, note: "transactions abouties, séance entière" },
  { label: "charge moteur", value: 38, display: 38, decimals: 0, note: "pic pendant l'import — 9,4 s à froid" },
  { label: "confiance J+7", value: 94.2, display: 94.2, decimals: 1, note: "prévision tenue sous ±2,1 %" },
];

type TapeFicheDatum = {
  readonly label: string;
  readonly value: string;
};

/**
 * Fiche technique de la cote — how the listings page was actually made.
 * A listings page that shows its method is rarer than it should be.
 */
const TAPE_FICHE: ReadonlyArray<TapeFicheDatum> = [
  { label: "méthode", value: "SQL fenêtré · DuckDB embarqué" },
  { label: "temps de calcul", value: "9,4 s, à froid, fichier complet" },
  { label: "matériel", value: "poste de bureau ordinaire · 16 Go" },
  { label: "périmètre", value: "2 147 380 lignes · 31 colonnes" },
  { label: "révision", value: "seconde passe du moteur · 22 h 00" },
  { label: "diffusion", value: "aucune — la cote reste ici" },
];

/** Shared grid template for the listing table — head and rows must agree.
 *  360 px: canal · part · tendance (volume folds into the canal cell).
 *  640 px: + volume column.  1280 px: + the sparkline takes a column. */
const TAPE_GRID =
  "grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1fr)] items-center gap-x-3 " +
  "sm:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1fr)] " +
  "lg:grid-cols-[minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1.5fr)] lg:gap-x-5";

/* ═══ §E — SMALL PARTS · glyphs, punch holes, quotes, cartouches ═════════ */

/**
 * Direction glyph + delta, in the right ink. The glyph is decorative —
 * a sr-only word carries the direction for screen readers.
 */
function TapeDelta({
  dir,
  delta,
  className,
}: {
  dir: TapeDirection;
  delta?: string;
  className?: string;
}) {
  const meta = TAPE_DIR_META[dir];
  return (
    <span
      className={`inline-flex items-baseline gap-1 font-mono text-[11px] font-bold tabular-nums ${className ?? ""}`}
      style={{ color: meta.color }}
    >
      <span aria-hidden>{meta.glyph}</span>
      {delta && <span>{delta}</span>}
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}

/**
 * Telegraph-tape punch holes — a single repeated radial dot, drawn with a
 * background image so the whole strip costs one DOM node. Pure decoration.
 */
function TapePunchHoles({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-[5px] w-full ${className ?? ""}`}
      style={{
        backgroundImage: "radial-gradient(circle, rgba(28,25,20,0.22) 1.1px, transparent 1.5px)",
        backgroundSize: "14px 5px",
        backgroundPosition: "center",
      }}
    />
  );
}

/** One quote on the tape. The left hairline doubles as the inter-quote rule
 *  and keeps the loop seam invisible (every item carries its own rule). */
function TapeQuoteItem({ quote }: { quote: TapeQuoteDatum }) {
  return (
    <li className="flex items-baseline gap-2 whitespace-nowrap border-l border-[#d6ccb6] px-4 py-2 sm:px-5">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#4a4438]">
        {quote.sym}
      </span>
      <span className="font-mono text-[13px] font-bold tabular-nums text-[#1c1914]">
        {quote.val}
      </span>
      <TapeDelta dir={quote.dir} delta={quote.delta} />
    </li>
  );
}

/** Floor cartouche — the hard-edged label the quotes slide beneath, like a
 *  station ident on a wire-service printer. */
function TapeCartouche({ label }: { label: string }) {
  return (
    <div className="absolute inset-y-0 left-0 z-10 flex items-center border-r-2 border-[#1c1914] bg-[#e4dac5] px-3 sm:px-4">
      <span className="font-grotesk text-[10px] font-black uppercase tracking-[0.24em] text-[#1c1914]">
        {label}
      </span>
    </div>
  );
}

/**
 * One scrolling tape row. The track holds two copies of the quote list and
 * the `ed-tape*` keyframe translates it −50 % — a perfect loop. Rules:
 *  • off-screen ⇒ `animation-play-state: paused` (inline style wins only
 *    when set, so the CSS hover-pause from `ed-tape-hold` keeps working);
 *  • reduced motion ⇒ a static, hand-scrollable strip, one copy only.
 */
function TapeRow({
  quotes,
  cartouche,
  motionClass,
  playing,
  ariaLabel,
}: {
  quotes: ReadonlyArray<TapeQuoteDatum>;
  cartouche: string;
  motionClass: "ed-tape" | "ed-tape-reverse";
  playing: boolean;
  ariaLabel: string;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div className="relative">
        <TapeCartouche label={cartouche} />
        <ul aria-label={ariaLabel} className="flex items-stretch overflow-x-auto pl-24 sm:pl-32">
          {quotes.map((q) => (
            <TapeQuoteItem key={q.sym} quote={q} />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden">
      <TapeCartouche label={cartouche} />
      <div
        className={`flex w-max ${motionClass}`}
        style={{ animationPlayState: playing ? undefined : "paused" }}
      >
        <ul aria-label={ariaLabel} className="flex shrink-0 items-stretch">
          {quotes.map((q) => (
            <TapeQuoteItem key={q.sym} quote={q} />
          ))}
        </ul>
        {/* the loop copy — invisible to the accessibility tree */}
        <ul aria-hidden className="flex shrink-0 items-stretch">
          {quotes.map((q) => (
            <TapeQuoteItem key={q.sym} quote={q} />
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ═══ §F — THE BAND · bourse masthead + the two tapes ════════════════════ */

/** Slim institutional strip above the tapes: who quotes, from what, and the
 *  one bell that rang. Reads like the header of an exchange bulletin. */
function TapeBourseMast() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 bg-[#eee6d6] px-4 py-2.5 sm:px-8">
      <span className="flex items-center gap-2">
        <Landmark className="h-3.5 w-3.5 text-[#1c1914]" aria-hidden strokeWidth={2.2} />
        <span className="font-grotesk text-[11px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
          La bourse des canaux
        </span>
      </span>
      <span className={`hidden items-center gap-2 lg:flex ${T.folio}`}>
        <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
        <span>
          cote établie sur {EDITION.fileName} · {EDITION.rows} lignes · sans quitter la machine
        </span>
      </span>
      <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#bf3415]">
        <Bell className="h-3.5 w-3.5" aria-hidden strokeWidth={2.2} />
        <span>cloche d'alerte · 16 h 04</span>
      </span>
    </div>
  );
}

/**
 * The tape band proper. One ref + useInView gates BOTH rows' play state so
 * the compositor does nothing while the band is off-screen; `ed-tape-hold`
 * on the wrapper lets a hover (or a long press on touch) freeze the quotes
 * long enough to actually read one.
 */
function TapeBand() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  return (
    <div ref={ref} className="ed-tape-hold border-y border-[#1c1914] bg-[#f6f1e7]">
      <TapePunchHoles className="border-b border-[#d6ccb6]" />
      <TapeRow
        quotes={TAPE_QUOTES_COTE}
        cartouche="La cote"
        motionClass="ed-tape"
        playing={inView}
        ariaLabel="cours du jour — indicateurs métier"
      />
      <Rule />
      <TapeRow
        quotes={TAPE_QUOTES_MOTEUR}
        cartouche="Le moteur"
        motionClass="ed-tape-reverse"
        playing={inView}
        ariaLabel="cours du jour — indicateurs du moteur local"
      />
      <TapePunchHoles className="border-t border-[#d6ccb6]" />
    </div>
  );
}

/* ═══ §G — LA COTE OFFICIELLE · the listing table ════════════════════════ */

/** Column heads, stock-listing style: label over unit, numbers flush right.
 *  Hidden columns mirror the row cells exactly — the grid must agree. */
function TapeCoteHead() {
  return (
    <div role="row" className={`${TAPE_GRID} border-b-2 border-[#1c1914] pb-2`}>
      <div role="columnheader" className={T.kicker}>
        Canal
        <span className={`mt-0.5 block normal-case ${T.folio}`}>valeur cotée</span>
      </div>
      <div role="columnheader" className={`${T.kicker} text-right`}>
        Part
        <span className={`mt-0.5 block normal-case ${T.folio}`}>% du total</span>
      </div>
      <div role="columnheader" className={`hidden text-right sm:block ${T.kicker}`}>
        Volume
        <span className={`mt-0.5 block normal-case ${T.folio}`}>transactions</span>
      </div>
      <div role="columnheader" className={`${T.kicker} text-right`}>
        Tendance
        <span className={`mt-0.5 block normal-case ${T.folio}`}>vs veille</span>
      </div>
      <div role="columnheader" aria-hidden className={`hidden lg:block ${T.kicker}`}>
        Séance
        <span className={`mt-0.5 block normal-case ${T.folio}`}>06 h → 22 h</span>
      </div>
    </div>
  );
}

/** 32 px sparkline cell. preserveAspectRatio is off inside InkLine, so the
 *  44-unit viewBox stretches to whatever the column gives it. */
function TapeSparkCell({
  serie,
  markIndex,
  delay,
}: {
  serie: ReadonlyArray<number>;
  markIndex?: number;
  delay: number;
}) {
  return (
    <div className="h-8 w-full" aria-hidden>
      <InkLine data={serie} w={180} h={44} markIndex={markIndex} duration={1 + delay} />
    </div>
  );
}

/**
 * One listed channel. The USSD row is the special case the whole section
 * orbits: its session low is circled in the editor's pen, and a margin
 * note hands the reader to the enquiry on page 3. The note hangs in the
 * physical margin from 1536 px; below that it folds inline under the row
 * (margins are a luxury of wide paper).
 */
function TapeListingRow({ row, index }: { row: TapeListingDatum; index: number }) {
  const delay = index * 0.08;
  return (
    <SettleIn delay={delay} className="relative border-b border-[#d6ccb6]">
      <div role="row" className={`${TAPE_GRID} py-3.5 sm:py-4`}>
        {/* canal — code, glyph, name; volume folds in here below 640 px */}
        <div role="cell" className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[10px] font-bold tracking-[0.08em] text-[#bf3415]">
              {row.code}
            </span>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-[#1c1914] text-[#1c1914]">
              {row.icon}
            </span>
            <span className="truncate font-serif text-[17px] font-semibold text-[#1c1914] sm:text-[18px]">
              {row.canal}
            </span>
          </div>
          <div className={`mt-1 pl-[34px] sm:hidden ${T.folio}`}>
            <CountUpInk end={row.volume} className="text-[#4a4438]" /> tx
          </div>
        </div>

        {/* part de marché — the headline figure, counted up in fr-FR */}
        <div role="cell" className="text-right">
          <CountUpInk
            end={row.part}
            decimals={1}
            suffix=" %"
            duration={1.2}
            className="font-mono text-[15px] font-bold tabular-nums text-[#1c1914] sm:text-[16px]"
          />
        </div>

        {/* volume + session high/low agate sub-lines (sm and up) */}
        <div role="cell" className="hidden text-right sm:block">
          <CountUpInk
            end={row.volume}
            duration={1.4}
            className="font-mono text-[14px] font-semibold tabular-nums text-[#1c1914]"
          />
          <div className={`mt-0.5 hidden md:block ${T.folio}`}>
            pic {row.pic}
            <span className="mx-1 text-[#d6ccb6]">|</span>
            creux {row.creux}
          </div>
        </div>

        {/* tendance — and, for USSD, the circled low the pen flagged */}
        <div role="cell" className="text-right">
          <TapeDelta dir={row.dir} delta={row.delta} className="text-[13px]" />
          {row.enquete && (
            <div className="mt-1.5 whitespace-nowrap font-mono text-[10px] tabular-nums text-[#4a4438]">
              <span className="hidden min-[400px]:inline">creux </span>
              <PenCircle delay={1.3}>
                <span className="px-0.5 font-bold text-[#1c1914]">{row.enquete.creuxVal}</span>
              </PenCircle>
              <span> · {row.enquete.heure}</span>
            </div>
          )}
        </div>

        {/* séance sparkline — own column at lg, full-width strip below it */}
        <div role="cell" className="col-span-full mt-2 lg:col-span-1 lg:mt-0">
          <TapeSparkCell serie={row.serie} markIndex={row.markIndex} delay={delay} />
        </div>
      </div>

      {/* the hand-off to page 3 — pencilled in the margin on wide paper… */}
      {row.enquete && (
        <div className="absolute left-full top-1/2 ml-7 hidden -translate-y-1/2 2xl:block">
          <MarginNote>
            <a
              href="#lead"
              className="underline decoration-[#bf3415]/50 decoration-1 underline-offset-2 hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
            >
              voir l'enquête, p.3 ↓
            </a>
          </MarginNote>
        </div>
      )}
      {/* …and set inline, in the same hand, where the margin is too narrow */}
      {row.enquete && (
        <div className="pb-3 pl-[34px] 2xl:hidden">
          <a
            href="#lead"
            className="font-serif text-[13px] italic text-[#bf3415] underline decoration-[#bf3415]/50 decoration-1 underline-offset-2 hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
          >
            voir l'enquête, p.3 ↓
          </a>
        </div>
      )}
    </SettleIn>
  );
}

/** The table itself: heavy top rule, head, the four listings, a footnote
 *  explaining the sparklines and the one vermilion ring. */
function TapeCoteTable() {
  return (
    <div className="relative">
      <div role="table" aria-label="cote officielle des quatre canaux">
        <div className="h-[2px] w-full bg-[#1c1914]" />
        <div className="pt-2.5">
          <TapeCoteHead />
        </div>
        {TAPE_LISTINGS.map((row, i) => (
          <TapeListingRow key={row.code} row={row} index={i} />
        ))}
      </div>
      <p className={`mt-2.5 ${T.folio}`}>
        courbes : volume horaire en milliers de transactions, 06 h → 22 h · le point vermillon
        marque le creux sous enquête · valeurs en DT
      </p>
    </div>
  );
}

/**
 * Le pouls de la séance — the whole market's hourly volume as one bar
 * strip, the 16 h bar printed in the editor's vermilion. The figures are
 * the column sums of the four sparklines above; a reader with a pencil
 * can check the arithmetic, which is rather the point of this product.
 */
function TapeHourlyPulse() {
  return (
    <SettleIn>
      <div className="border border-[#d6ccb6] bg-[#f6f1e7] px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
          <span className={T.kicker}>le pouls de la séance — volume horaire, tous canaux</span>
          <span className={T.folio}>milliers de transactions · 06 h → 22 h</span>
        </div>
        <div className="mt-4 h-28 sm:h-36">
          <InkBars
            data={TAPE_HOURLY}
            labels={TAPE_HOURLY_LABELS}
            w={680}
            h={150}
            highlight={TAPE_HOURLY_ALERT_INDEX}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1.5">
          <p className="font-mono text-[10px] tabular-nums tracking-[0.04em] text-[#bf3415]">
            16 h — quatre minutes perdues : −54 000 transactions sur l'heure
          </p>
          <p className={T.folio}>retour à la normale 16 h 08 · soirée au-dessus de la moyenne</p>
        </div>
      </div>
    </SettleIn>
  );
}

/* ═══ §H — COMMENTARY · the session, told straight ═══════════════════════ */

/**
 * Floor commentary beside a five-session volume chart. English editorial
 * voice over French figures, as the newsroom contract demands. The chart's
 * hot bar is Wednesday — the séance the rest of the page investigates.
 */
function TapeResume() {
  return (
    <div className="grid items-start gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div>
        <Byline name="Le pupitre des cotations" desk="Salle des marchés · moteur DuckDB local" />
        <SettleIn delay={0.1}>
          <p className={`mt-4 ${T.body}`}>
            A quiet session on the floor, all told. Four channels opened at 06 h 00 and traded{" "}
            <span className={`${T.num} font-semibold`}>2 147 380</span> lines without drama —
            until <PenUnderline delay={0.6}>16 h 04</PenUnderline>, when USSD slipped off the
            board for four minutes and the engine rang the bell before anyone at the desk had
            looked up from their coffee. Volume recovered by 16 h 08; confidence took until the
            evening peak. The matter now belongs to the enquiry desk.
          </p>
        </SettleIn>
        <SettleIn delay={0.18}>
          <p className={`mt-4 ${T.body}`}>
            Elsewhere the book was orderly: the app gained ground after dinner, as it does; the
            web kept office hours, as it does; SMS traded sideways with the serenity of a channel
            that has nothing left to prove. Success closed at{" "}
            <span className={`${T.num} font-semibold`}>97,4 %</span> — two tenths better than
            Tuesday, and Tuesday was no embarrassment.
          </p>
        </SettleIn>
        <div className="mt-5">
          <InkLink href="#lead">Read the enquiry — page 3 →</InkLink>
        </div>
      </div>

      {/* five sessions of volume — the week, in ink bars */}
      <SettleIn delay={0.2} className="border border-[#d6ccb6] bg-[#eee6d6] p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className={T.kicker}>volume — 5 séances</span>
          <span className={T.folio}>milliers de tx</span>
        </div>
        <div className="mt-3 h-32">
          <InkBars data={TAPE_WEEK_VOLUMES} labels={TAPE_WEEK_LABELS} w={300} h={130} highlight={4} />
        </div>
        <div className={`mt-2 flex items-baseline justify-between ${T.folio}`}>
          <span>mer 11 : 2 147 — plus forte séance du mois</span>
          <TapeDelta dir="up" delta="3,0 %" />
        </div>
      </SettleIn>
    </div>
  );
}

/* ═══ §H′ — PALMARÈS & INDICES · movers board and instrument plates ══════ */

/** One movers column: rank, name, dotted leader, delta. The rank numerals
 *  are old-style listing affectation — vermilion, small, indispensable. */
function TapeMoversColumn({
  title,
  movers,
}: {
  title: string;
  movers: ReadonlyArray<TapeMoverDatum>;
}) {
  return (
    <div className="min-w-0">
      <div className="border-b-2 border-[#1c1914] pb-1.5">
        <span className={T.kicker}>{title}</span>
      </div>
      <ol className="mt-2.5 space-y-2">
        {movers.map((m, i) => (
          <li key={m.name} className="flex items-baseline gap-2">
            <span className="w-4 shrink-0 font-mono text-[10px] font-bold text-[#bf3415]">
              {i + 1}.
            </span>
            <span className="shrink-0 font-grotesk text-[13px] font-semibold text-[#1c1914]">
              {m.name}
            </span>
            <span aria-hidden className="min-w-3 flex-1 border-b border-dotted border-[#857c69]/60" />
            <TapeDelta dir={m.dir} delta={m.delta} className="shrink-0 text-[12px]" />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Gainers and losers, two columns side by side from 480 px. One footnote
 *  of dry wit — newspapers are allowed exactly one per board. */
function TapePalmares() {
  return (
    <SettleIn className="min-w-0">
      <div className="flex items-center gap-4">
        <span className={`shrink-0 ${T.kicker}`}>palmarès de la séance</span>
        <Rule className="flex-1" />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-x-10 gap-y-6 min-[480px]:grid-cols-2">
        <TapeMoversColumn title="en hausse" movers={TAPE_MOVERS_UP} />
        <TapeMoversColumn title="en repli" movers={TAPE_MOVERS_DOWN} />
      </div>
      <p className={`mt-3 ${T.folio}`}>
        nb — les rejets réseau figurent « en repli » par convention typographique ; personne ne
        s'en plaint
      </p>
    </SettleIn>
  );
}

/** One instrument plate: dial, counted figure, agate context line. */
function TapeIndexPlate({ idx, delay }: { idx: TapeIndexDatum; delay: number }) {
  return (
    <SettleIn delay={delay} className="min-w-0 border border-[#d6ccb6] bg-[#eee6d6] px-3 py-3.5 text-center sm:px-4">
      <InkGauge value={idx.value} w={150} className="mx-auto w-full max-w-[150px]" />
      <div className="mt-2">
        <CountUpInk
          end={idx.display}
          decimals={idx.decimals}
          suffix=" %"
          duration={1.3}
          className="font-mono text-[17px] font-bold tabular-nums text-[#1c1914]"
        />
      </div>
      <div className={`mt-1 ${T.kicker} text-[10px] tracking-[0.18em]`}>{idx.label}</div>
      <p className={`mt-1.5 ${T.folio} normal-case tracking-normal`}>{idx.note}</p>
    </SettleIn>
  );
}

/** The three dials of the trading floor, drawn like pressure gauges on a
 *  press-room wall. Needles swing in once, on view, then hold. */
function TapeIndices() {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-4">
        <span className={`shrink-0 ${T.kicker}`}>les indices de la place</span>
        <Rule className="flex-1" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2.5 sm:gap-4">
        {TAPE_INDICES.map((idx, i) => (
          <TapeIndexPlate key={idx.label} idx={idx} delay={i * 0.1} />
        ))}
      </div>
    </div>
  );
}

/* ═══ §I — AGATE · petites valeurs, dotted leaders, dense and proud ══════ */

/** One agate listing: symbol … dotted leader … value, delta. The leader is
 *  a flexed dotted border — the oldest trick in newspaper composition. */
function TapeAgateItem({ item }: { item: TapeAgateDatum }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#4a4438]">
        {item.sym}
      </span>
      <span aria-hidden className="min-w-3 flex-1 border-b border-dotted border-[#857c69]/60" />
      <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-[#1c1914]">
        {item.val}
      </span>
      <TapeDelta dir={item.dir} delta={item.delta} className="shrink-0 text-[10px]" />
    </li>
  );
}

function TapeAgateBlock() {
  return (
    <SettleIn>
      <div className="flex items-center gap-4">
        <span className={`shrink-0 ${T.kicker}`}>petites valeurs — cote agate</span>
        <Rule className="flex-1" />
      </div>
      <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2.5 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {TAPE_AGATE.map((item) => (
          <TapeAgateItem key={item.sym} item={item} />
        ))}
      </ul>
    </SettleIn>
  );
}

/* ═══ §J — HOUSE NOTICES · the correction and the small print ════════════ */

/**
 * Rectificatif — yesterday's SMS share, struck through in the proofing pen.
 * A newspaper that corrects itself in public is a newspaper you can trust;
 * an engine that re-checks its own figures, likewise.
 */
function TapeRectificatif() {
  return (
    <SettleIn className="border-l-2 border-[#bf3415] pl-4 sm:pl-5">
      <p className={`${T.ui} max-w-2xl text-[14px]`}>
        <span className="font-bold uppercase tracking-[0.08em] text-[#bf3415]">
          Rectificatif —{" "}
        </span>
        in Wednesday's edition the SMS share was set at{" "}
        <PenStrike delay={0.5}>
          <span className={`${T.num} px-0.5`}>12,7 %</span>
        </PenStrike>{" "}
        ; after the engine's second pass, read <span className={`${T.num} font-semibold`}>12,5 %</span>.
        The compositor regrets nothing: the data changed, the type followed.
      </p>
    </SettleIn>
  );
}

/** The small-print folio: the only disclaimer on this exchange, and the only
 *  promise that matters. Stamped, padlocked, and entirely sincere. */
function TapeDisclaimer() {
  return (
    <SettleIn className="border border-[#1c1914] bg-[#eee6d6] px-4 py-4 shadow-[4px_4px_0_#1c1914] sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="flex min-w-0 max-w-2xl items-start gap-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#1c1914]" aria-hidden strokeWidth={2.2} />
          <div>
            <p className="font-mono text-[11px] font-semibold leading-relaxed text-[#1c1914]">
              Cours illustratifs — vos chiffres réels ne quittent jamais la salle des marchés.
            </p>
            <p className={`mt-1.5 ${T.folio} normal-case tracking-normal`}>
              No quote on this page has ever touched a network. The exchange floor is your own
              machine; trading hours are whenever you open the app. Aucune télémétrie, aucun
              cloud, aucune agence extérieure — le moteur lit votre CSV sur place.
            </p>
          </div>
        </div>
        <Stamp color={STAMP_GREEN} tilt={-5} className="shrink-0">
          hors réseau
        </Stamp>
      </div>
    </SettleIn>
  );
}

/* ═══ §K — THE SECTION · band, listings, notices, folio ══════════════════ */

/**
 * TapeSection — page 2 of the Daily Edition. Reading order:
 *   DoubleRule → bourse masthead → two counter-scrolling tapes → DoubleRule
 *   → cote officielle (mast, headline, table) → session commentary + week
 *   chart → agate block → rectificatif → small-print disclaimer → folio.
 * Static section (no sticky scene), so contentVisibility can skip painting
 * it off-screen; 1640 px approximates the settled desktop height.
 */
function TapeSection() {
  return (
    <section
      id="tape"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 1640px" }}
    >
      {/* ── the bourse band, full bleed, double-ruled top and bottom ── */}
      <DoubleRule />
      <TapeBourseMast />
      <TapeBand />
      <DoubleRule />

      {/* ── the listings page beneath the tape ── */}
      <div className="mx-auto max-w-6xl px-5 pb-14 pt-12 sm:px-8 sm:pt-14">
        <SectionMast rubrique="Cote officielle" no="№ 03" />

        <div className="mt-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-4 sm:mt-10">
          <RiseIn className="max-w-3xl">
            <h2 className="font-serif text-[clamp(1.75rem,3.4vw,2.7rem)] font-semibold leading-[1.04] tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              Four channels make a market — one of them misbehaved.
            </h2>
          </RiseIn>
          <p className={`${T.folio} shrink-0`}>
            séance du 11 juin · cote arrêtée à 22 h 00 · alerte 16 h 04
          </p>
        </div>

        <div className="mt-8 sm:mt-10">
          <TapeCoteTable />
        </div>

        <div className="mt-12 sm:mt-14">
          <TapeResume />
        </div>

        <div className="mt-12 sm:mt-14">
          <TapeAgateBlock />
        </div>

        <div className="mt-10 sm:mt-12">
          <TapeRectificatif />
        </div>

        <div className="mt-10 sm:mt-12">
          <TapeDisclaimer />
        </div>

        <Rule className="mt-12" />
        <FolioLine
          className="mt-3"
          page="Page 2 — la cote"
          note="cote arrêtée à 22 h 00 · séance du 11 juin 2026"
        />
      </div>
    </section>
  );
}
