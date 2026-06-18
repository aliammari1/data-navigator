/* ════════════════════════════════════════════════════════════════════════════
 *  §08 — THE DATA DESK · "Le pupitre des données" (p.6)
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The sports page of The Daily Edition. The DuckDB engine is covered the way
 *  a provincial paper covers an athletics meeting: a giant scoreline, a
 *  box-score table set like league standings, a play-by-play column
 *  transcribed from the engine's own log, the week's results in agate type,
 *  and an equipment list declared to the stewards.
 *
 *  Design intent
 *  ─────────────
 *  • The number IS the headline. "0,18 s" runs at clamp(...,8rem), counted up
 *    in fr-FR figures and circled by the editor's vermilion pen — the one
 *    moment of red ink in the lead.
 *  • The box score reads like standings: hairline rules, mono numerals,
 *    a pace bar per row (time relative to the slowest event), and the record
 *    row stamped RECORD in steward's green. Rows expand — a real <button>
 *    with aria-expanded — to reveal the SQL actually run and a steward note.
 *  • The play-by-play column carries a vertical ink rail whose vermilion fill
 *    tracks scroll (scaleY on a drift progress — pure transform). Each step's
 *    dot inks itself in as the fill passes it.
 *  • Band two sits on deeper paper: the Fig. 2 throughput plate (halftone
 *    InkArea) parallaxes gently; the kit table draws its own tiny glyphs.
 *  • Everything is wall-clock honesty: worst of two passes, witnessed,
 *    machine described in the bench conditions. Auditable speed is the story.
 * ════════════════════════════════════════════════════════════════════════════ */

/** All lucide glyphs share a signature; one alias keeps the data tables tidy. */
type DeskIcon = typeof Timer;

/* ────────────────────────────────────────────────────────────────────────────
 *  DATA · the morning card — six events, one stopwatch
 *  Times are wall-clock, worst of two passes, on the bench machine described
 *  in DESK_BENCH below. Sorted like standings: fastest first.
 * ──────────────────────────────────────────────────────────────────────────── */

type DeskScoreRowData = {
  /** lane number, printed as a dossard */
  pos: string;
  /** the event, as announced */
  event: string;
  icon: DeskIcon;
  /** the exact line run on the bench — revealed on expand */
  sql: string;
  /** rows touched by the event, fr-formatted */
  lignes: string;
  /** official wall-clock result */
  temps: string;
  /** milliseconds, for the pace bar (relative to the slowest event) */
  tempsMs: number;
  /** the engine's declared method, checked against the execution plan */
  methode: string;
  /** steward's note — dry, factual, revealed on expand */
  note: string;
  record?: boolean;
};

const DESK_SCORE_ROWS: ReadonlyArray<DeskScoreRowData> = [
  {
    pos: "01",
    event: "Agrégat par canal",
    icon: Sigma,
    sql: "SELECT canal, count(*) AS n, sum(montant) AS total FROM tx GROUP BY canal;",
    lignes: "2 147 380",
    temps: "0,18 s",
    tempsMs: 178,
    methode: "hash agrégé · 8 fils",
    note:
      "Le record du matin. Vérifié deux fois par le chronométreur ; la seconde passe a rendu " +
      "0,179 s — on imprime le pire des deux, par principe de rédaction.",
    record: true,
  },
  {
    pos: "02",
    event: "Percentile p95",
    icon: Percent,
    sql: "SELECT canal, quantile_cont(duree_ms, 0.95) AS p95 FROM tx GROUP BY canal;",
    lignes: "2 147 380",
    temps: "0,31 s",
    tempsMs: 312,
    methode: "tri partiel vectorisé",
    note:
      "Un p95 demande un tri ; le moteur n'en trie qu'un morceau. Le commissaire a inspecté " +
      "la copie au plan d'exécution : rien à signaler.",
  },
  {
    pos: "03",
    event: "Scan complet",
    icon: ScanLine,
    sql: "SELECT min(horodatage), max(horodatage), count(*) FROM tx;",
    lignes: "2 147 380",
    temps: "0,42 s",
    tempsMs: 419,
    methode: "scan vectorisé · zéro index",
    note:
      "Toute la table, sans index, sans excuse. 2 048 valeurs par foulée, huit couloirs, " +
      "et pas une ligne sautée — le greffe a recompté.",
  },
  {
    pos: "04",
    event: "Jointure statuts",
    icon: GitMerge,
    sql: "SELECT s.libelle, count(*) FROM tx t JOIN statuts s USING (code_statut) GROUP BY s.libelle;",
    lignes: "2 147 380 + 42",
    temps: "0,57 s",
    tempsMs: 566,
    methode: "hash join · table compacte",
    note:
      "La table des statuts compte 42 lignes ; elle tient dans une poche de cache. " +
      "Le hash join ne transpire pas, et le commissaire non plus.",
  },
  {
    pos: "05",
    event: "Fenêtre 7 j",
    icon: CalendarRange,
    sql: "SELECT jour, sum(montant) OVER (ORDER BY jour ROWS 6 PRECEDING) FROM tx_jour;",
    lignes: "14 891 224",
    temps: "0,73 s",
    tempsMs: 731,
    methode: "fenêtre glissante",
    note:
      "Sept jours d'historique pris dans une seule fenêtre glissante ; le moteur lit la " +
      "semaine comme une ligne droite. L'épreuve d'endurance du programme.",
  },
  {
    pos: "06",
    event: "Export Excel",
    icon: FileSpreadsheet,
    sql: "COPY (SELECT * FROM rapport_final) TO 'rapport.xlsx' (FORMAT xlsx);",
    lignes: "11 248",
    temps: "1,84 s",
    tempsMs: 1842,
    methode: "copie Arrow → feuille",
    note:
      "L'épreuve la plus lente — il faut bien écrire le fichier. Excel n'a jamais couru " +
      "aussi bien accompagné ; la feuille sort signée et datée.",
  },
];

/** Slowest event on the card — the pace bars are scaled against it. */
const DESK_MAX_MS = 1842;

/* ────────────────────────────────────────────────────────────────────────────
 *  DATA · play-by-play — the life of the record query, from the engine's log
 *  Durations sum to 178 ms: parse 2 + plan 1 + scan 161 + agrégation 14.
 * ──────────────────────────────────────────────────────────────────────────── */

type DeskPlayStepData = {
  /** elapsed chrono, mono — the broadcast clock */
  clock: string;
  /** wall time on the bench, for the sticklers */
  wall: string;
  phase: string;
  dur: string;
  /** serif narration — the commentator at the rail */
  text: string;
};

const DESK_PLAY_STEPS: ReadonlyArray<DeskPlayStepData> = [
  {
    clock: "T+0 ms",
    wall: "16:04:07,000",
    phase: "Coup d'envoi — parse",
    dur: "2 ms",
    text:
      "The query files its paperwork at the front desk. Two milliseconds to read the SQL and " +
      "stand the syntax tree at attention — GROUP BY canal, nothing exotic declared.",
  },
  {
    clock: "T+2 ms",
    wall: "16:04:07,002",
    phase: "Tactique — plan",
    dur: "1 ms",
    text:
      "The optimiser reads the field and calls a hash aggregate: six groups expected, no joins, " +
      "no detours. One millisecond to pick the play. It will not be reviewed.",
  },
  {
    clock: "T+3 ms",
    wall: "16:04:07,003",
    phase: "L'épreuve — scan vectorisé",
    dur: "161 ms",
    text:
      "The main event. Eight threads take the column in strides of 2 048 values and " +
      "2 147 380 rows go by without a single index being consulted. The crowd holds its coffee.",
  },
  {
    clock: "T+164 ms",
    wall: "16:04:07,164",
    phase: "Dernière ligne — agrégation",
    dur: "14 ms",
    text:
      "Hash tables merge at the finish line — fourteen milliseconds to settle six channels' " +
      "worth of sums, counts and averages into one small, certain table.",
  },
  {
    clock: "T+178 ms",
    wall: "16:04:07,178",
    phase: "Résultat",
    dur: "—",
    text:
      "Full time. Six rows on the board, 0,178 s on the clock — rounded up to 0,18 against us. " +
      "The analyst sips. The engine, characteristically, says nothing.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 *  DATA · l'équipement — the kit, as declared to the stewards
 * ──────────────────────────────────────────────────────────────────────────── */

type DeskKitGlyphKind = "columns" | "ledger" | "vectors" | "arrow";

type DeskKitItem = {
  /** squad number, printed agate-style */
  dossard: string;
  nom: string;
  /** the speciality, mono — what the piece actually does */
  specialite: string;
  /** the position on the team sheet, sports-page voice */
  poste: string;
  glyph: DeskKitGlyphKind;
  /** one serif line for the programme notes */
  detail: string;
};

const DESK_KIT: ReadonlyArray<DeskKitItem> = [
  {
    dossard: "01",
    nom: "DuckDB",
    specialite: "colonne, vectorisé",
    poste: "titulaire — moteur d'analyse",
    glyph: "columns",
    detail:
      "Runs every event on this page. Embedded in the app's own process — no server was hired, " +
      "consulted, or even told about the meeting.",
  },
  {
    dossard: "02",
    nom: "SQLite",
    specialite: "métadonnées",
    poste: "greffier — registres du club",
    glyph: "ledger",
    detail:
      "Keeps the books: archived reports, signatures, preferences, who-changed-what. " +
      "Reliable the way a registry office is reliable.",
  },
  {
    dossard: "03",
    nom: "LanceDB",
    specialite: "vecteurs",
    poste: "ailier sémantique",
    glyph: "vectors",
    detail:
      "Files the on-board AI's embeddings and finds one sentence among thousands — " +
      "without a network and without an apology.",
  },
  {
    dossard: "04",
    nom: "Arrow",
    specialite: "zéro-copie",
    poste: "passeur — mémoire partagée",
    glyph: "arrow",
    detail:
      "Moves the columns between engine, charts and export without ever touching the ball. " +
      "The assist statistic of the whole operation.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 *  DATA · figures and agate matter
 * ──────────────────────────────────────────────────────────────────────────── */

/** Fig. 2 — read throughput across twelve consecutive passes, M lignes/s.
 *  The dip at passe 8 is real and the caption owns up to it. */
const DESK_THROUGHPUT: ReadonlyArray<number> = [
  3.8, 6.4, 8.9, 10.6, 11.8, 12.7, 13.2, 11.9, 13.8, 14.0, 13.6, 14.2,
];

const DESK_THROUGHPUT_TICKS = ["passe 1", "passe 4", "passe 8", "passe 12"] as const;

type DeskSeasonRow = {
  jour: string;
  lignes: string;
  temps: string;
  /** numeric seconds, feeds the Fig. 3 sparkline */
  spark: number;
  note?: string;
  record?: boolean;
};

/** The week's results — same event, eight mornings, same machine. */
const DESK_SEASON: ReadonlyArray<DeskSeasonRow> = [
  { jour: "jeu 04", lignes: "2 081 112", temps: "0,21 s", spark: 0.21, note: "premier chrono" },
  { jour: "ven 05", lignes: "2 094 561", temps: "0,20 s", spark: 0.2 },
  { jour: "sam 06", lignes: "1 412 008", temps: "0,14 s", spark: 0.14, note: "samedi creux" },
  { jour: "dim 07", lignes: "1 287 441", temps: "0,13 s", spark: 0.13 },
  { jour: "lun 08", lignes: "2 156 902", temps: "0,21 s", spark: 0.21, note: "retour du volume" },
  { jour: "mar 09", lignes: "2 188 437", temps: "0,20 s", spark: 0.2 },
  { jour: "mer 10", lignes: "2 132 859", temps: "0,19 s", spark: 0.19 },
  {
    jour: "jeu 11",
    lignes: "2 147 380",
    temps: "0,18 s",
    spark: 0.18,
    note: "record à volume plein",
    record: true,
  },
];

const DESK_SEASON_SPARK: ReadonlyArray<number> = DESK_SEASON.map((d) => d.spark);

type DeskBenchItem = { icon: DeskIcon; label: string; detail: string };

/** Conditions du banc — homologated. The machine is the point: it is ordinary. */
const DESK_BENCH: ReadonlyArray<DeskBenchItem> = [
  {
    icon: Cpu,
    label: "8 cœurs",
    detail: "un portable de bureau de série, trois ans d'âge, rien d'exotique",
  },
  {
    icon: MemoryStick,
    label: "16 Go",
    detail: "dont quatre réservés au moteur, le reste à l'édition du matin",
  },
  {
    icon: HardDrive,
    label: "SSD NVMe",
    detail: "le fichier est lu sur place — jamais déplacé, jamais téléversé",
  },
  {
    icon: WifiOff,
    label: "réseau coupé",
    detail: "le banc tourne câble débranché, par principe et par contrat",
  },
];

type DeskStatItem = { end: number; unit?: string; label: string; note: string };

/** The three numbers the desk keeps repeating at dinner parties. */
const DESK_STATS: ReadonlyArray<DeskStatItem> = [
  { end: 2048, label: "valeurs par vecteur", note: "la foulée standard du moteur" },
  { end: 8, label: "fils en course", note: "un par cœur — pas un de plus" },
  { end: 0, label: "copie mémoire", note: "Arrow passe la colonne sans la toucher" },
];

/* ────────────────────────────────────────────────────────────────────────────
 *  GLYPHS · tiny self-drawing ink marks for the kit table
 *  Each is a 28×28 plate drawn with InkPath so the kit inks itself in on
 *  scroll — the same pen that circles the scoreline, at jeweller's scale.
 * ──────────────────────────────────────────────────────────────────────────── */

/** DuckDB — four columns of unequal height on a baseline: columnar storage. */
function DeskGlyphColumns({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <InkPath d="M3 24.5 H25" strokeWidth={1.6} duration={0.4} />
      <InkPath d="M6.5 24 V11" strokeWidth={2.4} delay={0.15} duration={0.35} />
      <InkPath d="M12 24 V5.5" strokeWidth={2.4} delay={0.25} duration={0.35} />
      <InkPath d="M17.5 24 V14" strokeWidth={2.4} delay={0.35} duration={0.35} />
      <InkPath d="M23 24 V8.5" strokeWidth={2.4} delay={0.45} duration={0.35} />
    </svg>
  );
}

/** SQLite — the greffier's ledger: a bound book with ruled entries. */
function DeskGlyphLedger({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <InkPath d="M8 4.5 H21.5 V23.5 H8" strokeWidth={1.8} duration={0.5} />
      <InkPath d="M8 4.5 C 5.8 6, 5.8 22, 8 23.5" strokeWidth={1.8} delay={0.2} duration={0.4} />
      <InkPath d="M11.5 10 H18.5" strokeWidth={1.5} delay={0.45} duration={0.25} />
      <InkPath d="M11.5 14 H18.5" strokeWidth={1.5} delay={0.55} duration={0.25} />
      <InkPath d="M11.5 18 H15.5" strokeWidth={1.5} delay={0.65} duration={0.25} />
    </svg>
  );
}

/** LanceDB — three vectors fanning from one origin, heads inked last. */
function DeskGlyphVectors({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <InkPath d="M5 23 L19 7 M19 7 l-5.2 0.8 M19 7 l-0.8 5.2" strokeWidth={1.7} duration={0.5} />
      <InkPath
        d="M5 23 L23 14.5 M23 14.5 l-5 -1 M23 14.5 l-2.6 4.4"
        strokeWidth={1.7}
        delay={0.25}
        duration={0.5}
      />
      <InkPath
        d="M5 23 L24 21.5 M24 21.5 l-4.4 -2.6 M24 21.5 l-3.8 3"
        strokeWidth={1.7}
        delay={0.5}
        duration={0.5}
      />
    </svg>
  );
}

/** Arrow — one pass straight through two memory frames; nothing is copied. */
function DeskGlyphArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden>
      <InkPath d="M9 7.5 H4.5 V20.5 H9" strokeWidth={1.7} duration={0.4} />
      <InkPath d="M19 7.5 H23.5 V20.5 H19" strokeWidth={1.7} delay={0.15} duration={0.4} />
      <InkPath
        d="M2.5 14 H25 M25 14 l-5 -3.6 M25 14 l-5 3.6"
        strokeWidth={1.8}
        delay={0.4}
        duration={0.55}
      />
    </svg>
  );
}

/** Routes a kit row to its glyph — keeps the data table free of JSX. */
function DeskKitGlyph({ kind, className }: { kind: DeskKitGlyphKind; className?: string }) {
  if (kind === "columns") return <DeskGlyphColumns className={className} />;
  if (kind === "ledger") return <DeskGlyphLedger className={className} />;
  if (kind === "vectors") return <DeskGlyphVectors className={className} />;
  return <DeskGlyphArrow className={className} />;
}

/* ────────────────────────────────────────────────────────────────────────────
 *  SCORE BUG · the final-result strip under the mast — TV ticker, set in ink
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskScoreBug() {
  return (
    <SettleIn className="mt-8">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y-2 border-[#1c1914] px-1 py-2.5">
        <span className="flex items-center gap-2 font-grotesk text-[11px] font-black uppercase tracking-[0.18em] text-[#1c1914]">
          <Trophy aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={2.2} />
          Résultat final
        </span>
        <span className={`${T.num} text-[12px] font-bold text-[#1c1914]`}>
          MOTEUR COLONNE 6 — FICHIER PLAT 0
        </span>
        <span aria-hidden className="hidden h-1 w-1 bg-[#bf3415] sm:block" />
        <span className={`${T.folio} normal-case`}>six épreuves, six victoires</span>
        <span aria-hidden className="hidden h-1 w-1 bg-[#bf3415] md:block" />
        <span className={`${T.folio} hidden normal-case md:block`}>
          2 147 380 lignes jouées · arbitre : le chronomètre
        </span>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  MATCHUP CARD · "L'affiche du jour" — the fixture box beside the scoreline
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskMatchupCard() {
  return (
    <SettleIn delay={0.15}>
      <div className="border-2 border-[#1c1914] bg-[#f6f1e7] p-5 shadow-[4px_4px_0_#1c1914]">
        <p className={`${T.kicker} text-[#bf3415]`}>L'affiche du jour</p>
        <div className="mt-3 flex items-baseline justify-between gap-3">
          <span className="font-serif text-[1.3rem] font-bold leading-none text-[#1c1914]">
            Moteur colonne
          </span>
          <span className={`${T.folio} shrink-0`}>contre</span>
          <span className="text-right font-serif text-[1.3rem] font-bold leading-none text-[#1c1914]">
            Fichier plat
          </span>
        </div>
        <Rule className="my-3.5" />
        <dl className="space-y-1.5">
          <div className="flex justify-between gap-3">
            <dt className={T.folio}>terrain</dt>
            <dd className={`${T.num} text-[11px] text-[#1c1914]`}>{EDITION.fileName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className={T.folio}>effectif</dt>
            <dd className={`${T.num} text-[11px] text-[#1c1914]`}>2 147 380 lignes · 14 colonnes</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className={T.folio}>coup d'envoi</dt>
            <dd className={`${T.num} text-[11px] text-[#1c1914]`}>16 h 04 — heure du pupitre</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className={T.folio}>affluence</dt>
            <dd className={`${T.num} text-[11px] text-[#1c1914]`}>guichets fermés (un analyste)</dd>
          </div>
        </dl>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  SCORELINE · the lead — 0,18 s in eight-rem serif, circled in red pen
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskScoreline() {
  return (
    <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(260px,330px)]">
      <div>
        <SettleIn>
          <p className="flex flex-wrap items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4a4438]">
            <Timer aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={2.2} />
            Temps de réponse — 2,1 M de lignes, GROUP BY canal
          </p>
        </SettleIn>
        {/* The scoreline itself. The count-up runs in fr-FR so the decimal
            arrives as a comma; the pen circles it once the figure has landed. */}
        <RiseIn className="mt-2" amount={0.6}>
          <span className="block font-serif text-[clamp(4.2rem,11vw,8rem)] font-bold leading-[0.95] tracking-[-0.02em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
            <PenCircle delay={1.5}>
              <CountUpInk end={0.18} decimals={2} suffix=" s" duration={1.4} />
            </PenCircle>
          </span>
        </RiseIn>
        <SettleIn delay={0.3} className="mt-4 max-w-[52ch]">
          <p className="font-serif text-[15px] italic leading-relaxed text-[#4a4438]">
            — officiel, pire de deux passes. La moyenne fait 0,17 s, mais le pupitre n'imprime pas
            les moyennes : il imprime ce qu'il peut prouver.
          </p>
        </SettleIn>
      </div>
      <DeskMatchupCard />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  BOX SCORE · league standings for six queries
 * ──────────────────────────────────────────────────────────────────────────── */

/** Shared column template — header and rows must agree to the rem. */
const DESK_GRID_COLS =
  "md:grid-cols-[2.5rem_minmax(0,1fr)_7.25rem_5.5rem_11.5rem_2.25rem]";

/** Pace bar — the event's time against the slowest on the card. Width is set
 *  statically (% of track); only scaleX animates, from the start line out. */
function DeskPaceBar({ pct, record }: { pct: number; record?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span aria-hidden className="mt-1.5 block h-[3px] w-full max-w-[190px] bg-[#1c1914]/10">
      <motion.span
        className={`block h-full origin-left ${record ? "bg-[#2f6b3f]" : "bg-[#1c1914]/60"}`}
        style={{ width: `${pct}%` }}
        initial={reduce ? false : { scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.7, ease: EASE_INK }}
      />
    </span>
  );
}

/** One standings row (md and up). A real button toggles the steward's note —
 *  the reveal animates opacity/translate only; layout snaps, as print does. */
function DeskScoreRow({ row, index }: { row: DeskScoreRowData; index: number }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const panelId = useId();
  const Icon = row.icon;
  const pct = Math.round((row.tempsMs / DESK_MAX_MS) * 100);
  return (
    <SettleIn delay={index * 0.05} y={12} className="border-t border-[#d6ccb6]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`grid w-full grid-cols-[2.5rem_minmax(0,1fr)_2.25rem] items-center gap-x-3 px-1 py-3.5 text-left transition-colors hover:bg-[#1c1914]/[0.035] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#bf3415] ${DESK_GRID_COLS}`}
      >
        <span className={`${T.num} text-[12px] text-[#857c69]`}>{row.pos}</span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#4a4438]" strokeWidth={2} />
            <span className="font-serif text-[17px] font-semibold leading-tight text-[#1c1914]">
              {row.event}
            </span>
            {row.record && (
              <Stamp color={STAMP_GREEN} tilt={-6} className="text-[9px]">
                Record
              </Stamp>
            )}
          </span>
          <DeskPaceBar pct={pct} record={row.record} />
          {/* On small-mid widths the hidden columns fold into a meta line. */}
          <span className={`${T.folio} mt-1.5 block normal-case md:hidden`}>
            {row.lignes} lignes · {row.methode}
          </span>
        </span>
        <span className={`${T.num} hidden text-right text-[13px] text-[#4a4438] md:block`}>
          {row.lignes}
        </span>
        <span
          className={`${T.num} text-right text-[15px] font-bold ${
            row.record ? "text-[#2f6b3f]" : "text-[#1c1914]"
          }`}
        >
          {row.temps}
        </span>
        <span className="hidden font-grotesk text-[12px] leading-snug text-[#4a4438] md:block">
          {row.methode}
        </span>
        <motion.span
          aria-hidden
          className="justify-self-end text-[#857c69]"
          animate={{ rotate: open ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.3, ease: EASE_INK }}
        >
          <ChevronDown className="h-4 w-4" strokeWidth={2} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: EASE_INK }}
            className="px-1 pb-4 md:pl-[2.5rem]"
          >
            <code
              className={`${T.num} block overflow-x-auto border-l-2 border-[#bf3415] bg-[#eee6d6] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-[#1c1914]`}
            >
              {row.sql}
            </code>
            <p className="mt-2.5 max-w-[64ch] font-serif text-[14px] italic leading-relaxed text-[#4a4438]">
              <span className={`${T.kicker} mr-2 not-italic text-[#bf3415]`}>
                Note du commissaire
              </span>
              {row.note}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </SettleIn>
  );
}

/** The standings table proper — header rule, six rows, agate legend. */
function DeskBoxScore() {
  return (
    <div>
      <SettleIn>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="flex items-center gap-2.5 font-serif text-[clamp(1.35rem,2.4vw,1.7rem)] font-bold leading-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
            <Trophy aria-hidden className="h-4.5 w-4.5 text-[#bf3415]" strokeWidth={2} />
            Le classement du matin
          </h3>
          <span className={T.folio}>banc d'essai · {EDITION.datelineShort}</span>
        </div>
      </SettleIn>
      <DoubleRule className="mt-3" />
      {/* Column heads — only at md+, where the full grid is visible. */}
      <div
        className={`hidden gap-x-3 px-1 pb-2 pt-3 md:grid ${DESK_GRID_COLS}`}
        aria-hidden
      >
        <span className={T.folio}>№</span>
        <span className={T.folio}>Épreuve</span>
        <span className={`${T.folio} text-right`}>Lignes</span>
        <span className={`${T.folio} text-right`}>Temps</span>
        <span className={T.folio}>Méthode</span>
        <span />
      </div>
      <div role="list" aria-label="Classement des six requêtes du banc d'essai">
        {DESK_SCORE_ROWS.map((row, i) => (
          <div role="listitem" key={row.pos}>
            <DeskScoreRow row={row} index={i} />
          </div>
        ))}
      </div>
      <Rule />
      {/* Agate legend — the small print every honest results page carries. */}
      <SettleIn delay={0.2}>
        <p className={`${T.folio} mt-3 max-w-[78ch] normal-case leading-relaxed`}>
          Lignes — lignes touchées par l'épreuve. Temps — mur, pire de deux passes. Méthode —
          déclaration du moteur, contrôlée au plan d'exécution (EXPLAIN ANALYZE). Record homologué
          par le pupitre. Cliquer une ligne ouvre la copie et la note du commissaire.
        </p>
      </SettleIn>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  PLAY-BY-PLAY · the record query, millisecond by millisecond
 *  A vertical ink rail runs the column; its vermilion fill is a scaleY
 *  transform driven by drift progress, and each step's dot inks itself in
 *  as the fill reaches it. Pure transform/opacity throughout.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Where each step sits on the rail's progress window [0.22 → 0.72]. */
function DeskPlayAt(index: number) {
  return 0.22 + (index / (DESK_PLAY_STEPS.length - 1)) * 0.5;
}

/** One commentary entry. Receives the shared progress MotionValue as a prop —
 *  hooks live here, in a real component, never in the map callback. */
function DeskPlayStep({
  step,
  progress,
  at,
  index,
  last,
}: {
  step: DeskPlayStepData;
  progress: MotionValue<number>;
  at: number;
  index: number;
  last: boolean;
}) {
  const reduce = useReducedMotion();
  const reached = useTransform(progress, [at - 0.025, at + 0.015], reduce ? [1, 1] : [0, 1], {
    clamp: true,
  });
  return (
    <div className={`relative pl-9 ${last ? "" : "pb-9"}`}>
      {/* hollow ink dot, then the vermilion fill scales in as the rail passes */}
      <span
        aria-hidden
        className="absolute left-0 top-[3px] h-[13px] w-[13px] rounded-full border-2 border-[#1c1914] bg-[#f6f1e7]"
      />
      <motion.span
        aria-hidden
        className="absolute left-[3px] top-[6px] h-[7px] w-[7px] rounded-full bg-[#bf3415]"
        style={{ scale: reached, opacity: reached }}
      />
      <RiseIn delay={index * 0.05} amount={0.6}>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={`${T.num} text-[13px] font-bold text-[#1c1914]`}>{step.clock}</span>
          <span className="font-grotesk text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4a4438]">
            {step.phase}
          </span>
          <span
            className={`${T.num} border border-[#d6ccb6] px-1.5 py-px text-[10px] text-[#857c69]`}
          >
            {step.dur}
          </span>
        </p>
      </RiseIn>
      <SettleIn delay={index * 0.05 + 0.1} y={10}>
        <p className="mt-2 max-w-[44ch] font-serif text-[15px] leading-[1.6] text-[#1c1914]">
          {step.text}
        </p>
        <p className={`${T.folio} mt-1.5`}>horloge du banc · {step.wall}</p>
      </SettleIn>
    </div>
  );
}

/** The full column: header, rail, steps, final-time plate, referee note. */
function DeskPlayByPlay() {
  const reduce = useReducedMotion();
  const railRef = useRef<HTMLDivElement>(null);
  const progress = useDriftProgress(railRef);
  // The fill covers the same window the step thresholds live in, so the last
  // dot inks exactly when the rail completes. Reduced motion: fill stays full.
  const fill = useTransform(progress, [0.22, 0.72], reduce ? [1, 1] : [0, 1], { clamp: true });
  return (
    <aside aria-label="Jeu par jeu — la vie de la requête record">
      <SettleIn>
        <p className="flex items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#bf3415]">
          <Flag aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />
          Jeu par jeu — épreuve № 01 · agrégat par canal
        </p>
        <p className="mt-3 font-serif text-[15px] italic leading-relaxed text-[#4a4438]">
          How a record actually happens, millisecond by millisecond — transcribed from the
          engine's own log, no cuts, no slow motion.
        </p>
      </SettleIn>
      <div ref={railRef} className="relative mt-7">
        {/* the rail: faint ink track behind, vermilion progress in front */}
        <span aria-hidden className="absolute bottom-1 left-[5.5px] top-1 w-px bg-[#1c1914]/25" />
        <motion.span
          aria-hidden
          className="absolute bottom-1 left-[4.5px] top-1 w-[3px] origin-top bg-[#bf3415]"
          style={{ scaleY: fill }}
        />
        {DESK_PLAY_STEPS.map((step, i) => (
          <DeskPlayStep
            key={step.clock}
            step={step}
            progress={progress}
            at={DeskPlayAt(i)}
            index={i}
            last={i === DESK_PLAY_STEPS.length - 1}
          />
        ))}
      </div>
      <SettleIn delay={0.15} className="mt-8">
        <div className="border-2 border-[#1c1914] bg-[#eee6d6] px-4 py-3 shadow-[4px_4px_0_#1c1914]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className={`${T.kicker} text-[#1c1914]`}>Temps final</span>
            <span className={`${T.num} text-[1.35rem] font-bold text-[#1c1914]`}>0,178 s</span>
          </div>
          <p className={`${T.folio} mt-1 normal-case`}>
            homologué — pire de deux passes, arrondi à 0,18 contre nous
          </p>
        </div>
      </SettleIn>
      <SettleIn delay={0.25}>
        <p className={`${T.folio} mt-4 normal-case leading-relaxed`}>
          Transcription du journal du moteur (EXPLAIN ANALYZE), sans coupes ni ralenti. Les
          millisecondes sont celles du banc, pas celles du service marketing.
        </p>
      </SettleIn>
    </aside>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  MI-TEMPS · the half-time rule between the match report and the kit pages
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskMiTemps() {
  return (
    <SettleIn>
      <div className="flex items-center gap-5">
        <Rule className="flex-1" />
        <span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-[#bf3415]" />
        <span className="font-grotesk text-[11px] font-black uppercase tracking-[0.34em] text-[#1c1914]">
          Mi-temps
        </span>
        <span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-[#bf3415]" />
        <Rule className="flex-1" />
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  FIG. 2 · the throughput plate — halftone area chart, gently parallaxed
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskThroughputPlate() {
  return (
    <Parallax speed={26}>
      <figure className="border-2 border-[#1c1914] bg-[#f6f1e7] p-5 shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)] sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="flex items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4a4438]">
            <Gauge aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={2.2} />
            Débit en lecture
          </p>
          <span className={`${T.num} flex items-center gap-1.5 text-[11px] text-[#2f6b3f]`}>
            <Activity aria-hidden className="h-3 w-3" strokeWidth={2.2} />
            pic 14,2 M lignes/s
          </span>
        </div>
        {/* y-scale in agate at left; the plate area takes the rest */}
        <div className="mt-4 flex gap-3">
          <div
            aria-hidden
            className={`${T.folio} flex shrink-0 flex-col justify-between pb-1 text-right`}
          >
            <span>14</span>
            <span>7</span>
            <span>0</span>
          </div>
          <div className="h-44 min-w-0 flex-1">
            <InkArea data={DESK_THROUGHPUT} w={340} h={150} />
          </div>
        </div>
        <div aria-hidden className="mt-2 flex justify-between pl-7">
          {DESK_THROUGHPUT_TICKS.map((tick) => (
            <span key={tick} className={`${T.num} text-[9.5px] text-[#857c69]`}>
              {tick}
            </span>
          ))}
        </div>
        <figcaption className="mt-4 border-t border-[#d6ccb6] pt-3 font-serif text-[13px] italic leading-relaxed text-[#4a4438]">
          <span className="font-bold not-italic text-[#1c1914]">Fig. 2 — </span>
          Débit en lecture pendant le scan, en millions de lignes par seconde. Douze passes
          consécutives, fichier froid puis chaud ; le creux de la passe 8, c'est l'antivirus qui
          passait dire bonjour.
        </figcaption>
      </figure>
    </Parallax>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  FIG. 3 · le tableau noir — the scan, drawn as a tactics board
 *  The coach's diagram: the column at left is taken in strides of 2 048
 *  values; eight threads run their lanes and converge on one hash aggregate.
 *  The vermilion lane is the one the play-by-play column follows. Every line
 *  draws itself with InkPath — chalk, but in ink.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Lane geometry for the tactics board — index math only, fully deterministic. */
const DESK_TACTIC_LANES: ReadonlyArray<{ id: string; y: number; hot: boolean }> = Array.from(
  { length: 8 },
  (_, i) => ({
    id: `fil-${i + 1}`,
    y: 24 + i * 20,
    /** the narrated thread — the same one the play-by-play column follows */
    hot: i === 2,
  }),
);

function DeskTacticsBoard() {
  return (
    <SettleIn>
      <figure className="border-2 border-[#1c1914] bg-[#f6f1e7] p-5 shadow-[4px_4px_0_#1c1914] sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="flex items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4a4438]">
            <ScanLine aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={2.2} />
            Le tableau noir
          </p>
          <span className={T.folio}>la tactique du scan vectorisé</span>
        </div>
        <div className="mt-4">
          <svg viewBox="0 0 340 196" className="h-auto w-full" aria-hidden>
            {/* the column itself — one tall block, ruled into 8 strides */}
            <InkPath d="M14 14 H56 V182 H14 Z" strokeWidth={1.8} duration={0.7} />
            {DESK_TACTIC_LANES.map((lane, i) => (
              <InkPath
                key={`chunk-${lane.id}`}
                d={`M14 ${14 + (i + 1) * 21} H56`}
                strokeWidth={0.8}
                stroke={INK_FADED}
                delay={0.3 + i * 0.04}
                duration={0.25}
              />
            ))}
            <text
              x="35"
              y="10"
              textAnchor="middle"
              fontSize="8.5"
              fontFamily="var(--font-mono)"
              fill={INK_SOFT}
            >
              la colonne
            </text>
            <text
              x="35"
              y="192"
              textAnchor="middle"
              fontSize="8"
              fontFamily="var(--font-mono)"
              fill={INK_FADED}
            >
              2 048 / foulée
            </text>
            {/* eight lanes: out of the column, down the straight, into the hash */}
            {DESK_TACTIC_LANES.map((lane, i) => (
              <InkPath
                key={lane.id}
                d={`M58 ${lane.y} H200 L284 98`}
                stroke={lane.hot ? VERMILION : INK}
                strokeWidth={lane.hot ? 2.2 : 1.4}
                delay={0.5 + i * 0.07}
                duration={0.6}
              />
            ))}
            {DESK_TACTIC_LANES.map((lane) => (
              <text
                key={`label-${lane.id}`}
                x="64"
                y={lane.y - 4}
                fontSize="7.5"
                fontFamily="var(--font-mono)"
                fill={lane.hot ? VERMILION : INK_FADED}
              >
                {lane.id.replace("-", " ")}
              </text>
            ))}
            {/* the hash aggregate — where all eight lanes finish */}
            <InkPath d="M286 76 H330 V120 H286 Z" strokeWidth={1.8} delay={1.1} duration={0.5} />
            <text
              x="308"
              y="94"
              textAnchor="middle"
              fontSize="8.5"
              fontFamily="var(--font-mono)"
              fontWeight="600"
              fill={INK}
            >
              hash
            </text>
            <text
              x="308"
              y="106"
              textAnchor="middle"
              fontSize="8.5"
              fontFamily="var(--font-mono)"
              fill={INK_SOFT}
            >
              agrégé
            </text>
            {/* the result drops out of the bottom of the box: six groups */}
            <InkPath
              d="M308 122 V146 M308 146 l-4 -5 M308 146 l4 -5"
              stroke={VERMILION}
              strokeWidth={1.8}
              delay={1.5}
              duration={0.4}
            />
            <text
              x="308"
              y="160"
              textAnchor="middle"
              fontSize="9"
              fontFamily="var(--font-mono)"
              fontWeight="700"
              fill={VERMILION}
            >
              6 groupes
            </text>
          </svg>
        </div>
        <figcaption className="mt-4 border-t border-[#d6ccb6] pt-3 font-serif text-[13px] italic leading-relaxed text-[#4a4438]">
          <span className="font-bold not-italic text-[#1c1914]">Fig. 3 — </span>
          La tactique au tableau noir : la colonne est prise par foulées de 2 048 valeurs, huit
          fils courent leur couloir et convergent vers le même agrégat de hachage. Le fil en
          rouge est celui que la chronique suit au jeu par jeu.
        </figcaption>
      </figure>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  PRESS BOX · rumours and tomorrow's programme — the sports page's small talk
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskPressBox() {
  return (
    <div className="space-y-6">
      <SettleIn>
        <div className="border border-[#1c1914] p-4">
          <p className="flex items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4a4438]">
            <Megaphone aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={2.2} />
            Rumeurs de mercato
          </p>
          <p className="mt-2.5 font-serif text-[13.5px] italic leading-relaxed text-[#4a4438]">
            On prête au pupitre l'envie d'un moteur GPU pour la saison prochaine. Le banc dément :
            pas de mercato. La machine de série tient le chrono, et le contrat interdit les
            transferts de données — dans les deux sens.
          </p>
        </div>
      </SettleIn>
      <SettleIn delay={0.12}>
        <div className="border border-[#1c1914] p-4">
          <p className="flex items-center gap-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.22em] text-[#4a4438]">
            <CalendarClock aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={2.2} />
            Le programme de demain
          </p>
          <p className="mt-2.5 font-serif text-[13.5px] italic leading-relaxed text-[#4a4438]">
            Mêmes six épreuves, nouveau fichier au guichet. DailyTransactions_2026-06-12.csv est
            attendu autour de 2,2 M de lignes. Le moteur est déjà échauffé ; à vrai dire, il n'a
            jamais cessé de l'être.
          </p>
          <div className="mt-3 border-t border-[#d6ccb6] pt-2.5">
            <p className={`${T.num} text-[11px] leading-relaxed text-[#4a4438]`}>
              06 h 00 — dépôt du CSV au greffe
              <br />
              06 h 01 — six épreuves, rapport pressé
              <br />
              06 h 02 — le chronométreur retourne à son café
            </p>
          </div>
        </div>
      </SettleIn>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  L'ÉQUIPEMENT · the kit table — four pieces, four self-drawing glyphs
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskKitRow({ item, index }: { item: DeskKitItem; index: number }) {
  return (
    <SettleIn delay={index * 0.07} y={12} className="border-t border-[#d6ccb6]">
      <div className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-start gap-x-4 py-4">
        <span className="flex h-11 w-11 items-center justify-center border border-[#1c1914] bg-[#f6f1e7]">
          <DeskKitGlyph kind={item.glyph} className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="font-serif text-[17px] font-bold leading-tight text-[#1c1914]">
              {item.nom}
            </span>
            <span
              className={`${T.num} border border-[#d6ccb6] bg-[#f6f1e7] px-1.5 py-px text-[10px] text-[#4a4438]`}
            >
              {item.specialite}
            </span>
          </p>
          <p className="mt-0.5 font-grotesk text-[11px] font-semibold uppercase tracking-[0.16em] text-[#857c69]">
            {item.poste}
          </p>
          <p className="mt-1.5 max-w-[58ch] font-serif text-[14px] leading-relaxed text-[#4a4438]">
            {item.detail}
          </p>
        </div>
        <span
          aria-hidden
          className={`${T.num} pt-1 text-[1.6rem] font-bold leading-none text-[#1c1914]/15`}
        >
          {item.dossard}
        </span>
      </div>
    </SettleIn>
  );
}

function DeskKitTable() {
  return (
    <div>
      <SettleIn>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="flex items-center gap-2.5 font-serif text-[clamp(1.35rem,2.4vw,1.7rem)] font-bold leading-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
            <Database aria-hidden className="h-4.5 w-4.5 text-[#bf3415]" strokeWidth={2} />
            L'équipement
          </h3>
          <span className={T.folio}>feuille de match · 4 pièces</span>
        </div>
        <p className="mt-3 max-w-[60ch] font-serif text-[15px] italic leading-relaxed text-[#4a4438]">
          The kit, as declared to the stewards. Everything embedded in the app's own process;
          nothing dials out, nothing phones home, nothing needs installing twice.
        </p>
      </SettleIn>
      <div className="mt-5">
        {DESK_KIT.map((item, i) => (
          <DeskKitRow key={item.dossard} item={item} index={i} />
        ))}
      </div>
      <Rule />
      <SettleIn delay={0.2} className="mt-4">
        <InkLink href="#capabilities">La feuille de match complète — l'index des capacités</InkLink>
      </SettleIn>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  STAT TRIO · three figures the desk repeats at dinner parties
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskStatTrio() {
  return (
    <div className="grid gap-px bg-[#d6ccb6] border border-[#d6ccb6] sm:grid-cols-3">
      {DESK_STATS.map((stat, i) => (
        <SettleIn key={stat.label} delay={i * 0.08} className="bg-[#eee6d6] px-5 py-5">
          <span className="block text-[2.4rem] font-bold leading-none text-[#1c1914]">
            <CountUpInk end={stat.end} duration={1.1 + i * 0.2} />
          </span>
          <span className={`${T.kicker} mt-2 block`}>{stat.label}</span>
          <span className="mt-1 block font-serif text-[13px] italic leading-snug text-[#4a4438]">
            {stat.note}
          </span>
        </SettleIn>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  LA SAISON · the week's results in agate, with the Fig. 3 sparkline
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskSeasonRowLine({ row, index }: { row: DeskSeasonRow; index: number }) {
  return (
    <SettleIn delay={index * 0.04} y={8}>
      <div
        className={`flex items-baseline justify-between gap-3 border-t border-[#d6ccb6] py-2 ${
          row.record ? "text-[#2f6b3f]" : "text-[#1c1914]"
        }`}
      >
        <span className={`${T.num} w-14 shrink-0 text-[12px] font-semibold`}>{row.jour}</span>
        <span className={`${T.num} hidden text-[12px] text-[#4a4438] sm:block`}>
          {row.lignes} lignes
        </span>
        <span className={`${T.folio} hidden min-w-0 flex-1 truncate text-right normal-case lg:block`}>
          {row.note ?? "—"}
        </span>
        <span className={`${T.num} flex w-20 shrink-0 items-center justify-end gap-1.5 text-[13px] font-bold`}>
          {row.record && <Medal aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />}
          {row.temps}
        </span>
      </div>
    </SettleIn>
  );
}

function DeskSeasonAgate() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div>
        <SettleIn>
          <p className={T.kicker}>Les résultats de la semaine</p>
          <p className="mt-2 font-serif text-[15px] italic leading-relaxed text-[#4a4438]">
            Même épreuve, huit matins, même machine. Le chrono ne s'entraîne pas ; le cache, si.
          </p>
        </SettleIn>
        <div className="mt-4">
          {DESK_SEASON.map((row, i) => (
            <DeskSeasonRowLine key={row.jour} row={row} index={i} />
          ))}
          <Rule />
        </div>
      </div>
      <SettleIn delay={0.15}>
        <figure className="border border-[#1c1914] bg-[#f6f1e7] p-5">
          <div className="h-28">
            <InkLine
              data={DESK_SEASON_SPARK}
              w={300}
              h={96}
              markIndex={DESK_SEASON.length - 1}
            />
          </div>
          <div aria-hidden className="mt-1.5 flex justify-between">
            <span className={`${T.num} text-[9.5px] text-[#857c69]`}>jeu 04</span>
            <span className={`${T.num} text-[9.5px] text-[#857c69]`}>dim 07</span>
            <span className={`${T.num} text-[9.5px] text-[#857c69]`}>jeu 11</span>
          </div>
          <figcaption className="mt-3 border-t border-[#d6ccb6] pt-3 font-serif text-[13px] italic leading-relaxed text-[#4a4438]">
            <span className="font-bold not-italic text-[#1c1914]">Fig. 3 — </span>
            Le chrono de la semaine. La courbe plonge le week-end parce que le trafic dort aussi ;
            le point cerclé est le record du jeudi, à volume plein.
          </figcaption>
        </figure>
      </SettleIn>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  CONDITIONS DU BANC · the homologated machine — ordinary on purpose
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskBenchNotes() {
  return (
    <div>
      <SettleIn>
        <p className={T.kicker}>Conditions du banc — homologuées</p>
        <p className="mt-2 max-w-[58ch] font-serif text-[15px] italic leading-relaxed text-[#4a4438]">
          The machine is the point: it is ordinary. Any desk in the building could have run this
          meeting, and tomorrow one of them will.
        </p>
      </SettleIn>
      <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {DESK_BENCH.map((item, i) => (
          <SettleIn key={item.label} delay={i * 0.06} y={10}>
            <DeskBenchItemLine item={item} />
          </SettleIn>
        ))}
      </div>
    </div>
  );
}

/** One bench line — icon plate, mono label, serif detail. Split out so the
 *  map body stays hook-free and the markup stays in one place. */
function DeskBenchItemLine({ item }: { item: DeskBenchItem }) {
  const Icon = item.icon;
  return (
    <div className="flex items-start gap-3.5 border-t border-[#d6ccb6] pt-3.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#1c1914]">
        <Icon aria-hidden className="h-4 w-4 text-[#1c1914]" strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className={`${T.num} block text-[13px] font-bold text-[#1c1914]`}>{item.label}</span>
        <span className="mt-0.5 block font-serif text-[13.5px] leading-snug text-[#4a4438]">
          {item.detail}
        </span>
      </span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  RECTIFICATIF · the corrections box every honest sports page owes its readers
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskCorrections() {
  return (
    <SettleIn delay={0.1}>
      <div className="border border-[#1c1914] p-4">
        <p className={`${T.kicker} text-[#bf3415]`}>Rectificatif</p>
        <p className="mt-2 font-serif text-[13.5px] italic leading-relaxed text-[#4a4438]">
          Une lectrice nous écrit que 0,18 s est « trop rapide pour être honnête ». Le banc a
          rejoué l'épreuve devant témoin : 0,179 s. Nous présentons nos excuses pour le millième —
          et au chronométreur, qui avait raison, comme toujours.
        </p>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  THE SECTION · composition in reading order
 *  Band 1 (paper): mast → score bug → headline → scoreline → standings +
 *  play-by-play. Band 2 (deep paper): Fig. 2 + kit + stat trio. Band 3
 *  (paper): season agate + bench + rectificatif → pull quote → folio.
 * ──────────────────────────────────────────────────────────────────────────── */

function DeskSection() {
  return (
    <section
      id="desk"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 5600px" }}
    >
      {/* ── Band 1 · the match report ─────────────────────────────────────── */}
      <div className="mx-auto max-w-[1280px] px-5 pb-20 pt-24 sm:px-8 lg:px-12">
        <SectionMast rubrique="Le pupitre des données" no="p.6" />
        <DeskScoreBug />

        {/* headline + standfirst, with the margin note hung off the right */}
        <div className="mt-12 grid gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_11rem]">
          <div>
            <DeckReveal
              className="max-w-[22ch]"
              lineClassName="font-serif text-[clamp(2.2rem,5vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
              lines={[
                <span key="l1">Six events, one stopwatch —</span>,
                <span key="l2">
                  the column engine <PenUnderline delay={0.8}>sweeps the card</PenUnderline>
                </span>,
              ]}
            />
            <SettleIn delay={0.25} className="mt-6">
              <Byline
                name="Par le chronométreur du pupitre"
                desk="Banc d'essai · rubrique moteurs"
              />
            </SettleIn>
            <div className="mt-7 max-w-[68ch] space-y-5">
              <DropCapParagraph>
                Every morning, before the edition goes to press, the desk runs the same six events
                on the same unremarkable laptop: one full scan, one aggregate, one join, one
                window, one percentile, one export. No warm-up laps on a server farm, no
                qualifying heats in a cloud region — the file stays on the desk and the engine
                comes to it. The times printed below are wall-clock, worst of two passes,
                witnessed.
              </DropCapParagraph>
              <p className={T.body}>
                The engine is DuckDB, set in a column and run in-process — the same binary that
                ships inside Data Navigator. The stopwatch is the operating system's. The crowd is
                one analyst with coffee. Nobody has ever asked the data to travel for this, and
                the data has never been faster for staying home.
              </p>
            </div>
          </div>
          <div className="hidden lg:block lg:pt-24">
            <MarginNote>
              même machine que la comptabilité — aucun serveur n'a été dérangé
            </MarginNote>
          </div>
        </div>

        {/* the scoreline lead — the page's one big red-pen moment */}
        <div className="mt-16">
          <DeskScoreline />
        </div>

        {/* standings + play-by-play, separated by a newspaper column rule */}
        <div className="mt-20 grid gap-y-16 lg:grid-cols-12 lg:gap-x-0">
          <div className="lg:col-span-7 lg:pr-10">
            <DeskBoxScore />
          </div>
          <div className="lg:col-span-5 lg:border-l lg:border-[#d6ccb6] lg:pl-10">
            <DeskPlayByPlay />
          </div>
        </div>

        <div className="mt-20">
          <DeskMiTemps />
        </div>
      </div>

      {/* ── Band 2 · the technical pages, on deeper paper ─────────────────── */}
      <div className="border-y border-[#d6ccb6] bg-[#eee6d6]">
        <div className="mx-auto max-w-[1280px] px-5 py-20 sm:px-8 lg:px-12">
          <div className="grid gap-y-14 lg:grid-cols-12 lg:gap-x-14">
            <div className="lg:col-span-5">
              <DeskThroughputPlate />
            </div>
            <div className="lg:col-span-7">
              <DeskKitTable />
            </div>
          </div>
          <div className="mt-16">
            <DeskStatTrio />
          </div>
        </div>
      </div>

      {/* ── Band 3 · agate matter, bench conditions, the closing word ─────── */}
      <div className="mx-auto max-w-[1280px] px-5 pb-24 pt-20 sm:px-8 lg:px-12">
        <DeskSeasonAgate />
        <div className="mt-16 grid gap-y-10 lg:grid-cols-12 lg:gap-x-14">
          <div className="lg:col-span-7">
            <DeskBenchNotes />
          </div>
          <div className="lg:col-span-5 lg:pt-9">
            <DeskCorrections />
          </div>
        </div>

        <div className="mt-20 max-w-[46rem]">
          <PullQuote cite="le chef du banc d'essai, carnet de juin">
            Desktop speed is a feature you can audit.
          </PullQuote>
        </div>

        <FolioLine
          className="mt-16 border-t border-[#d6ccb6] pt-4"
          page="p.6"
          note="Pupitre des données · banc d'essai du matin"
        />
      </div>
    </section>
  );
}
