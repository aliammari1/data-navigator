/* ════════════════════════════════════════════════════════════════════════════
 *  §7 — THE CLASSIFIEDS · "PETITES ANNONCES" · #capabilities
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Every feature in the box, typeset as a dense classified-ads spread — the
 *  page of the paper nobody admits to reading first. The conceit: capability
 *  is sold by the line, like agate-type notices in a provincial daily.
 *
 *  Construction notes
 *  ──────────────────
 *  • The lattice is a real ruled grid: `gap-px` over an ink-tinted backdrop
 *    (`bg-[#1c1914]/15`) so every hairline is a shared press rule, not a
 *    per-card border that doubles up at seams.
 *  • Dense flow (`grid-flow-dense`) lets wide/tall/display ads punch holes in
 *    the column rhythm the way real display ads interrupt agate columns; the
 *    browser re-packs small notices around them.
 *  • Hover is mechanical, never soft: the plate lifts 1px up-left and an
 *    offset-print shadow appears underneath. Transform-only transition; the
 *    shadow snaps, as a metal plate would.
 *  • Vermilion is rationed to exactly three NOUVEAU stamps plus the pen's own
 *    marks inside the ink charts. Everything else is ink on paper.
 *  • All reveal motion goes through SettleIn (reduced-motion aware); no hooks
 *    are called anywhere inside a .map() body — every cell is a real component.
 * ════════════════════════════════════════════════════════════════════════════ */

/** Shared shape for every lucide glyph stored in ad data. */
type ClassifiedGlyph = typeof FileInput;

/** Lattice footprints. "banner" runs the full width of the spread. */
type ClassifiedSpan = "s" | "wide" | "tall" | "display" | "banner";

/** Bespoke content blocks some ads carry under their pitch line. */
type ClassifiedExtraKind =
  | "sql"
  | "nlq"
  | "formats"
  | "charter"
  | "keys"
  | "pmtiles"
  | "vad"
  | "briefing";

/** The four hand-set display ads with ink visuals. */
type ClassifiedDisplayKind = "report" | "gauge" | "forecast" | "geo";

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.0 — RUBRIQUES · the classified page's own taxonomy
 *  Five departments, numbered like a real petites-annonces page. The counts
 *  are real: 28 numbered feature notices file under exactly one rubrique each.
 * ──────────────────────────────────────────────────────────────────────────── */

const CLASSIFIED_RUBRIQUES = {
  donnees: {
    numeral: "I",
    label: "Données",
    count: 7,
    gloss: "intake, custody, lineage — the paper trail",
  },
  analyse: {
    numeral: "II",
    label: "Analyse",
    count: 8,
    gloss: "questions asked, answered, and shown working",
  },
  rapport: {
    numeral: "III",
    label: "Rapport",
    count: 5,
    gloss: "the morning's printed matter",
  },
  collaboration: {
    numeral: "IV",
    label: "Collaboration",
    count: 3,
    gloss: "the desk, multiplied across the office wire",
  },
  machine: {
    numeral: "V",
    label: "Machine",
    count: 5,
    gloss: "the press itself — local, silent, yours",
  },
} as const;

type ClassifiedRubriqueKey = keyof typeof CLASSIFIED_RUBRIQUES;

/** Reading order for the legend column. */
const CLASSIFIED_RUBRIQUE_ORDER: ReadonlyArray<ClassifiedRubriqueKey> = [
  "donnees",
  "analyse",
  "rapport",
  "collaboration",
  "machine",
];

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.1 — CELL DATA · the spread itself, in reading order
 *  One array, hand-ordered: small notices, display ads, house notices, one
 *  situation vacant and the tariff banner. grid-flow-dense re-packs around
 *  the spans, so the order here is rhythm, not strict geometry.
 * ──────────────────────────────────────────────────────────────────────────── */

type ClassifiedAdData = {
  kind: "ad";
  key: string;
  /** running agate index, typeset as № 01 … № 28 */
  no: string;
  rubrique: ClassifiedRubriqueKey;
  /** feature name — French, the product's own label */
  name: string;
  icon: ClassifiedGlyph;
  /** one-line serif pitch, dry newsroom voice */
  pitch: string;
  /** mono small-print contact line, as classifieds demand */
  smallPrint: string;
  span?: ClassifiedSpan;
  /** vermilion rubber stamp — rationed to three across the page */
  stamp?: string;
  /** bespoke content block rendered under the pitch */
  extra?: ClassifiedExtraKind;
  /** alternate paper tone for column rhythm */
  tone?: "paper" | "deep";
};

type ClassifiedNoticeData = {
  kind: "notice";
  key: string;
  /** AVIS / PERDU / À VENDRE — the immortal genres */
  genre: string;
  icon: ClassifiedGlyph;
  /** French lead phrase, set bold like a notice head */
  lead: string;
  /** English body, the joke delivered deadpan */
  body: string;
  smallPrint: string;
  span?: ClassifiedSpan;
};

type ClassifiedCellData =
  | ClassifiedAdData
  | ClassifiedNoticeData
  | { kind: "display"; key: string; display: ClassifiedDisplayKind; span: ClassifiedSpan }
  | { kind: "recruit"; key: string; span: ClassifiedSpan }
  | { kind: "tariff"; key: string; span: ClassifiedSpan };

const CLASSIFIED_CELLS: ReadonlyArray<ClassifiedCellData> = [
  {
    kind: "ad",
    key: "ad-01",
    no: "01",
    rubrique: "donnees",
    name: "Importation CSV · Parquet · JSON",
    icon: FileInput,
    pitch:
      "Drop the file at the gate. 2 147 380 rows are read, typed and seated before your coffee admits defeat.",
    smallPrint: "Réf. DN-01 · guichet des données, ouvert dès 5 h 58",
  },
  {
    kind: "ad",
    key: "ad-02",
    no: "02",
    rubrique: "donnees",
    name: "Profileur de colonnes",
    icon: Columns3,
    pitch:
      "Every column interrogated on arrival — types, nulls, cardinalités, outliers. None of them asked for a lawyer.",
    smallPrint: "Réf. DN-02 · procès-verbal fourni avec chaque fichier",
  },
  {
    kind: "ad",
    key: "ad-03",
    no: "03",
    rubrique: "analyse",
    name: "SQL DuckDB",
    icon: Database,
    pitch:
      "A full analytical engine lodged inside the application. Pays no rent, files no telemetry, answers in milliseconds.",
    smallPrint: "Réf. DN-03 · colonne vertébrale de la maison",
    span: "tall",
    extra: "sql",
  },
  {
    kind: "ad",
    key: "ad-04",
    no: "04",
    rubrique: "analyse",
    name: "Requêtes en français",
    icon: MessageSquareText,
    pitch:
      "Ask the question the way you would say it across the desk. The machine drafts the SQL — and shows its work.",
    smallPrint: "Réf. DN-04 · interprète assermenté, sans accent",
    span: "wide",
    extra: "nlq",
  },
  { kind: "display", key: "disp-report", display: "report", span: "display" },
  {
    kind: "ad",
    key: "ad-05",
    no: "05",
    rubrique: "analyse",
    name: "Constructeur visuel",
    icon: Blocks,
    pitch:
      "Queries assembled by hand, like type in a composing stick — no semicolon, no syntax sermon.",
    smallPrint: "Réf. DN-05 · recommandé aux mains prudentes",
    tone: "deep",
  },
  {
    kind: "ad",
    key: "ad-06",
    no: "06",
    rubrique: "donnees",
    name: "Pipelines de transformation",
    icon: Workflow,
    pitch:
      "Clean, join, derive, repeat. Every step is recorded like a press run and replayable to the letter.",
    smallPrint: "Réf. DN-06 · répétable à l'identique, sur demande",
  },
  {
    kind: "notice",
    key: "notice-perdu",
    genre: "Perdu",
    icon: SearchX,
    lead: "Une connexion internet,",
    body: "last seen loitering near the firewall. The machine has not noticed its absence. No reward is offered.",
    smallPrint: "S'abstenir de la rapporter.",
  },
  {
    kind: "ad",
    key: "ad-07",
    no: "07",
    rubrique: "donnees",
    name: "Lignée des données",
    icon: Network,
    pitch:
      "Every figure can name its parents, its grandparents and the file it was born in. Invaluable at audits.",
    smallPrint: "Réf. DN-07 · arbre généalogique sur demande",
  },
  {
    kind: "ad",
    key: "ad-08",
    no: "08",
    rubrique: "donnees",
    name: "Réconciliation",
    icon: Scale,
    pitch:
      "Two ledgers enter; one truth leaves. Discrepancies are printed in full, never quietly retired.",
    smallPrint: "Réf. DN-08 · litiges réglés au guichet n° 2",
  },
  { kind: "display", key: "disp-gauge", display: "gauge", span: "wide" },
  {
    kind: "ad",
    key: "ad-09",
    no: "09",
    rubrique: "donnees",
    name: "Historique des versions",
    icon: History,
    pitch:
      "Every edition kept on file. Yesterday's report cannot be rewritten — only consulted, as is proper.",
    smallPrint: "Réf. DN-09 · archives au sous-sol, classement sec",
  },
  {
    kind: "ad",
    key: "ad-10",
    no: "10",
    rubrique: "donnees",
    name: "Dossiers & tags",
    icon: FolderTree,
    pitch:
      "A filing system your future self will pretend was always this tidy. Labels in any language you keep.",
    smallPrint: "Réf. DN-10 · étiquettes à volonté",
    tone: "deep",
  },
  {
    kind: "ad",
    key: "ad-12",
    no: "12",
    rubrique: "rapport",
    name: "Briefing IA",
    icon: BrainCircuit,
    pitch:
      "The morning summary, drafted at your desk by a model that lives on your disk and has never been outside.",
    smallPrint: "Réf. DN-12 · rédigé sur place, chaque matin",
    extra: "briefing",
  },
  { kind: "display", key: "disp-forecast", display: "forecast", span: "wide" },
  {
    kind: "ad",
    key: "ad-16",
    no: "16",
    rubrique: "analyse",
    name: "Théâtre analytique",
    icon: Clapperboard,
    pitch:
      "Your investigation staged scene by scene, chart by chart. Applause optional; insight scheduled.",
    smallPrint: "Réf. DN-16 · séance privée, places illimitées",
    stamp: "Nouveau",
  },
  {
    kind: "ad",
    key: "ad-17",
    no: "17",
    rubrique: "rapport",
    name: "Studio de rapports",
    icon: Printer,
    pitch:
      "One report, four costumes. The committee receives PPTX; the archive keeps PDF; nobody retypes a line.",
    smallPrint: "Réf. DN-17 · presse à façon, tirage immédiat",
    span: "wide",
    extra: "formats",
  },
  {
    kind: "ad",
    key: "ad-18",
    no: "18",
    rubrique: "collaboration",
    name: "Collaboration LAN",
    icon: Cable,
    pitch:
      "Share the desk across the office wire — synchronised over the local network. The internet is not invited.",
    smallPrint: "Réf. DN-18 · le câble suffit",
  },
  {
    kind: "notice",
    key: "notice-avis",
    genre: "Avis",
    icon: Megaphone,
    lead: "À nos lecteurs —",
    body: "every figure on this page was computed on the premises. No byte crossed the property line during typesetting.",
    smallPrint: "Certifié par la rédaction.",
  },
  {
    kind: "ad",
    key: "ad-19",
    no: "19",
    rubrique: "collaboration",
    name: "Commentaires",
    icon: MessageCircle,
    pitch:
      "Margin notes for colleagues, threaded and filed with the data they question. The red pen, civilised.",
    smallPrint: "Réf. DN-19 · courrier interne uniquement",
    tone: "deep",
  },
  {
    kind: "ad",
    key: "ad-20",
    no: "20",
    rubrique: "collaboration",
    name: "Curseurs partagés",
    icon: MousePointer2,
    pitch: "Watch a colleague's cursor cross the same grid, live. Telepathy, by Ethernet.",
    smallPrint: "Réf. DN-20 · latence : celle du couloir",
    stamp: "Nouveau",
  },
  { kind: "display", key: "disp-geo", display: "geo", span: "wide" },
  {
    kind: "ad",
    key: "ad-21",
    no: "21",
    rubrique: "machine",
    name: "Palette de commandes",
    icon: Command,
    pitch:
      "Every command in the house, three keystrokes away. The mouse has filed a formal grievance.",
    smallPrint: "Réf. DN-21 · raccourci vers à peu près tout",
    extra: "keys",
  },
  {
    kind: "ad",
    key: "ad-22",
    no: "22",
    rubrique: "machine",
    name: "Mode hors ligne",
    icon: WifiOff,
    pitch:
      "Not a feature — a constitution. The application works precisely because nothing depends on a connection.",
    smallPrint: "Réf. DN-22 · en vigueur depuis la première édition",
    span: "tall",
    extra: "charter",
  },
  {
    kind: "ad",
    key: "ad-23",
    no: "23",
    rubrique: "rapport",
    name: "Voix — lecture du briefing",
    icon: AudioLines,
    pitch:
      "The morning briefing read aloud by a voice that occupies 82 Mo of disk and zero centimetres of cloud.",
    smallPrint: "Réf. DN-23 · diction locale garantie",
    stamp: "Nouveau",
  },
  {
    kind: "ad",
    key: "ad-24",
    no: "24",
    rubrique: "machine",
    name: "VAD — micro local",
    icon: Mic,
    pitch:
      "The microphone wakes only when addressed, and the audio never leaves the room it was spoken in.",
    smallPrint: "Réf. DN-24 · octets émis : 0, vérifié au compteur",
    extra: "vad",
    tone: "deep",
  },
  { kind: "recruit", key: "recruit", span: "tall" },
  {
    kind: "ad",
    key: "ad-25",
    no: "25",
    rubrique: "rapport",
    name: "Exports Excel",
    icon: FileSpreadsheet,
    pitch:
      "For the colleague who insists. Formatted .xlsx, formulas intact, dignity preserved on both sides.",
    smallPrint: "Réf. DN-25 · paix des ménages incluse",
  },
  {
    kind: "ad",
    key: "ad-26",
    no: "26",
    rubrique: "machine",
    name: "Cartes hors ligne PMTiles",
    icon: Layers,
    pitch:
      "The whole basemap in a single file on your disk. Geography, pre-delivered — zoom without asking anyone.",
    smallPrint: "Réf. DN-26 · le territoire livré en une pièce",
    extra: "pmtiles",
  },
  {
    kind: "ad",
    key: "ad-27",
    no: "27",
    rubrique: "analyse",
    name: "Moteur vecteurs LanceDB",
    icon: DatabaseZap,
    pitch:
      "Semantic search living beside your data — embeddings computed and kept on the premises, recall total.",
    smallPrint: "Réf. DN-27 · mémoire locale, rappel intégral",
    tone: "deep",
  },
  {
    kind: "ad",
    key: "ad-28",
    no: "28",
    rubrique: "machine",
    name: "Thème sombre & clair",
    icon: SunMoon,
    pitch:
      "A night-shift edition for the 23 h incident. The ink inverts; the principles do not.",
    smallPrint: "Réf. DN-28 · encre réversible, sans frais",
  },
  {
    kind: "notice",
    key: "notice-vendre",
    genre: "À vendre",
    icon: Tag,
    lead: "Rien.",
    body: "The software ships complete. There is no second counter, no premium edition, nothing kept behind the curtain.",
    smallPrint: "Prière de ne pas insister.",
  },
  { kind: "tariff", key: "tariff", span: "banner" },
];

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.2 — DISPLAY-AD DATA · the hand-set plates
 * ──────────────────────────────────────────────────────────────────────────── */

/** The eight tabs of the telecom report — the product's daily ritual. */
const CLASSIFIED_TABS = [
  { n: "1", fr: "vue d'ensemble", en: "the front page — totals, réussite, verdict" },
  { n: "2", fr: "canaux", en: "every channel weighed, ranked and judged" },
  { n: "3", fr: "analyse", en: "patterns, segments, and the reasons why" },
  { n: "4", fr: "données brutes", en: "the wire copy — every row, unedited" },
  { n: "5", fr: "période", en: "any date range, recomposed on demand" },
  { n: "6", fr: "journalier", en: "the day-by-day ledger, kept since day one" },
  { n: "7", fr: "historique", en: "past editions, filed and comparable" },
  { n: "8", fr: "configuration", en: "the typesetter's preferences, remembered" },
] as const;

/** Seven observed days, seven forecast days — drawn as one ink line. */
const CLASSIFIED_FORECAST_SERIES = [61, 63, 60, 66, 69, 65, 72, 70, 74, 78, 75, 81, 84, 88];

/** Where last night's failures kept their addresses. */
const CLASSIFIED_GEO_MARKERS = [
  { x: 0.3, y: 0.28, label: "TUN 41" },
  { x: 0.62, y: 0.6, label: "SFX 17" },
  { x: 0.45, y: 0.42, label: "SUS 9" },
] as const;

/** Report-studio output formats and who each one is really for. */
const CLASSIFIED_STUDIO_FORMATS = [
  { ext: "PDF", note: "pour les archives" },
  { ext: "DOCX", note: "pour la direction" },
  { ext: "PPTX", note: "pour le comité" },
  { ext: "XLSX", note: "pour la vérification" },
] as const;

/** Situations-vacant qualifications. The bar is precisely one installation. */
const CLASSIFIED_RECRUIT_QUALS = [
  "Curiosity, and availability at 6 h 12 — the report is ready before you are.",
  "French or SQL; the machine is fluent in both and patient in either.",
  "No cloud clearance required. There is no cloud.",
  "Must tolerate being right by breakfast.",
] as const;

/** The offline constitution, in three articles. Posted in the tall № 22 ad. */
const CLASSIFIED_CHARTER = [
  { art: "Art. 1", text: "Aucun octet sortant." },
  { art: "Art. 2", text: "Aucun octet entrant requis." },
  { art: "Art. 3", text: "En cas de doute, relire l'article premier." },
] as const;

/** Tariff banner columns — the page's standing terms of business. */
const CLASSIFIED_TARIFF_TERMS = [
  { term: "La ligne", value: "0 fr. 00" },
  { term: "Abonnement", value: "aucun" },
  { term: "Régie publicitaire", value: "non consultée" },
  { term: "Données personnelles", value: "non collectées" },
] as const;

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.3 — CARD CHROME · shared shell, header strip, small print
 * ──────────────────────────────────────────────────────────────────────────── */

/** Lattice footprint → Tailwind span classes. Base grid is 2-col; md 3; xl 4. */
const CLASSIFIED_SPAN_CLASS: Record<ClassifiedSpan, string> = {
  s: "col-span-1",
  wide: "col-span-2",
  tall: "col-span-1 row-span-2",
  display: "col-span-2 row-span-2",
  banner: "col-span-2 md:col-span-3 xl:col-span-4",
};

/**
 * Every cell shares this plate behaviour: paper surface, mechanical 1px lift
 * with an offset-print shadow on hover. transition-transform only — the
 * shadow snaps into place like a plate dropping onto the bed.
 */
function ClassifiedCardShell({
  children,
  tone = "paper",
  frame = false,
  className,
}: {
  children: ReactNode;
  tone?: "paper" | "deep" | "shade";
  /** inner hairline frame, the classic display-ad border-within-a-border */
  frame?: boolean;
  className?: string;
}) {
  const tones = {
    paper: "bg-[#f6f1e7]",
    deep: "bg-[#eee6d6]",
    shade: "bg-[#e4dac5]",
  } as const;
  return (
    <article
      className={`group relative flex h-full flex-col ${tones[tone]} transition-transform duration-150 ease-out hover:z-10 hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[5px_5px_0_#1c1914] ${className ?? ""}`}
    >
      {frame && (
        <div aria-hidden className="pointer-events-none absolute inset-[5px] border border-[#1c1914]/30" />
      )}
      {children}
    </article>
  );
}

/** Agate header strip: running № on the left, rubrique numeral on the right. */
function ClassifiedAdHeader({ no, rubrique }: { no: string; rubrique: ClassifiedRubriqueKey }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[#1c1914]">
        № {no}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#857c69]">
        rub. {CLASSIFIED_RUBRIQUES[rubrique].numeral}
      </span>
    </div>
  );
}

/** Bottom small-print row — every honest classified ends in a contact line. */
function ClassifiedSmallPrintRow({ text }: { text: string }) {
  return (
    <div className="mt-auto border-t border-[#d6ccb6] pt-2.5">
      <p className="font-mono text-[9px] leading-snug tracking-[0.04em] text-[#857c69]">{text}</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.4 — BESPOKE EXTRAS · the blocks that make certain ads worth the column
 *  Each is a few square centimetres of product truth: a real query, a real
 *  file, a real article of the offline constitution.
 * ──────────────────────────────────────────────────────────────────────────── */

function ClassifiedAdExtra({ kind }: { kind: ClassifiedExtraKind }) {
  switch (kind) {
    case "sql":
      // The tall № 03 ad earns its second row with an actual query and timing.
      return (
        <div className="mt-3 border border-[#d6ccb6] bg-[#eee6d6]/60 p-2.5">
          <pre className="overflow-x-auto font-mono text-[9.5px] leading-[1.6] text-[#1c1914]">
            {"SELECT canal,\n       count(*) AS échecs\nFROM   tx\nWHERE  statut = 'échec'\nGROUP  BY canal\nORDER  BY 2 DESC;"}
          </pre>
          <p className="mt-1.5 font-mono text-[8.5px] tracking-[0.06em] text-[#857c69]">
            -- 38 ms · 2,1 M lignes · 0 octet émis
          </p>
        </div>
      );
    case "nlq":
      // Question in, SQL out — the translation shown like a wire dispatch.
      return (
        <div className="mt-3 space-y-1.5">
          <p className="font-serif text-[13px] italic leading-snug text-[#1c1914]">
            « combien d'échecs sur le canal ORANGE hier soir ? »
          </p>
          <p className="truncate font-mono text-[9.5px] tracking-[0.02em] text-[#2b4a8b]">
            → SELECT count(*) FROM tx WHERE canal = 'ORANGE' AND statut = 'échec' …
          </p>
        </div>
      );
    case "formats":
      // Four chips, four audiences. The note under each is the real politics.
      return (
        <div className="mt-3 grid grid-cols-2 gap-px border border-[#d6ccb6] bg-[#d6ccb6] sm:grid-cols-4">
          {CLASSIFIED_STUDIO_FORMATS.map((f) => (
            <div key={f.ext} className="bg-[#f6f1e7] px-2 py-1.5 text-center">
              <span className="block font-mono text-[10px] font-bold tracking-[0.1em] text-[#1c1914]">
                .{f.ext}
              </span>
              <span className="block font-serif text-[9.5px] italic text-[#857c69]">{f.note}</span>
            </div>
          ))}
        </div>
      );
    case "charter":
      // The offline constitution. Three articles; the third is load-bearing.
      return (
        <div className="mt-3 space-y-2 border-l-2 border-[#1c1914] pl-3">
          {CLASSIFIED_CHARTER.map((a) => (
            <p key={a.art} className="font-serif text-[12.5px] leading-snug text-[#1c1914]">
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[#857c69]">
                {a.art} —{" "}
              </span>
              {a.text}
            </p>
          ))}
        </div>
      );
    case "keys":
      // Two keycaps, set like type sorts.
      return (
        <div className="mt-3 flex items-center gap-1.5" aria-hidden>
          <kbd className="inline-flex h-7 min-w-7 items-center justify-center border border-[#1c1914] bg-[#f6f1e7] px-1.5 font-mono text-[12px] text-[#1c1914] shadow-[2px_2px_0_#1c1914]">
            ⌘
          </kbd>
          <kbd className="inline-flex h-7 min-w-7 items-center justify-center border border-[#1c1914] bg-[#f6f1e7] px-1.5 font-mono text-[12px] text-[#1c1914] shadow-[2px_2px_0_#1c1914]">
            K
          </kbd>
          <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[#857c69]">
            et tout s'ouvre
          </span>
        </div>
      );
    case "pmtiles":
      // One file, one country. The whole point in a single mono line.
      return (
        <p className="mt-3 border border-dashed border-[#857c69]/50 px-2.5 py-1.5 font-mono text-[9.5px] tracking-[0.04em] text-[#4a4438]">
          tunisie.pmtiles · 412 Mo · zoom 0–14 · une seule pièce
        </p>
      );
    case "vad":
      // The audit line that matters. Zero is the feature.
      return (
        <p className="mt-3 font-mono text-[9.5px] tracking-[0.05em] text-[#4a4438]">
          trames analysées : <span className="text-[#1c1914]">sur place</span> · trames transmises :{" "}
          <span className="font-bold text-[#1c1914]">0</span>
        </p>
      );
    case "briefing":
      // A torn-off line of this morning's machine prose.
      return (
        <p className="mt-3 border-l-2 border-[#d6ccb6] pl-2.5 font-serif text-[12.5px] italic leading-snug text-[#4a4438]">
          « Trafic conforme à la moyenne du mois ; deux canaux méritent l'œil du rédacteur… »
        </p>
      );
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.5 — THE STANDARD AD · agate index, glyph, grotesk head, serif pitch
 * ──────────────────────────────────────────────────────────────────────────── */

function ClassifiedAdCard({ ad }: { ad: ClassifiedAdData }) {
  const Glyph = ad.icon;
  // Deterministic stamp tilt — index math, never Math.random (contract §13).
  const tilt = Math.sin(Number(ad.no) * 2.7) * 8;
  return (
    <ClassifiedCardShell tone={ad.tone ?? "paper"} className="p-4 sm:p-5">
      <ClassifiedAdHeader no={ad.no} rubrique={ad.rubrique} />
      <Glyph aria-hidden className="mt-3 h-[18px] w-[18px] text-[#1c1914]" strokeWidth={1.75} />
      <h3
        className={`mt-2 font-grotesk text-[14px] font-extrabold uppercase leading-[1.18] tracking-[0.04em] text-[#1c1914] ${ad.stamp ? "pr-14" : ""}`}
      >
        {ad.name}
      </h3>
      <p className="mt-1.5 font-serif text-[13.5px] italic leading-[1.5] text-[#4a4438]">
        {ad.pitch}
      </p>
      {ad.extra && <ClassifiedAdExtra kind={ad.extra} />}
      <div className="pt-3" />
      <ClassifiedSmallPrintRow text={ad.smallPrint} />
      {ad.stamp && (
        <span className="absolute right-2.5 top-2.5 origin-top-right scale-[0.72]">
          <Stamp tilt={tilt}>{ad.stamp}</Stamp>
        </span>
      )}
    </ClassifiedCardShell>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.6 — DISPLAY ADS · the four hand-set plates with ink visuals
 *  Bigger serif voice, inner hairline frame, one ink graphic apiece. These
 *  interrupt the agate columns the way paid display always has.
 * ──────────────────────────────────────────────────────────────────────────── */

/** № 11 — the telecom report, the product's reason to exist. 2×2 plate. */
function ClassifiedDisplayReport() {
  return (
    <ClassifiedCardShell frame className="p-5 sm:p-6">
      <div className="relative z-[1] flex h-full flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[#1c1914]">
            № 11
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#857c69]">
            rub. III — rapport
          </span>
        </div>
        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <Newspaper aria-hidden className="h-5 w-5 text-[#1c1914]" strokeWidth={1.6} />
            <h3 className="mt-2 font-serif text-[clamp(1.45rem,2.6vw,2rem)] font-bold leading-[1.04] tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              Le rapport télécom
            </h3>
          </div>
          <span className="mt-1 shrink-0 origin-top-right scale-[0.85]">
            <Stamp color={STAMP_GREEN} tilt={5}>
              Édition du jour
            </Stamp>
          </span>
        </div>
        <p className="mt-2.5 max-w-prose font-serif text-[14.5px] italic leading-[1.55] text-[#4a4438]">
          The entire morning ritual in eight tabs — from raw rows at 6 h 02 to a verdict you can
          sign by 6 h 12. Composed daily from DailyTransactions.csv, witnessed by no server.
        </p>
        {/* The eight tabs, set as an agate index with hairline rules. */}
        <ul className="mt-4 divide-y divide-[#d6ccb6] border-y border-[#d6ccb6]">
          {CLASSIFIED_TABS.map((tab) => (
            <li key={tab.n} className="flex items-baseline gap-2.5 py-[5px]">
              <span className="w-3 shrink-0 font-mono text-[9.5px] font-semibold text-[#bf3415]">
                {tab.n}
              </span>
              <span className="shrink-0 font-grotesk text-[11px] font-bold uppercase tracking-[0.08em] text-[#1c1914]">
                {tab.fr}
              </span>
              <span aria-hidden className="hidden flex-1 border-b border-dotted border-[#857c69]/50 sm:block" />
              <span className="hidden truncate font-serif text-[11.5px] italic text-[#857c69] sm:block">
                {tab.en}
              </span>
            </li>
          ))}
        </ul>
        <div className="pt-3" />
        <ClassifiedSmallPrintRow text="Paraît chaque matin à 6 h 12 · tirage : un exemplaire — le vôtre" />
      </div>
    </ClassifiedCardShell>
  );
}

/** № 13 — anomaly detection, with the instrument that caught last night. */
function ClassifiedDisplayGauge() {
  return (
    <ClassifiedCardShell frame className="p-5 sm:p-6">
      <div className="relative z-[1] flex h-full flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[#1c1914]">
            № 13
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#857c69]">
            rub. II — analyse
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-start gap-4 sm:flex-nowrap">
          <div className="min-w-0 flex-1">
            <Siren aria-hidden className="h-5 w-5 text-[#1c1914]" strokeWidth={1.6} />
            <h3 className="mt-2 font-serif text-[clamp(1.25rem,2.2vw,1.6rem)] font-bold leading-[1.05] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              Détection d'anomalies
            </h3>
            <p className="mt-2 font-serif text-[13.5px] italic leading-[1.5] text-[#4a4438]">
              When 97,4 % slips to 91,2 % at 23 h, the red pen finds it before you find your
              coffee.
            </p>
          </div>
          <div className="w-28 shrink-0 sm:w-32">
            <InkGauge value={91.2} label="réussite · 11 juin, 23 h" className="w-full" />
          </div>
        </div>
        <p className="mt-3 font-mono text-[9px] tracking-[0.06em] text-[#857c69]">
          seuil d'alerte : 95,0 % · écart signalé : z = 3,4 · délai : 14 min après l'évènement
        </p>
        <div className="pt-3" />
        <ClassifiedSmallPrintRow text="Réf. DN-13 · veilleur de nuit, ne dort jamais" />
      </div>
    </ClassifiedCardShell>
  );
}

/** № 14 — forecasting; seven observed days, seven drawn in advance. */
function ClassifiedDisplayForecast() {
  return (
    <ClassifiedCardShell frame className="p-5 sm:p-6">
      <div className="relative z-[1] flex h-full flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[#1c1914]">
            № 14
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#857c69]">
            rub. II — analyse
          </span>
        </div>
        <div className="mt-3 flex items-start gap-3">
          <TrendingUp aria-hidden className="mt-1 h-5 w-5 shrink-0 text-[#1c1914]" strokeWidth={1.6} />
          <div>
            <h3 className="font-serif text-[clamp(1.25rem,2.2vw,1.6rem)] font-bold leading-[1.05] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              Prévisions
            </h3>
            <p className="mt-1.5 font-serif text-[13.5px] italic leading-[1.5] text-[#4a4438]">
              Tomorrow's traffic, drawn tonight. The crystal ball is a state-space model, and it
              keeps receipts.
            </p>
          </div>
        </div>
        <div className="mt-3 h-16">
          <InkLine data={CLASSIFIED_FORECAST_SERIES} markIndex={13} h={70} duration={1.5} />
        </div>
        <p className="mt-1.5 font-mono text-[9px] tracking-[0.06em] text-[#857c69]">
          volumes J−7 … J+7 · intervalle de confiance 95 % · le point cerclé est demain
        </p>
        <div className="pt-3" />
        <ClassifiedSmallPrintRow text="Réf. DN-14 · l'avenir, sous presse dès ce soir" />
      </div>
    </ClassifiedCardShell>
  );
}

/** № 15 — geographic analysis; failures, mapped without leaving the desk. */
function ClassifiedDisplayGeo() {
  return (
    <ClassifiedCardShell frame className="p-5 sm:p-6">
      <div className="relative z-[1] flex h-full flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[#1c1914]">
            № 15
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#857c69]">
            rub. II — analyse
          </span>
        </div>
        <div className="mt-3 flex items-start gap-3">
          <Map aria-hidden className="mt-1 h-5 w-5 shrink-0 text-[#1c1914]" strokeWidth={1.6} />
          <div>
            <h3 className="font-serif text-[clamp(1.25rem,2.2vw,1.6rem)] font-bold leading-[1.05] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              Analyse géographique
            </h3>
            <p className="mt-1.5 font-serif text-[13.5px] italic leading-[1.5] text-[#4a4438]">
              Failures keep addresses. The map prints them — offline, naturally; the geography is
              already in the building.
            </p>
          </div>
        </div>
        <div className="mt-3 h-24 sm:h-28">
          <InkDotMap markers={CLASSIFIED_GEO_MARKERS} />
        </div>
        <p className="mt-1.5 font-mono text-[9px] tracking-[0.06em] text-[#857c69]">
          échecs par gouvernorat · nuit du 11 juin · fond de carte : voir annonce № 26
        </p>
        <div className="pt-3" />
        <ClassifiedSmallPrintRow text="Réf. DN-15 · cartographe de service, sans réseau" />
      </div>
    </ClassifiedCardShell>
  );
}

/** Dispatch table for the display plates — keeps ClassifiedCell flat. */
function ClassifiedDisplayAd({ display }: { display: ClassifiedDisplayKind }) {
  switch (display) {
    case "report":
      return <ClassifiedDisplayReport />;
    case "gauge":
      return <ClassifiedDisplayGauge />;
    case "forecast":
      return <ClassifiedDisplayForecast />;
    case "geo":
      return <ClassifiedDisplayGeo />;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.7 — HOUSE NOTICES, THE VACANCY, THE TARIFF
 *  The furniture that makes a classified page a classified page: small
 *  notices in the old genres, one situation vacant, and the standing terms.
 * ──────────────────────────────────────────────────────────────────────────── */

/** PERDU / AVIS / À VENDRE — deadpan house notices on deeper paper. */
function ClassifiedNoticeCard({ notice }: { notice: ClassifiedNoticeData }) {
  const Glyph = notice.icon;
  return (
    <ClassifiedCardShell tone="deep" className="p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Glyph aria-hidden className="h-3.5 w-3.5 text-[#1c1914]" strokeWidth={1.75} />
        <span className="font-grotesk text-[11px] font-black uppercase tracking-[0.22em] text-[#1c1914]">
          {notice.genre}
        </span>
        <span aria-hidden className="flex-1 border-b border-dotted border-[#857c69]/50" />
      </div>
      <p className="mt-3 font-serif text-[14px] leading-[1.5] text-[#1c1914]">
        <strong className="font-bold">{notice.lead}</strong>{" "}
        <span className="italic text-[#4a4438]">{notice.body}</span>
      </p>
      <div className="pt-3" />
      <ClassifiedSmallPrintRow text={notice.smallPrint} />
    </ClassifiedCardShell>
  );
}

/** № 29 — the only ad on the page that leads anywhere: to /signup. */
function ClassifiedRecruitCard() {
  return (
    <ClassifiedCardShell frame className="p-4 sm:p-5">
      <div className="relative z-[1] flex h-full flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] font-semibold tracking-[0.08em] text-[#1c1914]">
            № 29
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#857c69]">
            offres d'emploi
          </span>
        </div>
        <PenLine aria-hidden className="mt-3 h-[18px] w-[18px] text-[#1c1914]" strokeWidth={1.75} />
        <h3 className="mt-2 pr-12 font-serif text-[clamp(1.15rem,2vw,1.45rem)] font-bold leading-[1.08] text-[#1c1914] [font-variation-settings:'WONK'_1]">
          Recherche : votre prochain analyste
        </h3>
        <p className="mt-2 font-serif text-[13.5px] italic leading-[1.5] text-[#4a4438]">
          The position opens the moment the software is installed. Prior clairvoyance is not
          required; the forecasts are handled in-house.
        </p>
        <ul className="mt-3 space-y-1.5">
          {CLASSIFIED_RECRUIT_QUALS.map((q) => (
            <li key={q} className="flex gap-2 font-serif text-[12px] leading-snug text-[#4a4438]">
              <span aria-hidden className="mt-[7px] h-px w-3 shrink-0 bg-[#1c1914]" />
              {q}
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-4">
          <Link
            href="/signup"
            className="group/cta inline-flex items-center gap-2 border-2 border-[#1c1914] bg-[#1c1914] px-4 py-2.5 font-grotesk text-[11px] font-bold uppercase tracking-[0.16em] text-[#f6f1e7] shadow-[3px_3px_0_#bf3415] transition-transform hover:-translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]"
          >
            S'adresser au bureau
            <ArrowUpRight
              aria-hidden
              className="h-3.5 w-3.5 transition-transform group-hover/cta:-translate-y-0.5 group-hover/cta:translate-x-0.5"
            />
          </Link>
          <p className="mt-2.5 font-mono text-[9px] tracking-[0.04em] text-[#857c69]">
            Réf. DN-29 · poste pourvu en 4 min, papiers compris
          </p>
        </div>
        <span className="absolute right-0 top-7 origin-top-right scale-[0.72]">
          <Stamp color={STAMP_GREEN} tilt={-7}>
            Poste ouvert
          </Stamp>
        </span>
      </div>
    </ClassifiedCardShell>
  );
}

/** The standing terms of business — a full-width banner closing the spread. */
function ClassifiedTariffCard() {
  return (
    <ClassifiedCardShell tone="shade" className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
        <div className="shrink-0">
          <span className="font-grotesk text-[12px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
            Tarif des annonces
          </span>
          <p className="mt-1 font-serif text-[12.5px] italic leading-snug text-[#4a4438]">
            Composed locally by the press in your machine, for an audience of exactly one.
          </p>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-px border border-[#1c1914]/25 bg-[#1c1914]/20 lg:grid-cols-4">
          {CLASSIFIED_TARIFF_TERMS.map((t) => (
            <div key={t.term} className="bg-[#e4dac5] px-3 py-2.5">
              <span className="block font-mono text-[8.5px] uppercase tracking-[0.16em] text-[#857c69]">
                {t.term}
              </span>
              <span className="mt-0.5 block font-mono text-[11px] font-bold tabular-nums text-[#1c1914]">
                {t.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ClassifiedCardShell>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.8 — THE LATTICE · cell dispatcher + ruled grid + crop marks
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * One grid cell. A real component (never a bare .map() closure) so SettleIn's
 * hooks run legally. The stagger delay is derived from the cell's index in
 * reading order — rows of the lattice surface in small typeset waves.
 */
function ClassifiedCell({ cell, index }: { cell: ClassifiedCellData; index: number }) {
  const span = CLASSIFIED_SPAN_CLASS[("span" in cell && cell.span) || "s"];
  const delay = (index % 4) * 0.05;
  let face: ReactNode;
  switch (cell.kind) {
    case "ad":
      face = <ClassifiedAdCard ad={cell} />;
      break;
    case "display":
      face = <ClassifiedDisplayAd display={cell.display} />;
      break;
    case "notice":
      face = <ClassifiedNoticeCard notice={cell} />;
      break;
    case "recruit":
      face = <ClassifiedRecruitCard />;
      break;
    case "tariff":
      face = <ClassifiedTariffCard />;
      break;
  }
  return (
    <SettleIn delay={delay} y={14} className={`${span} h-full`}>
      {face}
    </SettleIn>
  );
}

/** Printer's crop marks at the corners of the classified forme. */
function ClassifiedCropMarks() {
  const corner = "absolute block h-4 w-4 border-[#1c1914]/40";
  return (
    <div aria-hidden className="pointer-events-none absolute -inset-[14px] hidden lg:block">
      <span className={`${corner} left-0 top-0 border-l border-t`} />
      <span className={`${corner} right-0 top-0 border-r border-t`} />
      <span className={`${corner} bottom-0 left-0 border-b border-l`} />
      <span className={`${corner} bottom-0 right-0 border-b border-r`} />
    </div>
  );
}

/**
 * The ruled lattice. `gap-px` over an ink-tinted ground draws every interior
 * hairline exactly once; the outer border closes the forme. Dense flow packs
 * agate notices around the display plates.
 */
function ClassifiedGrid() {
  return (
    <div className="relative">
      <ClassifiedCropMarks />
      {/* Compositor's running label in the far margin — wide presses only. */}
      <div aria-hidden className="absolute -left-12 top-1/2 hidden -translate-y-1/2 2xl:block">
        <span className="rotate-180 font-mono text-[10px] uppercase tracking-[0.3em] text-[#857c69] [writing-mode:vertical-rl]">
          Petites annonces · p. 5 · {EDITION.datelineShort}
        </span>
      </div>
      <div className="grid auto-rows-[minmax(8.5rem,auto)] grid-cols-2 grid-flow-dense gap-px border border-[#1c1914]/25 bg-[#1c1914]/15 md:grid-cols-3 xl:grid-cols-4">
        {CLASSIFIED_CELLS.map((cell, i) => (
          <ClassifiedCell key={cell.key} cell={cell} index={i} />
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.9 — PAGE FURNITURE · mast, deck, legend, tariff strip, small print
 * ──────────────────────────────────────────────────────────────────────────── */

/** The page's standing header strip — terms posted above the columns. */
function ClassifiedTariffStrip() {
  return (
    <SettleIn delay={0.15}>
      <div className="flex divide-x divide-[#d6ccb6] border-y-2 border-[#1c1914]">
        <div className="flex-1 px-3 py-2 text-center">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#4a4438]">
            Tarif — la ligne : <strong className="text-[#1c1914]">0 fr. 00</strong>
          </span>
        </div>
        <div className="hidden flex-1 px-3 py-2 text-center sm:block">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#4a4438]">
            Abonnement — <strong className="text-[#1c1914]">aucun</strong>
          </span>
        </div>
        <div className="hidden flex-1 px-3 py-2 text-center md:block">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#4a4438]">
            Pistage — <strong className="text-[#1c1914]">non pratiqué</strong>
          </span>
        </div>
        <div className="flex-1 px-3 py-2 text-center">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#4a4438]">
            Renseignements — <strong className="text-[#1c1914]">guichet ⌘K</strong>
          </span>
        </div>
      </div>
    </SettleIn>
  );
}

/** Index of rubriques with dotted leaders — the page's own table of contents. */
function ClassifiedLegend() {
  return (
    <SettleIn delay={0.2}>
      <div className="border border-[#1c1914]/30 bg-[#eee6d6] p-4 sm:p-5">
        <p className="font-grotesk text-[10px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
          Index des rubriques
        </p>
        <Rule className="mt-2.5" />
        <ul className="mt-3 space-y-3">
          {CLASSIFIED_RUBRIQUE_ORDER.map((key) => (
            <li key={key}>
              <div className="flex items-baseline gap-2">
                <span className="w-4 shrink-0 font-mono text-[10px] font-semibold text-[#bf3415]">
                  {CLASSIFIED_RUBRIQUES[key].numeral}.
                </span>
                <span className="font-grotesk text-[12px] font-bold uppercase tracking-[0.08em] text-[#1c1914]">
                  {CLASSIFIED_RUBRIQUES[key].label}
                </span>
                <span aria-hidden className="mx-1 flex-1 border-b border-dotted border-[#857c69]/60" />
                <span className="font-mono text-[10px] tabular-nums text-[#4a4438]">
                  {CLASSIFIED_RUBRIQUES[key].count} annonces
                </span>
              </div>
              <p className="ml-6 mt-0.5 font-serif text-[11.5px] italic leading-snug text-[#857c69]">
                {CLASSIFIED_RUBRIQUES[key].gloss}
              </p>
            </li>
          ))}
        </ul>
        <Rule className="mt-4" />
        <p className="mt-2.5 font-mono text-[9px] tracking-[0.06em] text-[#857c69]">
          29 annonces numérotées · 3 avis · 1 poste à pourvoir
        </p>
      </div>
    </SettleIn>
  );
}

/** Mast, deck headline, standfirst and the legend column. */
function ClassifiedHeader() {
  return (
    <div>
      <SectionMast rubrique="Petites annonces — tout ce que la machine sait faire" no="P. 5" />
      <div className="mt-10 grid gap-10 md:mt-14 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7 xl:col-span-8">
          <DeckReveal
            lines={[
              <span key="l1">Everything the machine does,</span>,
              <span key="l2">
                sold <PenUnderline delay={0.55}>by the line</PenUnderline>.
              </span>,
            ]}
            className="font-serif text-[clamp(2.1rem,4.8vw,3.9rem)] font-semibold leading-[1.02] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
          />
          <SettleIn delay={0.25} className="mt-6 max-w-2xl">
            <p className="font-serif text-[16.5px] leading-[1.62] text-[#4a4438]">
              Twenty-eight numbered features, three house notices and one situation vacant — the
              complete inventory of the box, set in agate type. No agency took a commission, no
              pixel took a note. The classifieds, like the rest of the paper, keep their distance.
            </p>
          </SettleIn>
          <SettleIn delay={0.35} className="mt-5">
            <p className={T.folio}>
              Paru le {EDITION.dateline} · composition locale · {EDITION.rows} lignes au marbre
            </p>
          </SettleIn>
        </div>
        <div className="lg:col-span-5 xl:col-span-4">
          <ClassifiedLegend />
          <MarginNote className="mt-5 w-full max-w-[15rem]">
            le lecteur notera qu'aucune de ces annonces ne mène hors de la machine. — l'éd.
          </MarginNote>
        </div>
      </div>
      <div className="mt-10 md:mt-12">
        <ClassifiedTariffStrip />
      </div>
    </div>
  );
}

/**
 * Closing small print — set in two newspaper columns on wider presses, signed
 * by the desk. Doubles as the section's plain-language privacy statement.
 */
function ClassifiedSmallPrint() {
  return (
    <SettleIn className="mt-10 md:mt-12">
      <div className="border-t border-[#d6ccb6] pt-5">
        <p className="gap-8 text-justify font-serif text-[11.5px] leading-[1.7] text-[#857c69] md:columns-2">
          The management reminds readers that every notice on this page describes equipment
          already in the box — nothing is sold separately, nothing expires, and no salesman will
          call, principally because the software has no way of telling anyone you exist. Notices
          are composed by the press in your machine, for an audience of exactly one. Claims of
          speed refer to a mid-range desk machine on an ordinary Tuesday; your Tuesday may vary.
          The classifieds department accepts corrections in the margin, in pencil, as is proper.
          Complaints may be addressed to the editor, who is also the only person able to read
          them — the page does not phone home, and the post-box is yours.
        </p>
        <p className="mt-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#857c69]">
          — Le bureau des petites annonces, {EDITION.city}
        </p>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §7.10 — SECTION ROOT
 * ──────────────────────────────────────────────────────────────────────────── */

function ClassifiedSection() {
  return (
    <section
      id="capabilities"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 4400px" }}
    >
      <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32 lg:px-10">
        <ClassifiedHeader />
        <div className="mt-12 md:mt-16">
          <ClassifiedGrid />
        </div>
        <ClassifiedSmallPrint />
        <SettleIn className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className={T.folio}>
              Suite des rubriques en page 6 — le moteur · réclamations :{" "}
              <InkLink href="#faq">courrier des lecteurs, p. 15</InkLink>
            </p>
            <Stamp color={STAMP_GREEN} tilt={4} className="hidden sm:inline-block">
              Lu et approuvé
            </Stamp>
          </div>
          <Rule className="mt-6" />
          <FolioLine
            page="P. 5"
            note="Aucune annonce ne vous suit à la trace."
            className="mt-3"
          />
        </SettleIn>
      </div>
    </section>
  );
}
