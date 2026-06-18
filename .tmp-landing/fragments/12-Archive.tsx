/* ════════════════════════════════════════════════════════════════════════════
 *  §12 — LES ARCHIVES · history & versioning as the morgue
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Old newsrooms kept every printed edition in a basement room they called
 *  the morgue. This section IS that room: a parallax shelf of the week's six
 *  past editions (no Sunday paper — the press rests), a "REGISTRE DES
 *  ÉDITIONS" ledger where every run is logged with its delta against the day
 *  before, a printed RECTIFICATIF proving that versions are kept rather than
 *  overwritten, three classified ads for the archive desk's quieter talents
 *  (lineage, reconciliation, restore), and a grep that finds Thursday's
 *  16 h 04 dip in 41 milliseconds.
 *
 *  Design intent
 *  ─────────────
 *  • Depth is literal: each shelf sheet rides its own Parallax speed —
 *    the deeper the edition, the slower it drifts (speed > 0 = behind the
 *    page plane, per the preamble's Parallax contract).
 *  • Versioning is told as print culture: a correction notice with the old
 *    figure struck in red pen, both versions kept on the shelf — not as a
 *    diff-viewer screenshot.
 *  • The ledger is the section's data spine: real-feeling seven-day numbers
 *    that reconcile against EDITION (jeu 11 = 2 147 380 lignes · 97,4 %),
 *    Sunday printed as «relâche», Thursday's réussite circled by the editor
 *    because that is the day the front page investigates.
 *  • All motion is transform/opacity/pathLength; everything gates behind
 *    useReducedMotion (Parallax, InkPath and Stamp do so internally).
 * ════════════════════════════════════════════════════════════════════════════ */

/* ── Data: the shelf ──────────────────────────────────────────────────────────
 * Six physical back-issues, deepest first. Issue numbers count back from
 * EDITION.issue (№ 847 = today, 12 juin) — Sunday 07 juin published nothing,
 * so the numbering skips a calendar day but not an issue.               */

type ArchiveSheetSpec = {
  id: string;
  /** dateline printed on the mini nameplate */
  date: string;
  issue: string;
  /** the day's one-line front-page head, set tiny */
  head: string;
  /** mono stat footer: lignes · réussite */
  stat: string;
  /** static rotation, −3..3 deg per the art direction */
  tilt: number;
  /** Parallax drift px — deeper = larger = slower against the page */
  speed: number;
  /** alternating paper stocks */
  stock: "deep" | "shade";
  /** left/top of the sheet inside the shelf, in % of the plate */
  x: number;
  y: number;
  /** greeked body layout — "a" two text cols, "b" text col + mini bars */
  layout: "a" | "b";
  /** small printed tag worn by a few sheets (rayon label, version tag) */
  tag?: string;
};

const ARCHIVE_SHEETS: ReadonlyArray<ArchiveSheetSpec> = [
  {
    id: "ven-05",
    date: "ven 05 juin",
    issue: "№ 841",
    head: "Mobile money carries the morning",
    stat: "2 094 113 lignes · 97,1 %",
    tilt: -3,
    speed: 46,
    stock: "deep",
    x: 0,
    y: 7,
    layout: "a",
    tag: "RAYON B",
  },
  {
    id: "sam-06",
    date: "sam 06 juin",
    issue: "№ 842",
    head: "Saturday runs light, behaves itself",
    stat: "1 862 447 lignes · 97,6 %",
    tilt: 2,
    speed: 38,
    stock: "shade",
    x: 12,
    y: 20,
    layout: "b",
  },
  {
    id: "lun-08",
    date: "lun 08 juin",
    issue: "№ 843",
    head: "Monday returns with 2,19 M receipts",
    stat: "2 188 902 lignes · 96,9 %",
    tilt: -2,
    speed: 31,
    stock: "deep",
    x: 24,
    y: 3,
    layout: "a",
  },
  {
    id: "mar-09",
    date: "mar 09 juin",
    issue: "№ 844",
    head: "A wrong drawer, quietly refiled",
    stat: "2 131 554 lignes · 97,0 %",
    tilt: 3,
    speed: 25,
    stock: "shade",
    x: 36,
    y: 17,
    layout: "b",
    tag: "v2 · corrigé",
  },
  {
    id: "mer-10",
    date: "mer 10 juin",
    issue: "№ 845",
    head: "Clean run, dull news, good news",
    stat: "2 156 209 lignes · 97,8 %",
    tilt: -1,
    speed: 19,
    stock: "deep",
    x: 48,
    y: 6,
    layout: "a",
  },
  {
    id: "jeu-11",
    date: "jeu 11 juin",
    issue: "№ 846",
    head: "The 16 h 04 dip makes the front page",
    stat: "2 147 380 lignes · 97,4 %",
    tilt: 2,
    speed: 12,
    stock: "shade",
    x: 60,
    y: 22,
    layout: "b",
    tag: "À LA UNE",
  },
];

/* ── Data: the ledger ─────────────────────────────────────────────────────────
 * One row per calendar day. Deltas are lignes vs the previous parution;
 * `rejetees` reconciles with réussite (lignes × (1 − réussite), rounded the
 * way a tired operator would). The 09 juin row is version 2 — its first
 * printing is preserved and confessed in the RECTIFICATIF below.         */

type ArchiveLedgerEntry = {
  id: string;
  jour: string;
  date: string;
  file: string;
  lignes: string;
  reussite: string;
  delta: { dir: "up" | "down"; text: string };
  duree: string;
  /** sha-256 fragment printed like a plate number */
  empreinte: string;
  /** Parquet snapshot weight */
  instantane: string;
  rejetees: string;
  /** one serif line the archivist allowed themselves */
  note: string;
  /** the day the editor circles — Thursday's 16 h 04 story */
  marked?: boolean;
  /** Sunday: the press rests, the row still prints */
  relache?: boolean;
  version?: string;
};

const ARCHIVE_LEDGER: ReadonlyArray<ArchiveLedgerEntry> = [
  {
    id: "ven-05",
    jour: "ven",
    date: "05.06",
    file: "DailyTransactions_2026-06-05.csv",
    lignes: "2 094 113",
    reussite: "97,1 %",
    delta: { dir: "up", text: "+1,8 %" },
    duree: "41 s",
    empreinte: "9f3a·17c2",
    instantane: "38,1 Mo",
    rejetees: "60 729",
    note: "A Friday like the textbooks promise: heavy, punctual, unremarkable.",
  },
  {
    id: "sam-06",
    jour: "sam",
    date: "06.06",
    file: "DailyTransactions_2026-06-06.csv",
    lignes: "1 862 447",
    reussite: "97,6 %",
    delta: { dir: "down", text: "−11,1 %" },
    duree: "37 s",
    empreinte: "b27e·d410",
    instantane: "33,9 Mo",
    rejetees: "44 699",
    note: "Weekend volume; the canaux mobiles keep the lights on.",
  },
  {
    id: "dim-07",
    jour: "dim",
    date: "07.06",
    file: "—",
    lignes: "—",
    reussite: "—",
    delta: { dir: "down", text: "—" },
    duree: "—",
    empreinte: "—",
    instantane: "—",
    rejetees: "—",
    note: "",
    relache: true,
  },
  {
    id: "lun-08",
    jour: "lun",
    date: "08.06",
    file: "DailyTransactions_2026-06-08.csv",
    lignes: "2 188 902",
    reussite: "96,9 %",
    delta: { dir: "up", text: "+17,5 %" },
    duree: "44 s",
    empreinte: "4cc1·08af",
    instantane: "39,8 Mo",
    rejetees: "67 856",
    note: "Monday's backlog arrives all at once, the way Mondays do.",
  },
  {
    id: "mar-09",
    jour: "mar",
    date: "09.06",
    file: "DailyTransactions_2026-06-09.csv",
    lignes: "2 131 554",
    reussite: "97,0 %",
    delta: { dir: "down", text: "−2,6 %" },
    duree: "42 s",
    empreinte: "e983·6b54",
    instantane: "38,7 Mo",
    rejetees: "63 947",
    note: "v1 misfiled 19 207 lignes under AGENCE; v2 confessed at 07 h 02. Both kept.",
    version: "v2",
  },
  {
    id: "mer-10",
    jour: "mer",
    date: "10.06",
    file: "DailyTransactions_2026-06-10.csv",
    lignes: "2 156 209",
    reussite: "97,8 %",
    delta: { dir: "up", text: "+1,2 %" },
    duree: "42 s",
    empreinte: "71d6·f2e9",
    instantane: "39,2 Mo",
    rejetees: "47 437",
    note: "The quietest run of the week. The archive likes quiet.",
  },
  {
    id: "jeu-11",
    jour: "jeu",
    date: "11.06",
    file: "DailyTransactions_2026-06-11.csv",
    lignes: "2 147 380",
    reussite: "97,4 %",
    delta: { dir: "down", text: "−0,4 %" },
    duree: "43 s",
    empreinte: "a3f2·91b0",
    instantane: "39,0 Mo",
    rejetees: "55 832",
    note: "The 16 h 04 dip — circled in red upstairs, filed in full down here.",
    marked: true,
  },
];

/** Réussite across the six parutions — the ledger's foot sparkline. The
 *  vermilion ring marks Thursday, agreeing with the editor's pen above. */
const ARCHIVE_SPARK: ReadonlyArray<number> = [97.1, 97.6, 96.9, 97.0, 97.8, 97.4];

/* ── Data: the classified ads ─────────────────────────────────────────────────
 * Three small ads from the archive desk, ruled like back-page classifieds.
 * Each leads with its French slogan — the desk speaks French to the data —
 * then permits itself exactly one English serif sentence.               */

type ArchiveAdSpec = {
  no: string;
  title: string;
  /** the French slogan, printed in guillemets */
  devise: string;
  line: string;
  foot: string;
  glyph: "lineage" | "scales" | "restore";
};

const ARCHIVE_ADS: ReadonlyArray<ArchiveAdSpec> = [
  {
    no: "ANN. 12-A",
    title: "Lignée des données",
    devise: "chaque chiffre cite sa source",
    line:
      "Click any total in any edition and the CSV rows that made it stand up to be counted — cell to line, line to file, file to checksum.",
    foot: "traçabilité cellule → ligne → fichier",
    glyph: "lineage",
  },
  {
    no: "ANN. 12-B",
    title: "Réconciliation",
    devise: "les écarts confessent",
    line:
      "When two editions disagree, the ledger names the rows, the canal and the minute. Discrepancies are explained here, never smoothed.",
    foot: "écarts expliqués · jamais lissés",
    glyph: "scales",
  },
  {
    no: "ANN. 12-C",
    title: "Restauration",
    devise: "hier revient en un clic",
    line:
      "Any edition reopens exactly as printed — same rows, same totals, same margins of error. Not a reconstruction; the paper itself.",
    foot: "restauration < 2 s · hors ligne",
    glyph: "restore",
  },
];

/** The standing-stats card beside the lead copy: what the basement holds. */
const ARCHIVE_HOLDINGS = [
  { label: "éditions en rayon", end: 365, suffix: "", decimals: 0 },
  { label: "instantanés Parquet", end: 9.4, suffix: " Go", decimals: 1 },
  { label: "restauration moyenne", end: 1.8, suffix: " s", decimals: 1 },
  { label: "octets sortis du poste", end: 0, suffix: "", decimals: 0 },
] as const;

/* ── Greeked body text ────────────────────────────────────────────────────────
 * The mini editions on the shelf carry unreadable body copy — printed greek.
 * Bar widths derive from index math (sin walk), never Math.random, so the
 * page renders identically on every press run.                          */

function ArchiveGreek({ rows, seed }: { rows: number; seed: number }) {
  return (
    <div aria-hidden className="space-y-[3px]">
      {Array.from({ length: rows }, (_, i) => {
        const w = 64 + Math.sin(seed * 1.7 + i * 2.7) * 28;
        // every ~5th line ends a paragraph short — real columns breathe
        const para = (i + seed) % 5 === 4;
        return (
          <div
            key={`g${seed}-${i}`}
            className="h-[2.5px] bg-[#1c1914]/[0.16]"
            style={{ width: `${para ? w * 0.55 : w}%` }}
          />
        );
      })}
    </div>
  );
}

/** Tiny deterministic bar chart for layout-"b" sheets — a printed graphic
 *  small enough to be furniture, real enough to feel typeset. */
function ArchiveGreekBars({ seed }: { seed: number }) {
  return (
    <div aria-hidden className="flex h-7 items-end gap-[2.5px]">
      {Array.from({ length: 9 }, (_, i) => {
        const h = 34 + Math.abs(Math.sin(seed * 2.3 + i * 1.9)) * 62;
        return (
          <div
            key={`b${seed}-${i}`}
            className="w-[4px] bg-[#1c1914]/[0.34]"
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

/* ── One sheet on the shelf ───────────────────────────────────────────────────
 * A miniature past edition: nameplate, double rule, dateline, one headline,
 * greeked columns, stat footer. The front sheet (jeu 11) lifts 4px on hover —
 * the reader's hand reaching for yesterday. Rotation lives on a middle div so
 * the hover translate composes cleanly with the static tilt.            */

function ArchiveSheet({ sheet, front, index }: { sheet: ArchiveSheetSpec; front: boolean; index: number }) {
  const stock = sheet.stock === "deep" ? "bg-[#eee6d6]" : "bg-[#e4dac5]";
  return (
    <Parallax
      speed={sheet.speed}
      rotate={index % 2 === 0 ? 1.1 : -1.1}
      className="absolute w-[clamp(138px,30vw,225px)]"
      style={{ left: `${sheet.x}%`, top: `${sheet.y}%`, zIndex: index + 1 }}
    >
      <div style={{ transform: `rotate(${sheet.tilt}deg)` }}>
        <article
          className={`relative border border-[#1c1914]/25 px-3 pb-3 pt-2.5 shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)] ${stock} ${
            front
              ? "transition-transform duration-300 ease-out hover:-translate-y-1"
              : ""
          }`}
        >
          {/* mini nameplate — the masthead in miniature */}
          <p className="text-center font-serif text-[10px] font-black leading-none tracking-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
            The Daily Edition
          </p>
          <DoubleRule className="mt-1.5" />
          <div className="mt-1 flex items-baseline justify-between font-mono text-[7px] uppercase tracking-[0.12em] text-[#857c69]">
            <span>{sheet.date}</span>
            <span>{sheet.issue}</span>
          </div>
          <Rule className="mt-1" />
          {/* the day's head — two lines max, set like a real single-column lede */}
          <h4 className="mt-1.5 font-serif text-[11px] font-bold leading-[1.12] text-[#1c1914]">
            {sheet.head}
          </h4>
          {/* greeked body, two layouts so the shelf never repeats itself */}
          {sheet.layout === "a" ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ArchiveGreek rows={9} seed={index * 3 + 1} />
              <ArchiveGreek rows={9} seed={index * 3 + 2} />
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 items-end gap-2">
              <ArchiveGreek rows={9} seed={index * 3 + 1} />
              <div className="space-y-1.5">
                <ArchiveGreekBars seed={index + 2} />
                <ArchiveGreek rows={4} seed={index * 3 + 2} />
              </div>
            </div>
          )}
          <Rule className="mt-2" />
          <p className="mt-1 truncate text-center font-mono text-[7px] tabular-nums tracking-[0.04em] text-[#4a4438]">
            {sheet.stat}
          </p>
          {/* worn tags: rayon label on the deepest, version tag on the corrected,
              front-page cross-ref on the freshest */}
          {sheet.tag && (
            <span
              className={`absolute -right-1.5 top-7 rotate-[4deg] border px-1 py-px font-grotesk text-[6.5px] font-black uppercase tracking-[0.14em] ${
                sheet.tag === "v2 · corrigé"
                  ? "border-[#2f6b3f] bg-[#eee6d6] text-[#2f6b3f]"
                  : "border-[#bf3415] bg-[#f6f1e7] text-[#bf3415]"
              }`}
            >
              {sheet.tag}
            </span>
          )}
          {/* the front sheet earns a dog-eared corner — someone keeps reading it */}
          {front && (
            <span
              aria-hidden
              className="absolute bottom-0 right-0 h-4 w-4 border-l border-t border-[#1c1914]/25 bg-[#f6f1e7]"
            />
          )}
        </article>
      </div>
    </Parallax>
  );
}

/* ── The shelf itself ─────────────────────────────────────────────────────────
 * A relative plate the sheets float over, closed by a heavy "shelf board"
 * double rule with the rayon label. Sheets overlap left→right, deepest first
 * in DOM so z-index reads naturally.                                    */

function ArchiveShelf() {
  return (
    <div>
      <div className="relative h-[clamp(300px,40vw,460px)]">
        {ARCHIVE_SHEETS.map((sheet, i) => (
          <ArchiveSheet
            key={sheet.id}
            sheet={sheet}
            index={i}
            front={i === ARCHIVE_SHEETS.length - 1}
          />
        ))}
      </div>
      {/* the shelf board — the editions rest on it */}
      <SettleIn y={8}>
        <DoubleRule />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className={T.folio}>Rayon B — éditions récentes · classement chronologique</p>
          <Stamp tilt={-5} className="text-[9px]">
            Archivé ce matin
          </Stamp>
        </div>
      </SettleIn>
      <p className="mt-3 font-serif text-[13px] italic leading-snug text-[#857c69]">
        Pas d'édition le dimanche — the press rests, the archive does not. Hover the front
        issue: yesterday lifts to meet you.
      </p>
    </div>
  );
}

/* ── Delta cell ───────────────────────────────────────────────────────────────
 * ▲ in conserve-green, ▼ in vermilion, mono and tabular — the only colour the
 * ledger allows itself outside the editor's pen.                        */

function ArchiveDelta({ delta }: { delta: ArchiveLedgerEntry["delta"] }) {
  const up = delta.dir === "up";
  return (
    <span
      className={`font-mono text-[11px] font-semibold tabular-nums ${
        up ? "text-[#2f6b3f]" : "text-[#bf3415]"
      }`}
    >
      <span aria-hidden className="mr-0.5 text-[9px]">
        {up ? "▲" : "▼"}
      </span>
      <span className="sr-only">{up ? "hausse " : "baisse "}</span>
      {delta.text}
    </span>
  );
}

/* ── One ledger row ───────────────────────────────────────────────────────────
 * The whole row is a real <button> carrying aria-expanded; the chevron sits
 * inside the date cell like a proofreader's caret. Sunday renders as a quiet
 * italic strip — no file, no button, no exception. Expansion reveals the
 * snapshot details (empreinte, instantané, rejets) and the restore link.
 * Height is never animated (motion budget): the panel fades and settles,
 * layout snaps — like a drawer, not an accordion.                       */

function ArchiveLedgerRow({
  entry,
  open,
  onToggle,
}: {
  entry: ArchiveLedgerEntry;
  open: boolean;
  onToggle: () => void;
}) {
  const reduce = useReducedMotion();
  if (entry.relache) {
    return (
      <div className="border-b border-[#d6ccb6] px-1 py-2.5">
        <p className="font-serif text-[13px] italic text-[#857c69]">
          <span className="mr-3 font-mono text-[11px] not-italic">{entry.jour} {entry.date}</span>
          relâche dominicale — pas de fichier, pas d'édition, pas d'exception.
        </p>
      </div>
    );
  }
  const panelId = `archive-panel-${entry.id}`;
  return (
    <div className="border-b border-[#d6ccb6]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="grid w-full grid-cols-[4.6rem_minmax(0,1fr)_4.4rem_3.9rem] items-baseline gap-x-2 px-1 py-2.5 text-left transition-colors hover:bg-[#1c1914]/[0.035] focus-visible:outline-2 focus-visible:outline-[#bf3415] focus-visible:outline-offset-[-2px] md:grid-cols-[5rem_minmax(0,1fr)_5.6rem_4.4rem_4.6rem_3.4rem]"
      >
        {/* date + caret */}
        <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-[#1c1914]">
          <ChevronDown
            aria-hidden
            className={`h-3 w-3 shrink-0 text-[#857c69] transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
          {entry.jour} {entry.date}
        </span>
        {/* fichier — desktop only; mobile gives the column to the numbers */}
        <span className="hidden truncate font-mono text-[10px] text-[#4a4438] md:block">
          {entry.file}
          {entry.version && (
            <span className="ml-1.5 border border-[#2f6b3f] px-1 font-grotesk text-[8px] font-black uppercase tracking-[0.1em] text-[#2f6b3f]">
              {entry.version}
            </span>
          )}
        </span>
        {/* mobile keeps a compressed file hint in the flexible column */}
        <span className="truncate font-mono text-[10px] text-[#857c69] md:hidden">
          …{entry.file.slice(-14)}
        </span>
        <span className="text-right font-mono text-[11px] tabular-nums text-[#1c1914]">
          {entry.lignes}
        </span>
        <span className="text-right font-mono text-[11px] tabular-nums text-[#1c1914]">
          {entry.marked ? <PenCircle delay={0.6}>{entry.reussite}</PenCircle> : entry.reussite}
        </span>
        <span className="hidden text-right md:block">
          <ArchiveDelta delta={entry.delta} />
        </span>
        <span className="hidden text-right font-mono text-[10px] tabular-nums text-[#857c69] md:block">
          {entry.duree}
        </span>
      </button>
      {/* mobile shows the delta beneath the row since its column is hidden */}
      <div className="flex justify-end px-1 pb-1.5 md:hidden">
        <ArchiveDelta delta={entry.delta} />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.28, ease: EASE_INK }}
            className="mb-2.5 border-l-2 border-[#1c1914] bg-[#eee6d6] px-3 py-3"
          >
            <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              <p className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-[#4a4438]">
                <Fingerprint aria-hidden className="h-3 w-3 shrink-0 text-[#857c69]" />
                sha-256 · {entry.empreinte}…{entry.version ? " (v2 signée)" : ""}
              </p>
              <p className="font-mono text-[10px] tabular-nums text-[#4a4438]">
                instantané Parquet · {entry.instantane}
              </p>
              <p className="font-mono text-[10px] tabular-nums text-[#4a4438]">
                lignes rejetées · {entry.rejetees}
              </p>
              <p className="font-mono text-[10px] tabular-nums text-[#4a4438]">
                traitement · {entry.duree} sur ce poste
              </p>
            </div>
            <p className="mt-2.5 font-serif text-[13.5px] italic leading-snug text-[#1c1914]">
              {entry.note}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
              <Link
                href="/signup"
                className="inline-flex items-center gap-1.5 font-grotesk text-[12px] font-bold uppercase tracking-[0.12em] text-[#1c1914] underline decoration-[#bf3415] decoration-2 underline-offset-4 transition-colors hover:text-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
              >
                <RotateCcw aria-hidden className="h-3.5 w-3.5" />
                Restaurer cette édition
              </Link>
              <span className={T.folio}>byte for byte · sans réseau</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* the marked row hangs its margin note straight into the column —
          basement annotations don't wait for a margin to exist */}
      {entry.marked && (
        <div className="-mt-0.5 mb-2 flex justify-end pr-1">
          <MarginNote side="left" className="w-52">
            le creux de 16 h 04 — la une s'en charge,{" "}
            <a
              href="#lead"
              className="underline decoration-[#bf3415]/50 underline-offset-2 hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
            >
              voir p.3
            </a>
          </MarginNote>
        </div>
      )}
    </div>
  );
}

/* ── The ledger ───────────────────────────────────────────────────────────────
 * REGISTRE DES ÉDITIONS — the section's data spine. One open row at a time
 * (a registry, not a filing explosion); Thursday opens by default because
 * Thursday is the story. Foot carries the week's réussite sparkline with the
 * same vermilion ring the editor drew upstairs.                         */

function ArchiveLedger() {
  const [openId, setOpenId] = useState<string | null>("jeu-11");
  return (
    <SettleIn>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 font-grotesk text-[13px] font-black uppercase tracking-[0.24em] text-[#1c1914]">
          <FileClock aria-hidden className="h-4 w-4 text-[#bf3415]" />
          Registre des éditions
        </h3>
        <span className={T.folio}>semaine 24 · tenu à la main, vérifié à la machine</span>
      </div>
      <DoubleRule className="mt-2" />
      {/* column heads — the mobile grid drops fichier/Δ/durée into the rows */}
      <div className="grid grid-cols-[4.6rem_minmax(0,1fr)_4.4rem_3.9rem] gap-x-2 px-1 pb-1.5 pt-2.5 md:grid-cols-[5rem_minmax(0,1fr)_5.6rem_4.4rem_4.6rem_3.4rem]">
        <span className={T.folio}>date</span>
        <span className={T.folio}>fichier</span>
        <span className={`${T.folio} text-right`}>lignes</span>
        <span className={`${T.folio} text-right`}>
          <span className="md:hidden">réuss.</span>
          <span className="hidden md:inline">réussite</span>
        </span>
        <span className={`${T.folio} hidden text-right md:block`}>Δ veille</span>
        <span className={`${T.folio} hidden text-right md:block`}>durée</span>
      </div>
      <div className="border-t border-[#1c1914]">
        {ARCHIVE_LEDGER.map((entry) => (
          <ArchiveLedgerRow
            key={entry.id}
            entry={entry}
            open={openId === entry.id}
            onToggle={() => setOpenId(openId === entry.id ? null : entry.id)}
          />
        ))}
      </div>
      {/* week totals — the registrar rules off and sums the page. The Σ row
          reconciles by hand: six parutions, 12 580 605 lignes, mean 97,3 %. */}
      <div className="grid grid-cols-[4.6rem_minmax(0,1fr)_4.4rem_3.9rem] gap-x-2 border-b border-t-2 border-[#1c1914] border-b-[#d6ccb6] px-1 py-2.5 md:grid-cols-[5rem_minmax(0,1fr)_5.6rem_4.4rem_4.6rem_3.4rem]">
        <span className="font-mono text-[11px] font-semibold text-[#1c1914]">Σ S24</span>
        <span className="hidden font-serif text-[12px] italic text-[#857c69] md:block">
          six parutions servies, une relâche, un rectificatif
        </span>
        <span className="font-serif text-[12px] italic text-[#857c69] md:hidden">6 parutions</span>
        <span className="text-right font-mono text-[11px] font-semibold tabular-nums text-[#1c1914]">
          12 580 605
        </span>
        <span className="text-right font-mono text-[11px] font-semibold tabular-nums text-[#1c1914]">
          97,3 %
        </span>
        <span className="hidden text-right font-mono text-[10px] tabular-nums text-[#857c69] md:block">
          moy.
        </span>
        <span className="hidden text-right font-mono text-[10px] tabular-nums text-[#857c69] md:block">
          249 s
        </span>
      </div>
      {/* foot sparkline — six parutions of réussite, Thursday ringed */}
      <div className="mt-4 flex items-end gap-4">
        <div className="h-12 w-44 shrink-0 sm:w-56">
          <InkLine data={ARCHIVE_SPARK} w={224} h={48} markIndex={5} duration={1.1} />
        </div>
        <p className={`${T.folio} pb-0.5`}>
          réussite — 6 parutions · min 96,9 · max 97,8 · l'anneau, c'est jeudi
        </p>
      </div>
    </SettleIn>
  );
}

/* ── Ink glyphs for the classified ads ────────────────────────────────────────
 * Hand-drawn, not iconography: each glyph is two or three InkPath strokes
 * that draw themselves in view, like the archivist sketching the idea in
 * the ad's corner. 40×40 viewBox, pen-weight strokes.                   */

function ArchiveGlyphLineage() {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
      {/* one figure, two parents, four grandparents — provenance as a family tree */}
      <InkPath d="M20 35 V22" strokeWidth={2.2} duration={0.4} />
      <InkPath d="M20 22 C20 15 9 17 9 10" strokeWidth={2} delay={0.25} duration={0.45} />
      <InkPath d="M20 22 C20 15 31 17 31 10" strokeWidth={2} delay={0.35} duration={0.45} />
      <InkPath d="M9 10 C9 7 5 8 5 5 M9 10 C9 7 13 8 13 5" strokeWidth={1.6} delay={0.6} duration={0.4} />
      <InkPath d="M31 10 C31 7 27 8 27 5 M31 10 C31 7 35 8 35 5" strokeWidth={1.6} delay={0.7} duration={0.4} />
      <InkPath d="M17 35 H23" stroke={VERMILION} strokeWidth={2.4} delay={0.95} duration={0.25} />
    </svg>
  );
}

function ArchiveGlyphScales() {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
      {/* the reconciliation balance — two pans, one verdict */}
      <InkPath d="M20 7 V31" strokeWidth={2.2} duration={0.4} />
      <InkPath d="M7 11 H33" strokeWidth={2} delay={0.25} duration={0.4} />
      <InkPath d="M3 13 C3 19 11 19 11 13" strokeWidth={1.8} delay={0.5} duration={0.4} />
      <InkPath d="M29 13 C29 19 37 19 37 13" strokeWidth={1.8} delay={0.6} duration={0.4} />
      <InkPath d="M13 34 H27" stroke={VERMILION} strokeWidth={2.4} delay={0.9} duration={0.3} />
    </svg>
  );
}

function ArchiveGlyphRestore() {
  return (
    <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
      {/* time runs widdershins; the hand still points at 16 h 04 */}
      <InkPath d="M31 13 A12.5 12.5 0 1 0 32.5 22" strokeWidth={2.2} duration={0.6} />
      <InkPath d="M31 5.5 V13 H23.5" strokeWidth={2} delay={0.5} duration={0.35} />
      <InkPath d="M20 14 V21 L25 24" stroke={VERMILION} strokeWidth={2.4} delay={0.85} duration={0.4} />
    </svg>
  );
}

/* ── One classified ad ────────────────────────────────────────────────────────
 * Ruled like the back page: index tag, glyph, head, the French devise in
 * guillemets, one serif sentence, mono foot. Columns are deliberately
 * unequal — classifieds are sold by the centimetre, not the grid.       */

function ArchiveAd({ ad, index }: { ad: ArchiveAdSpec; index: number }) {
  return (
    <SettleIn delay={index * 0.12} className="flex flex-col px-5 py-5 first:pl-0 last:pr-0 max-md:border-b max-md:border-[#d6ccb6] max-md:px-0 max-md:last:border-b-0 md:first:pl-5 md:last:pr-5">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[9px] tracking-[0.14em] text-[#bf3415]">{ad.no}</span>
        {ad.glyph === "lineage" && <ArchiveGlyphLineage />}
        {ad.glyph === "scales" && <ArchiveGlyphScales />}
        {ad.glyph === "restore" && <ArchiveGlyphRestore />}
      </div>
      <h4 className="mt-2 font-serif text-[1.35rem] font-bold leading-tight text-[#1c1914] [font-variation-settings:'WONK'_1]">
        {ad.title}
      </h4>
      <p className="mt-1 font-serif text-[14px] italic text-[#bf3415]">« {ad.devise} »</p>
      <p className={`${T.body} mt-2.5 !text-[14.5px] !leading-[1.55] grow`}>{ad.line}</p>
      <Rule className="mt-4" />
      <p className={`${T.folio} mt-2`}>{ad.foot}</p>
    </SettleIn>
  );
}

/* ── The rectificatif ─────────────────────────────────────────────────────────
 * Versioning, told as print culture: the 09 juin réussite was printed wrong,
 * the correction ran the next morning, and — the entire point — BOTH
 * printings stay on the shelf. The old figure is struck in the editor's pen,
 * not erased. Git would call this history; the desk calls it honesty.   */

function ArchiveRectificatif() {
  return (
    <SettleIn className="relative border-2 border-[#1c1914] bg-[#f6f1e7] p-6 shadow-[4px_4px_0_#1c1914] sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-grotesk text-[11px] font-black uppercase tracking-[0.26em] text-[#bf3415]">
          Rectificatif — édition du 09 juin
        </p>
        <Stamp color={STAMP_GREEN} tilt={6} className="text-[10px]">
          v2 · corrigé
        </Stamp>
      </div>
      <Rule className="mt-3" />
      <p className={`${T.body} mt-4`}>
        Tuesday's réussite ran as <PenStrike delay={0.5}>96,1 %</PenStrike>{" "}
        <strong className="font-bold">97,0 %</strong>. La réconciliation found 19 207 lignes
        filed under the wrong canal — AGENCE where USSD belonged — and refiled them before
        the kettle boiled. The first printing is not destroyed; it is archived beside the
        second, each with its own empreinte, so that anyone may check what we believed and
        when we stopped believing it.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="font-mono text-[10px] tabular-nums text-[#4a4438]">
          v1 · e983·11d8… · archivée 09.06, 06 h 31
        </span>
        <span className="font-mono text-[10px] tabular-nums text-[#4a4438]">
          v2 · e983·6b54… · en rayon depuis 07 h 02
        </span>
        <span className="font-mono text-[10px] tabular-nums text-[#2f6b3f]">
          diff · +19 207 lignes reclassées
        </span>
      </div>
    </SettleIn>
  );
}

/* ── Avis de conservation ─────────────────────────────────────────────────────
 * The retention notice, set as legal small print, plus a 52-week depth gauge:
 * one tick per conserved week, heights wandering deterministically, this
 * week's tick in vermilion. The archive has a floor and you can see it. */

function ArchiveRetention() {
  return (
    <SettleIn delay={0.1} className="flex h-full flex-col border border-[#d6ccb6] bg-[#eee6d6] p-6">
      <p className="flex items-center gap-2 font-grotesk text-[11px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
        <History aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" />
        Avis de conservation
      </p>
      <Rule className="mt-3" />
      <p className={`${T.ui} mt-4 !text-[13.5px]`}>
        Les 365 dernières éditions sont conservées sur ce poste — instantanés Parquet
        signés, journal SQLite, zéro octet en transit. Le service des archives ne connaît
        pas le cloud et ne s'en porte pas plus mal.
      </p>
      {/* 52-week depth gauge — S−52 on the left, this week on the right */}
      <div aria-hidden className="mt-auto pt-5">
        <div className="flex h-9 items-end gap-[2px]">
          {Array.from({ length: 52 }, (_, i) => {
            const h = 38 + Math.abs(Math.sin(i * 0.83) * 46) + (i % 4 === 0 ? 14 : 0);
            const current = i === 51;
            return (
              <div
                key={`w${i}`}
                className={`w-full ${current ? "bg-[#bf3415]" : "bg-[#1c1914]/30"}`}
                style={{ height: `${Math.min(h, 100)}%` }}
              />
            );
          })}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[8.5px] uppercase tracking-[0.1em] text-[#857c69]">
          <span>S−52</span>
          <span>profondeur du rayon · 365 j</span>
          <span className="text-[#bf3415]">S−0</span>
        </div>
      </div>
    </SettleIn>
  );
}

/* ── Le règlement du sous-sol ─────────────────────────────────────────────────
 * The morgue's house rules, posted the way pressrooms post theirs: numbered
 * in the editor's pen, one serif sentence each, a folio sub-line for the
 * compliance reader. These four lines ARE the versioning model — everything
 * else on the page is illustration.                                     */

const ARCHIVE_REGLES = [
  {
    no: "1",
    regle: "On ne jette rien.",
    line: "A deleted edition is a missing receipt; the shelf only grows.",
    folio: "suppression: non prévue par le règlement",
  },
  {
    no: "2",
    regle: "On ne réécrit pas.",
    line: "Corrections print beside their mistakes, never over them.",
    folio: "v1 conservée · v2 datée · diff signée",
  },
  {
    no: "3",
    regle: "Chaque chiffre cite.",
    line: "Every figure names its file, its line and its checksum on request.",
    folio: "lignée: cellule → ligne → empreinte",
  },
  {
    no: "4",
    regle: "Le réseau attend dehors.",
    line: "The archive answers to the desk it lives under, and to no one else.",
    folio: "0 octet sorti · vérifiable au pare-feu",
  },
] as const;

function ArchiveReglement() {
  return (
    <SettleIn>
      <p className="flex items-center gap-2 font-grotesk text-[11px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
        <ScrollText aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" />
        Règlement du sous-sol
      </p>
      <DoubleRule className="mt-2" />
      <ol className="mt-1">
        {ARCHIVE_REGLES.map((r, i) => (
          <li
            key={r.no}
            className={`flex gap-4 py-3.5 ${i > 0 ? "border-t border-[#d6ccb6]" : ""}`}
          >
            <span
              aria-hidden
              className="mt-0.5 font-serif text-[1.6rem] font-black leading-none text-[#bf3415] [font-variation-settings:'WONK'_1]"
            >
              {r.no}
            </span>
            <div className="min-w-0">
              <p className="font-serif text-[16px] font-bold leading-snug text-[#1c1914]">
                {r.regle}{" "}
                <span className="font-normal italic text-[#4a4438]">{r.line}</span>
              </p>
              <p className={`${T.folio} mt-1`}>{r.folio}</p>
            </div>
          </li>
        ))}
      </ol>
    </SettleIn>
  );
}

/* ── Fiche de consultation ────────────────────────────────────────────────────
 * Paper archives lent nothing without a call slip. Ours survives as a small
 * stage prop: the forecasting desk pulls the SUPERSEDED 09 juin v1 — because
 * being allowed to consult what you used to believe is the whole argument
 * for keeping versions. Taped at a slight angle; the motif line types
 * itself like a clerk filling the form.                                 */

function ArchiveSlip() {
  return (
    <SettleIn delay={0.1}>
      <div className="rotate-[0.8deg]">
        <div className="relative border border-dashed border-[#1c1914]/55 bg-[#f6f1e7] p-5 shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)] sm:p-6">
          {/* two strips of archivist's tape — pure paper, no motion */}
          <span
            aria-hidden
            className="absolute -top-2 left-7 h-4 w-12 rotate-[-4deg] bg-[#1c1914]/10"
          />
          <span
            aria-hidden
            className="absolute -top-2 right-9 h-4 w-12 rotate-[3deg] bg-[#1c1914]/10"
          />
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-grotesk text-[10px] font-black uppercase tracking-[0.24em] text-[#1c1914]">
              Fiche de consultation
            </p>
            <span className="font-mono text-[9px] tabular-nums text-[#857c69]">№ 2 184</span>
          </div>
          <Rule className="mt-3" />
          <dl className="mt-3 space-y-2.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <dt className={`${T.folio} w-36 shrink-0`}>demandeur</dt>
              <dd className="font-mono text-[11px] text-[#1c1914]">
                L. Ben Salah — bureau des prévisions
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <dt className={`${T.folio} w-36 shrink-0`}>édition demandée</dt>
              <dd className="font-mono text-[11px] text-[#1c1914]">
                № 844 · mar 09 juin —{" "}
                <span className="font-semibold text-[#bf3415]">version 1</span>
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <dt className={`${T.folio} w-36 shrink-0`}>motif</dt>
              <dd className="min-w-0 font-mono text-[11px] text-[#1c1914]">
                <TypeOn
                  text="vérifier ce que nous croyions avant le rectificatif"
                  speed={24}
                  startDelay={300}
                />
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <dt className={`${T.folio} w-36 shrink-0`}>servie en</dt>
              <dd className="font-mono text-[11px] tabular-nums text-[#1c1914]">
                1,7 s · depuis l'instantané local
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <p className="max-w-[30ch] font-serif text-[12.5px] italic leading-snug text-[#857c69]">
              La v1 se consulte; elle ne se réimprime pas. The past is open for reading,
              closed for editing.
            </p>
            <Stamp color={STAMP_GREEN} tilt={-7} className="text-[10px]">
              Servie
            </Stamp>
          </div>
        </div>
      </div>
    </SettleIn>
  );
}

/* ── The grep strip ───────────────────────────────────────────────────────────
 * The pull quote's proof: an ink-black terminal pane where ripgrep walks the
 * archive and finds Thursday's dip in 41 ms. The command types itself; the
 * matches settle in after the cursor finishes — call and response.      */

function ArchiveGrep() {
  return (
    <SettleIn className="border-2 border-[#1c1914] bg-[#1c1914] p-5 shadow-[4px_4px_0_#bf3415] sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#f6f1e7]/45">
          poste de l'archiviste — sous-sol, rayon B
        </span>
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-[#f6f1e7]/25" />
          <span className="h-2 w-2 rounded-full bg-[#f6f1e7]/25" />
          <span className="h-2 w-2 rounded-full bg-[#bf3415]" />
        </span>
      </div>
      <div className="mt-4 font-mono text-[11.5px] leading-[1.8] sm:text-[12.5px]">
        <p className="text-[#f6f1e7]">
          <span className="text-[#bf3415]">$</span>{" "}
          <TypeOn text={'rg "16:04" rayon-b/edition-2026-06-*.ndjson'} speed={26} />
        </p>
        <SettleIn delay={1.35} y={6}>
          <p className="truncate text-[#f6f1e7]/75">
            edition-2026-06-11.ndjson<span className="text-[#bf3415]">:84117:</span>
            {'{"heure":"16:04","canal":"USSD","réussite":0.918}'}
          </p>
        </SettleIn>
        <SettleIn delay={1.55} y={6}>
          <p className="truncate text-[#f6f1e7]/75">
            edition-2026-06-11.ndjson<span className="text-[#bf3415]">:84118:</span>
            {'{"heure":"16:04","canal":"WEB","réussite":0.942}'}
          </p>
        </SettleIn>
        <SettleIn delay={1.75} y={6}>
          <p className="text-[#f6f1e7]/45">
            3 correspondances · 0,041 s — l'archive se souvient.
          </p>
        </SettleIn>
      </div>
    </SettleIn>
  );
}

/* ── Holdings card ────────────────────────────────────────────────────────────
 * What the basement holds, counted up in ink. The zero gets the green stamp:
 * the only figure on the page the security team reads twice.            */

function ArchiveHoldings() {
  return (
    <SettleIn delay={0.15} className="border border-[#1c1914] p-5">
      <p className="font-grotesk text-[10px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
        En rayon ce matin
      </p>
      <DoubleRule className="mt-2" />
      <dl className="mt-1">
        {ARCHIVE_HOLDINGS.map((stat, i) => (
          <div
            key={stat.label}
            className={`flex items-baseline justify-between gap-3 py-2.5 ${
              i > 0 ? "border-t border-[#d6ccb6]" : ""
            }`}
          >
            <dt className={T.folio}>{stat.label}</dt>
            <dd className="flex items-baseline gap-2">
              <CountUpInk
                end={stat.end}
                decimals={stat.decimals}
                suffix={stat.suffix}
                duration={1.2}
                className={`text-[15px] font-semibold ${
                  stat.end === 0 ? "text-[#2f6b3f]" : "text-[#1c1914]"
                }`}
              />
              {stat.end === 0 && (
                <span className="border border-[#2f6b3f] px-1 py-px font-grotesk text-[7.5px] font-black uppercase tracking-[0.12em] text-[#2f6b3f]">
                  juré
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <Rule />
      <p className={`${T.folio} mt-2.5 flex items-center justify-between gap-2`}>
        <span>registre complet dans l'app</span>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-0.5 text-[#2b4a8b] underline decoration-[#2b4a8b]/40 underline-offset-2 transition-colors hover:text-[#bf3415] hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
        >
          ouvrir
          <ArrowUpRight aria-hidden className="h-3 w-3" />
        </Link>
      </p>
    </SettleIn>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  ArchiveSection — the assembled rubrique, p.10
 *  Reading order: mast → lede (headline, byline, drop cap) + holdings →
 *  shelf + ledger (the centerpiece spread) → rectificatif + avis →
 *  classifieds → grep + pull quote → folio.
 * ════════════════════════════════════════════════════════════════════════════ */

function ArchiveSection() {
  return (
    <section
      id="archive"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 3400px" }}
    >
      <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-20 sm:px-8 sm:pt-28 lg:px-12">
        <SectionMast rubrique="Les archives" no="p.10" />

        {/* ── The lede ─────────────────────────────────────────────────── */}
        <div className="mt-12 grid gap-x-14 gap-y-10 lg:grid-cols-12">
          <div className="lg:col-span-7 xl:col-span-8">
            <p className={`${T.kicker} text-[#bf3415]`}>Sous-sol · rayon B · la morgue</p>
            <DeckReveal
              className="mt-4"
              lines={[
                <span
                  key="l1"
                  className="font-serif text-[clamp(2.2rem,5vw,4.2rem)] font-black leading-[0.98] tracking-tight text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  Down in the morgue,
                </span>,
                <span
                  key="l2"
                  className="font-serif text-[clamp(2.2rem,5vw,4.2rem)] font-black leading-[0.98] tracking-tight text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  <PenUnderline delay={0.7}>every edition</PenUnderline> keeps
                </span>,
                <span
                  key="l3"
                  className="font-serif text-[clamp(2.2rem,5vw,4.2rem)] font-black leading-[0.98] tracking-tight text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  its receipts.
                </span>,
              ]}
            />
            <Byline
              className="mt-6"
              name="Le service des archives"
              desk="Sous-sol, rayon B · registre № 12"
            />
            <div className="mt-6 max-w-[60ch]">
              <DropCapParagraph>
                Old newsrooms called the archive room the morgue, which slandered it —
                nothing in it was ever quite dead. Ours is livelier still. Each morning's
                report is filed the second the ink dries: the CSV that fed it, the queries
                that shaped it, the totals it swore by. Ask for le 9 juin and you receive
                le 9 juin — same rows, same réussite, same awkward dip at 16 h 04. Not a
                reconstruction. The edition itself.
              </DropCapParagraph>
              <p className={`${T.body} mt-4`}>
                Seven days are pictured below; three hundred and sixty-five wait on the
                shelf behind them. None has ever seen a network cable, and none ever will.
              </p>
            </div>
          </div>
          <div className="lg:col-span-5 xl:col-span-4">
            <ArchiveHoldings />
          </div>
        </div>

        {/* ── The centerpiece spread: shelf beside ledger ──────────────────
            The shelf wants air for its parallax drift, so it takes the wider
            column; the ledger reads like the facing page.               */}
        <div className="mt-16 grid gap-x-14 gap-y-14 lg:mt-20 lg:grid-cols-12">
          <div className="lg:col-span-6 xl:col-span-7">
            <ArchiveShelf />
          </div>
          <div className="lg:col-span-6 xl:col-span-5">
            <ArchiveLedger />
          </div>
        </div>

        {/* ── House rules & the call slip ───────────────────────────────────
            Doctrine on the left, a working prop on the right: the rules say
            "on ne réécrit pas", the slip shows someone reading v1 anyway —
            legally, locally, in 1,7 s.                                  */}
        <div className="mt-16 grid items-start gap-x-14 gap-y-10 lg:mt-20 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <ArchiveReglement />
          </div>
          <div className="lg:col-span-7 xl:col-span-6 xl:col-start-7">
            <ArchiveSlip />
          </div>
        </div>

        {/* ── Corrections & conservation ───────────────────────────────── */}
        <div className="mt-16 grid gap-x-10 gap-y-8 lg:mt-20 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <ArchiveRectificatif />
          </div>
          <div className="lg:col-span-5">
            <ArchiveRetention />
          </div>
        </div>

        {/* ── Classifieds — the archive desk advertises its services ────── */}
        <div className="mt-16 lg:mt-20">
          <SettleIn>
            <div className="flex items-center gap-4">
              <Rule className="flex-1" />
              <p className="font-grotesk text-[10px] font-black uppercase tracking-[0.3em] text-[#1c1914]">
                Petites annonces — service des archives
              </p>
              <Rule className="flex-1" />
            </div>
          </SettleIn>
          {/* sold by the centimetre, not the grid — three unequal columns */}
          <div className="mt-2 border-y border-[#d6ccb6] md:grid md:grid-cols-[1.15fr_1fr_0.92fr] md:divide-x md:divide-[#d6ccb6]">
            {ARCHIVE_ADS.map((ad, i) => (
              <ArchiveAd key={ad.no} ad={ad} index={i} />
            ))}
          </div>
        </div>

        {/* ── The close: proof, then the quote it proves ─────────────────── */}
        <div className="mt-16 grid items-center gap-x-14 gap-y-10 lg:mt-24 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <ArchiveGrep />
          </div>
          <div className="lg:col-span-6">
            <PullQuote cite="Le chef de la documentation">
              An archive you can grep beats a memory you can't.
            </PullQuote>
          </div>
        </div>

        {/* ── Cross-references — the archive indexes the rest of the paper ── */}
        <SettleIn className="mt-14 lg:mt-16">
          <p className={`${T.folio} flex flex-wrap items-center gap-x-2 gap-y-1`}>
            <span className="font-bold uppercase text-[#1c1914]">Voir aussi</span>
            <span aria-hidden>—</span>
            <a
              href="#lead"
              className="underline decoration-[#d6ccb6] underline-offset-2 transition-colors hover:text-[#bf3415] hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
            >
              La une, p.3 (le creux de 16 h 04)
            </a>
            <span aria-hidden>·</span>
            <a
              href="#workflow"
              className="underline decoration-[#d6ccb6] underline-offset-2 transition-colors hover:text-[#bf3415] hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
            >
              Les presses, p.5
            </a>
            <span aria-hidden>·</span>
            <a
              href="#capabilities"
              className="underline decoration-[#d6ccb6] underline-offset-2 transition-colors hover:text-[#bf3415] hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-[#bf3415]"
            >
              L'index des capacités, p.6
            </a>
          </p>
        </SettleIn>

        <FolioLine
          className="mt-8 border-t border-[#d6ccb6] pt-4"
          page="p.10"
          note="Registre vérifié ce matin à 06 h 12 · rien n'a quitté le poste"
        />
      </div>
    </section>
  );
}
