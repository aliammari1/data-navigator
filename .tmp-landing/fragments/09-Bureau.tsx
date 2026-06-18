/* ════════════════════════════════════════════════════════════════════════════
 *  §9 — BUREAU · L'ENTRETIEN — NOTRE CORRESPONDANT LOCAL                  p. 7
 *  ────────────────────────────────────────────────────────────────────────────
 *  The embedded offline AI, covered the only way a newspaper knows how: with
 *  an interview. The subject is "le correspondant local" — a language model
 *  that lives in a worker process next to DuckDB, reads the day's two million
 *  transactions, and writes the morning briefing without ever touching a wire.
 *
 *  Design intent
 *  ─────────────
 *  • Print grammar of the interview page: bold grotesk "Q —" questions, serif
 *    answers behind a hairline gutter rule, a halftone portrait plate where
 *    the photograph would be (the subject refused — no camera, no network),
 *    a "FICHE TECHNIQUE" sidebar interrupting the transcript exactly the way
 *    a broadsheet drops a spec box mid-article.
 *  • Motion: TypeOn sets the first answer like hot type; later answers rise
 *    from their clip lines; the press badge parallax-rotates over the
 *    portrait; timing bars and matrix cells grow with transform-only scales.
 *    Everything respects prefers-reduced-motion.
 *  • Vermilion is the editor's pen, spent only where it earns its keep: the
 *    press badge, two stamps, one anomalous matrix cell, one struck-out
 *    "API key", and the correspondent's own 2,4 s of writing time.
 *  • Copy: English editorial voice asking, the subject answering in the
 *    bilingual shorthand of the newsroom it serves. Organic numbers
 *    throughout (2 147 380 · 91,2 % · 9,4 s · 16 h 04).
 * ════════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.1 — COPY & DATA · the transcript, the morning matrix, the spec sheet
 *  All values are deterministic editorial data — no Math.random, no Date.
 * ──────────────────────────────────────────────────────────────────────────── */

type BureauQAFigure = "matrix" | "timing" | "findings";

type BureauQAItem = {
  /** running number printed in the question gutter — "01 / 05" */
  no: string;
  /** bold grotesk question, FR/EN mixed exactly as asked in the room */
  question: string;
  /** quoted opening of the answer; the first one is set by TypeOn */
  lead: string;
  /** follow-up paragraphs, serif, each with a stable key for React */
  rest: ReadonlyArray<{ id: string; body: ReactNode }>;
  /** optional figure plate printed under the answer */
  figure?: BureauQAFigure;
  /** optional rubber stamp slammed under the lead quote */
  stamp?: string;
  /** optional pencilled note floated into the outer margin on large screens */
  margin?: ReactNode;
};

/** The transcript. Five questions; the subject never left its post. */
const BUREAU_INTERVIEW: ReadonlyArray<BureauQAItem> = [
  {
    no: "01 / 05",
    question: "Where do you live, exactly?",
    lead: "Dans le processus de travail, à côté de DuckDB. Pas de datacenter.",
    margin: "Il a prononcé « datacenter » comme on parle d'un lointain cousin, jamais rencontré.",
    rest: [
      {
        id: "voisinage",
        body: (
          <>
            A worker process, third door on the left. DuckDB keeps the ledgers next door — we share
            a wall and a memory budget, and neither of us has ever seen a datacenter from the
            inside. The rent is a few gigaoctets; the landlord is your task manager.{" "}
            <em>Il peut me mettre dehors d'un clic. Je pars sans faire d'histoires</em> — and I am
            back at the next démarrage, coat still on the hook.
          </>
        ),
      },
      {
        id: "adresse",
        body: (
          <>
            No street address beyond that. There is no region to select, no availability zone,{" "}
            <em>aucun contrat de niveau de service</em>. The availability zone is your desk, and it
            is remarkably available.
          </>
        ),
      },
    ],
  },
  {
    no: "02 / 05",
    question: "Que lisez-vous le matin ?",
    lead: "Les KPI du jour, avant le café. La matrice canal × région, en entier.",
    figure: "matrix",
    rest: [
      {
        id: "journal",
        body: (
          <>
            Two million rows is a normal morning paper here —{" "}
            <span className="font-mono text-[0.92em] tabular-nums">2 147 380</span> hier, pour être
            exact. DuckDB hands me the agrégats the way one hands over a revue de presse: réussite
            par canal, volumes par région, latences qui s'égarent. I read for the line that does not
            sit straight.
          </>
        ),
      },
      {
        id: "matrice",
        body: (
          <>
            The matrix below is this morning's reading, printed as received. One cell refused to sit
            straight. <em>J'y reviendrai.</em>
          </>
        ),
      },
    ],
  },
  {
    no: "03 / 05",
    question: "What is it you never do?",
    lead: "Téléphoner. Le réseau, ce n'est pas mon rayon.",
    stamp: "0 octet sortant",
    rest: [
      {
        id: "rayon",
        body: (
          <>
            No calls out, no callbacks, no quiet little sync with a server at{" "}
            <span className="font-mono text-[0.92em] tabular-nums">3 h</span> du matin. My beat is
            the desk: I read what is on it and I say what it means. Anything that needs a wire is
            someone else's rubrique — and <em>entre nous</em>, ce bureau se porte très bien sans
            téléphone.
          </>
        ),
      },
    ],
  },
  {
    no: "04 / 05",
    question: "How fast are you, honestly?",
    lead: "Le briefing du matin sort en 9,4 secondes. Chronométré par des gens méfiants, deux fois.",
    figure: "timing",
    margin:
      "Les 6 s de démarrage ? « Le temps d'accrocher mon manteau. » Nous n'avons pas vu de manteau.",
    rest: [
      {
        id: "chrono",
        body: (
          <>
            The cold start costs <span className="font-mono text-[0.92em] tabular-nums">6 s</span> —
            the time it takes to hang up my coat. After that I am at my desk, and the chronometer
            below is public. La rédaction proprement dite — ma part — tient en{" "}
            <span className="font-mono text-[0.92em] tabular-nums">2,4 s</span>. Le reste, c'est la
            mécanique du journal.
          </>
        ),
      },
    ],
  },
  {
    no: "05 / 05",
    question: "Et qu'avez-vous trouvé aujourd'hui ?",
    lead: "Trois choses. Une seule mérite la une.",
    figure: "findings",
    rest: [
      {
        id: "carnet",
        body: (
          <>
            Le carnet du jour, tel quel. The first entry went to the front page before this
            interview was over — <em>un correspondant n'attend pas qu'on le félicite.</em>
          </>
        ),
      },
    ],
  },
];

/** Column heads of the morning matrix — French region codes, newsroom style. */
const BUREAU_MATRIX_REGIONS = ["TUN", "SFX", "SOU", "BIZ", "GAB", "KAI"] as const;

type BureauMatrixRow = {
  canal: string;
  /** réussite (%) per region, in BUREAU_MATRIX_REGIONS order */
  cells: ReadonlyArray<number>;
  /** row mean, pre-typeset with the French comma */
  moy: string;
  /** index of the cell the editor circled — the day's anomaly */
  hot?: number;
};

/**
 * Réussite (%) par canal × région — the correspondent's morning reading.
 * SMS × SFX is the story: 91,2 % against a 97,4 % day average (− 6,2 pts),
 * which is exactly the investigation running in the Lead section (#lead).
 */
const BUREAU_MATRIX_ROWS: ReadonlyArray<BureauMatrixRow> = [
  { canal: "Voix", cells: [97.8, 96.9, 97.2, 96.4, 95.8, 96.1], moy: "96,7" },
  { canal: "SMS", cells: [98.1, 91.2, 97.6, 97.0, 96.3, 96.8], moy: "96,2", hot: 1 },
  { canal: "Données", cells: [96.2, 95.7, 96.0, 94.9, 94.1, 95.3], moy: "95,4" },
  { canal: "USSD", cells: [99.0, 98.4, 98.7, 97.9, 98.1, 98.5], moy: "98,4" },
  { canal: "Recharge", cells: [97.5, 96.8, 97.1, 96.2, 95.9, 96.6], moy: "96,7" },
];

type BureauTimingRowData = {
  id: string;
  label: string;
  /** seconds, summing to 9,4 */
  s: number;
  note: string;
  /** the correspondent's own share — printed in vermilion */
  hot?: boolean;
};

/** The public chronometer: from CSV on the desk to a finished briefing. */
const BUREAU_TIMING: ReadonlyArray<BureauTimingRowData> = [
  { id: "lecture", label: "lecture du CSV", s: 1.8, note: "2,1 M de lignes, flux direct" },
  { id: "agregats", label: "agrégats DuckDB", s: 2.6, note: "matrices canal × région" },
  { id: "anomalies", label: "détection d'anomalies", s: 1.7, note: "seuils + saisonnalité" },
  {
    id: "redaction",
    label: "rédaction du briefing",
    s: 2.4,
    note: "inférence locale, Q4",
    hot: true,
  },
  { id: "mise-en-page", label: "mise en page", s: 0.9, note: "gabarit du matin" },
];

/** Total of the chronometer, kept as one constant so copy and figure agree. */
const BUREAU_TIMING_TOTAL = 9.4;

type BureauSpecRow = { k: string; v: string; mark?: string };
type BureauSpecGroup = {
  id: string;
  group: string;
  icon: ReactNode;
  rows: ReadonlyArray<BureauSpecRow>;
};

/**
 * FICHE TECHNIQUE — the spec box a broadsheet would drop mid-interview.
 * Grouped the way the production desk thinks: engine, model, machine, network.
 */
const BUREAU_FICHE: ReadonlyArray<BureauSpecGroup> = [
  {
    id: "moteur",
    group: "Moteur",
    icon: <Cpu aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
    rows: [
      { k: "Inférence navigateur", v: "WebLLM · WASM" },
      { k: "Inférence bureau", v: "llama.cpp natif, via Node" },
      { k: "Accélération", v: "WebGPU, sinon CPU", mark: "‡" },
    ],
  },
  {
    id: "modele",
    group: "Modèle",
    icon: <Binary aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
    rows: [
      { k: "Quantisation", v: "Q4_K_M" },
      { k: "Contexte", v: "8 192 jetons" },
      { k: "Poids", v: "embarqués à l'installation" },
    ],
  },
  {
    id: "machine",
    group: "Machine",
    icon: <MemoryStick aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
    rows: [
      { k: "Mémoire", v: "4–8 Go de RAM" },
      { k: "Démarrage à froid", v: "6 s", mark: "†" },
      { k: "Processeur", v: "4 cœurs suffisent" },
    ],
  },
  {
    id: "reseau",
    group: "Réseau",
    icon: <WifiOff aria-hidden className="h-3.5 w-3.5" strokeWidth={2.2} />,
    rows: [
      { k: "Connexion requise", v: "aucune" },
      { k: "Télémétrie", v: "aucune" },
      { k: "Clé d'API", v: "aucune — voir rectificatif" },
    ],
  },
];

type BureauFinding = {
  id: string;
  /** dateline-style place: canal × région */
  place: string;
  /** the measured fact, with figures kept in mono */
  fact: ReactNode;
  /** the correspondent's one-line verdict */
  verdict: string;
  /** the entry that became the front page */
  toLead?: boolean;
};

/** Le carnet du jour — three entries, one of them already on page one. */
const BUREAU_FINDINGS: ReadonlyArray<BureauFinding> = [
  {
    id: "sms-sfax",
    place: "SMS × Sfax",
    fact: (
      <>
        réussite <span className="font-mono tabular-nums">91,2 %</span>, soit{" "}
        <span className="font-mono tabular-nums">− 6,2</span> points sous la moyenne du jour
      </>
    ),
    verdict: "C'est la une. L'enquête complète est en première page.",
    toLead: true,
  },
  {
    id: "recharge-pic",
    place: "Recharge",
    fact: (
      <>
        pic à <span className="font-mono tabular-nums">16 h 04</span>,{" "}
        <span className="font-mono tabular-nums">+ 38 %</span> sur une heure
      </>
    ),
    verdict:
      "Une promotion, pas une panne. J'ai vérifié les deux hypothèses avant d'écrire la phrase.",
  },
  {
    id: "ussd-bizerte",
    place: "USSD × Bizerte",
    fact: (
      <>
        latence médiane <span className="font-mono tabular-nums">2,1 s</span>, en hausse pour le
        troisième jour
      </>
    ),
    verdict: "Pas encore un article. Une fiche à suivre, datée pour demain matin.",
  },
];

type BureauCardRow = { id: string; k: string; v: string; icon?: ReactNode };

/** The press credential pinned under the portrait — every field verifiable. */
const BUREAU_PRESS_ROWS: ReadonlyArray<BureauCardRow> = [
  { id: "nom", k: "Nom", v: "Le correspondant local" },
  { id: "employeur", k: "Employeur", v: "Data Navigator" },
  { id: "desk", k: "Desk", v: "Bureau de l'intelligence" },
  { id: "rayon", k: "Rayon", v: "vos données, rien d'autre" },
  {
    id: "telephone",
    k: "Téléphone",
    v: "aucun",
    icon: <PhoneOff aria-hidden className="h-3 w-3 text-[#bf3415]" strokeWidth={2.4} />,
  },
  { id: "adresse", k: "Adresse", v: "processus local, à côté de DuckDB" },
  { id: "validite", k: "Validité", v: "tant que le processus tourne" },
];

/** "Le sujet en bref" — the little biography box every interview page runs. */
const BUREAU_BIO: ReadonlyArray<BureauCardRow> = [
  { id: "ne", k: "Né", v: "à l'installation, sur votre machine" },
  { id: "domicile", k: "Domicile", v: "un processus de travail, porte 7" },
  { id: "voisin", k: "Voisin de palier", v: "DuckDB, mur mitoyen" },
  { id: "specialite", k: "Spécialité", v: "le briefing du matin, 9,4 s" },
  { id: "langues", k: "Langues", v: "SQL courant · français des données" },
  { id: "signe", k: "Signe particulier", v: "ne décroche jamais" },
];

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.2 — THE PORTRAIT PLATE · halftone where the photograph would be
 *  The subject refused to be photographed ("pas d'appareil, pas de réseau,
 *  pas de portrait"), so the art desk screened one in ink: a deterministic
 *  halftone of a figure in a press fedora, dot by dot, no negative involved.
 * ──────────────────────────────────────────────────────────────────────────── */

const BUREAU_PORTRAIT_W = 220;
const BUREAU_PORTRAIT_H = 264;

type BureauDot = { x: number; y: number; r: number; hot: boolean };

/**
 * Generates the halftone screen. Brightness is composed from a handful of
 * ellipses (fedora crown and brim, head, collar knot, overcoat shoulders, the
 * lighter press card on the lapel) plus a sin-based paper grain — entirely
 * deterministic, per contract rule 13. One dot near the lapel goes vermilion:
 * the badge pin.
 */
function BureauHalftone(): ReadonlyArray<BureauDot> {
  const cols = 24;
  const rows = 29;
  const within = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
    ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const out: Array<BureauDot> = [];
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const x = 12 + (ix / (cols - 1)) * (BUREAU_PORTRAIT_W - 24);
      const y = 12 + (iy / (rows - 1)) * (BUREAU_PORTRAIT_H - 24);
      let v = 0.1; // bare paper
      if (within(x, y, 110, 106, 40, 46)) v = 0.55; // head
      if (within(x, y, 110, 64, 36, 18)) v = 0.85; // fedora crown
      if (within(x, y, 110, 82, 58, 8)) v = 0.92; // fedora brim
      if (within(x, y, 110, 238, 74, 58)) v = Math.max(v, 0.62); // overcoat
      if (within(x, y, 110, 168, 12, 16)) v = Math.max(v, 0.82); // collar knot
      if (within(x, y, 140, 212, 13, 15)) v = 0.24; // press card on the lapel
      const grain = Math.sin(ix * 2.7 + iy * 1.3) * 0.06 + Math.sin((ix + iy) * 0.9) * 0.04;
      v = Math.min(1, Math.max(0, v + grain));
      // open the screen on bare paper — every other dot drops out
      if (v < 0.14 && (ix + iy) % 2 === 1) continue;
      const hot = Math.abs(x - 140) < 5 && Math.abs(y - 199) < 6; // the badge pin
      out.push({ x, y, r: 0.7 + v * 2.9, hot });
    }
  }
  return out;
}

/** The vermilion credential clipped over the portrait's corner. */
function BureauPressBadge() {
  return (
    <div className="relative rotate-2">
      <Paperclip
        aria-hidden
        className="absolute -top-4 left-1/2 h-7 w-7 -translate-x-1/2 rotate-[14deg] text-[#1c1914]"
        strokeWidth={2.1}
      />
      <div className="border-2 border-[#1c1914] bg-[#bf3415] px-3 pb-1.5 pt-2 text-center shadow-[3px_3px_0_#1c1914]">
        <div className="font-grotesk text-[17px] font-black uppercase leading-none tracking-[0.2em] text-[#f6f1e7]">
          Presse
        </div>
        <div className="mt-1 border-t border-[#f6f1e7]/40 pt-1 font-mono text-[8.5px] uppercase tracking-[0.34em] text-[#f6f1e7]">
          Local
        </div>
      </div>
    </div>
  );
}

/**
 * The full portrait plate: halftone figure, hairline frame, screen-ruling
 * caption inside the plate, press badge parallax-clipped over the corner
 * (rotate 3 across the scroll transit), and the art desk's apology below.
 */
function BureauPortrait() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // The ~600-circle screen mounts only once the plate approaches the viewport.
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const dots = useMemo(() => BureauHalftone(), []);
  return (
    <figure>
      <div
        ref={ref}
        className="relative border-2 border-[#1c1914] bg-[#eee6d6] shadow-[4px_4px_0_#1c1914]"
      >
        <svg
          viewBox={`0 0 ${BUREAU_PORTRAIT_W} ${BUREAU_PORTRAIT_H}`}
          className="block h-auto w-full"
          aria-hidden
        >
          <rect
            x="6"
            y="6"
            width={BUREAU_PORTRAIT_W - 12}
            height={BUREAU_PORTRAIT_H - 12}
            fill="none"
            stroke={RULE}
            strokeWidth="1"
          />
          {inView && (
            <motion.g
              initial={reduce ? undefined : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            >
              {dots.map((d) => (
                <circle
                  key={`${d.x.toFixed(1)}-${d.y.toFixed(1)}`}
                  cx={d.x}
                  cy={d.y}
                  r={d.hot ? 2.7 : d.r}
                  fill={d.hot ? VERMILION : INK}
                  fillOpacity={d.hot ? 1 : 0.9}
                />
              ))}
            </motion.g>
          )}
          {/* screen-ruling note, set inside the plate like a process mark */}
          <text
            x={BUREAU_PORTRAIT_W - 12}
            y={BUREAU_PORTRAIT_H - 12}
            textAnchor="end"
            fontSize="6.5"
            fontFamily="var(--font-mono)"
            fill={INK_FADED}
          >
            TRAME 65 LPI — ENCRE LOCALE
          </text>
        </svg>
        {/* the credential, clipped on and drifting 3° across the transit */}
        <Parallax speed={9} rotate={3} className="absolute -right-3 top-6 z-10 w-[6.8rem]">
          <BureauPressBadge />
        </Parallax>
      </div>
      <figcaption className="mt-3 space-y-1.5">
        <p className="font-serif text-[13.5px] italic leading-snug text-[#4a4438]">
          Le correspondant, à son poste. Il a refusé la photographie — « pas d'appareil, pas de
          réseau, pas de portrait ». La rédaction a donc composé cette trame, point par point, à
          l'encre locale.
        </p>
        <p className={T.folio}>Planche n° 7 · trame d'imprimerie · négatif : aucun</p>
      </figcaption>
    </figure>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.3 — RAIL PLATES · press credential, rectificatif, marginalia
 *  The left rail carries the page furniture an interview spread would run
 *  beside the photograph: the card, the correction box, the pull quote.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The press card — newsroom paperwork for a reporter without a phone. */
function BureauPressCard({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <div className="relative border-2 border-[#1c1914] bg-[#f6f1e7] shadow-[4px_4px_0_#1c1914]">
        <div className="flex items-center justify-between gap-3 border-b-2 border-[#1c1914] bg-[#1c1914] px-4 py-2">
          <span className="font-grotesk text-[10.5px] font-black uppercase tracking-[0.28em] text-[#f6f1e7]">
            Carte de presse
          </span>
          <span className="font-mono text-[10px] tabular-nums text-[#f6f1e7]/70">№ 000 001</span>
        </div>
        {/* lanyard punch — the one legitimate rounded-full on this card */}
        <span
          aria-hidden
          className="absolute left-1/2 top-[42px] h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-[#857c69] bg-[#f6f1e7]"
        />
        <dl className="divide-y divide-[#d6ccb6] px-4 pb-3 pt-5">
          {BUREAU_PRESS_ROWS.map((row) => (
            <div key={row.id} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#857c69]">
                {row.k}
              </dt>
              <dd className="flex items-center gap-1.5 text-right font-grotesk text-[12px] font-semibold leading-snug text-[#1c1914]">
                {row.icon}
                {row.v}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center justify-between gap-3 border-t-2 border-[#1c1914] px-4 py-3">
          <Stamp color={STAMP_GREEN} tilt={-5}>
            Accrédité
          </Stamp>
          {/* the managing editor signs in ink, illegibly, as is traditional */}
          <svg viewBox="0 0 96 28" className="h-6 w-24" aria-hidden>
            <InkPath
              d="M5 19 C 14 4, 21 25, 31 13 S 50 5, 57 16 S 77 22, 90 8"
              stroke={INK}
              strokeWidth={1.8}
              duration={0.8}
              delay={0.35}
            />
          </svg>
        </div>
      </div>
    </SettleIn>
  );
}

/**
 * RECTIFICATIF — the marginal correction joke, run exactly like a real
 * correction box: yesterday's edition asked readers for an "API key";
 * the verification desk struck the phrase and stamped its finding.
 */
function BureauRectificatif({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <aside aria-label="Rectificatif" className="border border-[#1c1914] bg-[#f6f1e7] px-5 py-4">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#bf3415]" />
          <span className="font-grotesk text-[10px] font-black uppercase tracking-[0.3em] text-[#bf3415]">
            Rectificatif
          </span>
        </div>
        <p className="mt-3 font-serif text-[15px] leading-[1.6] text-[#1c1914]">
          Dans l'édition du 11 juin, un encadré invitait le lecteur à renseigner sa{" "}
          <PenStrike delay={0.45}>« API key »</PenStrike>. Le service de vérification a rendu son
          avis :
        </p>
        <div className="mt-3">
          <Stamp tilt={-7}>Aucune</Stamp>
        </div>
        <p className="mt-3 font-serif text-[13px] italic leading-snug text-[#4a4438]">
          Le correspondant ne possède pas de clés. Pas même celles du bureau.
        </p>
      </aside>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.4 — TRANSCRIPT FURNITURE · the recorder strip above the interview
 *  A border-y strip stating how the transcript was taken: locally, at
 *  16 h 04, behind a closed door. The red dot blinks with ed-caret — the
 *  only looping animation in this section, gated for reduced motion.
 * ──────────────────────────────────────────────────────────────────────────── */

function BureauRecorderStrip({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <SettleIn className={className}>
      <div className="border-y border-[#1c1914]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 py-2.5">
          <span className="flex items-center gap-2">
            <span
              aria-hidden
              className={`${reduce ? "" : "ed-caret"} h-2 w-2 rounded-full bg-[#bf3415]`}
            />
            <Mic aria-hidden className="h-3.5 w-3.5 text-[#1c1914]" strokeWidth={2.2} />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1c1914]">
              Transcription intégrale
            </span>
          </span>
          <span className={T.folio}>enregistrée sur place · 16 h 04 · durée 9 min 12 s</span>
          <span className="flex items-center gap-1.5 sm:ml-auto">
            <EyeOff aria-hidden className="h-3.5 w-3.5 text-[#857c69]" strokeWidth={2} />
            <span className={T.folio}>fichier local — jamais téléversé</span>
          </span>
        </div>
        <div className="border-t border-[#d6ccb6] px-1 py-1.5">
          <p className={T.folio}>
            Conditions acceptées : pas de wi-fi dans la pièce · aucune copie vers un nuage ·
            relecture sur place, porte fermée
          </p>
        </div>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.5 — THE FIGURES · morning matrix, public chronometer, day's notebook
 *  Each figure is a bordered plate with a band header and a mono footnote,
 *  so the transcript reads like an article with its graphics set in.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * One cell of the morning matrix. The under-bar maps 90–99 % to 0–1 so the
 * eye can read the anomaly without doing arithmetic; the hot cell gets the
 * editor's vermilion frame and a dagger pointing at the footnote.
 */
function BureauMatrixCell({ v, hot, delay }: { v: number; hot?: boolean; delay: number }) {
  const reduce = useReducedMotion();
  const pct = Math.max(0.06, Math.min(1, (v - 90) / 9));
  return (
    <td className="relative border-t border-[#d6ccb6] px-2.5 py-2 sm:px-3">
      {hot && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0.5 border-2 border-[#bf3415]"
        />
      )}
      <span
        className={`${T.num} block text-right text-[12px] leading-none ${
          hot ? "font-bold text-[#bf3415]" : "text-[#1c1914]"
        }`}
      >
        {v.toFixed(1).replace(".", ",")}
        {hot && <sup className="font-serif"> †</sup>}
      </span>
      <span className="mt-1.5 block h-[3px] w-full bg-[#1c1914]/10">
        <motion.span
          className={`block h-full ${hot ? "bg-[#bf3415]" : "bg-[#1c1914]"}`}
          style={{ width: `${(pct * 100).toFixed(0)}%`, transformOrigin: "left" }}
          initial={reduce ? undefined : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.55, delay, ease: EASE_INK }}
        />
      </span>
    </td>
  );
}

/** A full matrix row — real <tr>, so the table stays a table for readers. */
function BureauMatrixRowEl({ row, ri }: { row: BureauMatrixRow; ri: number }) {
  return (
    <tr>
      <th
        scope="row"
        className="border-t border-[#d6ccb6] px-2.5 py-2 text-left font-grotesk text-[11px] font-bold uppercase tracking-[0.1em] text-[#1c1914] sm:px-3"
      >
        {row.canal}
      </th>
      {row.cells.map((v, ci) => (
        <BureauMatrixCell
          key={BUREAU_MATRIX_REGIONS[ci]}
          v={v}
          hot={ci === row.hot}
          delay={0.08 + (ri * BUREAU_MATRIX_REGIONS.length + ci) * 0.018}
        />
      ))}
      <td className="border-t border-[#d6ccb6] px-2.5 py-2 text-right sm:px-3">
        <span className={`${T.num} text-[12px] font-bold leading-none text-[#4a4438]`}>
          {row.moy}
        </span>
      </td>
    </tr>
  );
}

/** LECTURE DU MATIN — réussite (%) par canal × région, printed as received. */
function BureauMatrixPlate({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <figure className="border border-[#1c1914] bg-[#f6f1e7]">
        <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[#1c1914] px-3.5 py-2.5 sm:px-4">
          <span className="font-grotesk text-[11px] font-black uppercase tracking-[0.22em] text-[#1c1914]">
            Lecture du matin — réussite (%) par canal × région
          </span>
          <span className={T.folio}>{EDITION.fileName}</span>
        </figcaption>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <caption className="sr-only">
              Taux de réussite des transactions par canal et par région, édition du matin
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="px-2.5 py-2 text-left font-mono text-[9px] uppercase tracking-[0.18em] text-[#857c69] sm:px-3"
                >
                  Canal
                </th>
                {BUREAU_MATRIX_REGIONS.map((r) => (
                  <th
                    key={r}
                    scope="col"
                    className="px-2.5 py-2 text-right font-mono text-[9px] uppercase tracking-[0.18em] text-[#857c69] sm:px-3"
                  >
                    {r}
                  </th>
                ))}
                <th
                  scope="col"
                  className="px-2.5 py-2 text-right font-mono text-[9px] uppercase tracking-[0.18em] text-[#857c69] sm:px-3"
                >
                  Moy.
                </th>
              </tr>
            </thead>
            <tbody>
              {BUREAU_MATRIX_ROWS.map((row, ri) => (
                <BureauMatrixRowEl key={row.canal} row={row} ri={ri} />
              ))}
            </tbody>
          </table>
        </div>
        <footer className="space-y-1 border-t border-[#1c1914] px-3.5 py-2.5 sm:px-4">
          <p className={T.folio}>
            † SMS × Sfax : 91,2 % contre 97,4 % de moyenne du jour. Le correspondant en a fait la
            une — <InkLink href="#lead">lire l'enquête</InkLink>
          </p>
          <p className={T.folio}>
            Aucune dépêche d'agence reçue : le correspondant ne lit que votre CSV.
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#857c69] sm:hidden">
            faire défiler le tableau →
          </p>
        </footer>
      </figure>
    </SettleIn>
  );
}

/** One stage of the chronometer — track width is the share of 9,4 s. */
function BureauTimingRowEl({ row, index }: { row: BureauTimingRowData; index: number }) {
  const reduce = useReducedMotion();
  const pct = (row.s / BUREAU_TIMING_TOTAL) * 100;
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 sm:grid-cols-[11.5rem_1fr_auto]">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#1c1914]">
        {row.label}
      </span>
      <span className="col-span-2 sm:col-span-1 sm:order-none order-last">
        <span className="block h-2.5 w-full">
          <span className="block h-full w-full bg-[#1c1914]/8">
            <span className="block h-full" style={{ width: `${pct.toFixed(1)}%` }}>
              <motion.span
                className={`block h-full ${row.hot ? "bg-[#bf3415]" : "bg-[#1c1914]"}`}
                style={{ transformOrigin: "left" }}
                initial={reduce ? undefined : { scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, amount: 0.7 }}
                transition={{ duration: 0.7, delay: 0.15 + index * 0.12, ease: EASE_INK }}
              />
            </span>
          </span>
        </span>
        <span className="mt-1 block font-mono text-[9px] tracking-[0.06em] text-[#857c69]">
          {row.note}
        </span>
      </span>
      <span
        className={`${T.num} text-right text-[12px] font-bold ${
          row.hot ? "text-[#bf3415]" : "text-[#1c1914]"
        }`}
      >
        {row.s.toFixed(1).replace(".", ",")} s
      </span>
    </div>
  );
}

/**
 * CHRONOMÉTRAGE — the public stopwatch from CSV to briefing. The headline
 * figure counts up to 9,4 s in tabular ink; the stages below grow as
 * transform-only bars. The correspondent's own 2,4 s is the vermilion one.
 */
function BureauTimingPlate({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <figure className="border border-[#1c1914] bg-[#eee6d6]">
        <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#1c1914] px-3.5 py-2.5 sm:px-4">
          <span className="flex items-center gap-2">
            <Timer aria-hidden className="h-3.5 w-3.5 text-[#1c1914]" strokeWidth={2.2} />
            <span className="font-grotesk text-[11px] font-black uppercase tracking-[0.22em] text-[#1c1914]">
              Chronométrage — du fichier au briefing
            </span>
          </span>
          <span className={T.folio}>toutes portes fermées</span>
        </figcaption>
        <div className="px-3.5 py-4 sm:px-5 sm:py-5">
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            <CountUpInk
              end={9.4}
              decimals={1}
              suffix=" s"
              duration={1.8}
              className="text-[clamp(2.8rem,6.5vw,4.4rem)] font-bold leading-[0.9] tracking-tight text-[#1c1914]"
            />
            <div className="pb-1">
              <p className="font-grotesk text-[12px] font-bold uppercase tracking-[0.14em] text-[#1c1914]">
                le briefing du matin, complet
              </p>
              <p className={T.folio}>mesuré deux fois, par des gens méfiants †</p>
            </div>
          </div>
          <div className="mt-5 space-y-3.5">
            {BUREAU_TIMING.map((row, i) => (
              <BureauTimingRowEl key={row.id} row={row} index={i} />
            ))}
          </div>
        </div>
        <footer className="border-t border-[#1c1914] px-3.5 py-2.5 sm:px-4">
          <p className={T.folio}>
            † poste de bureau ordinaire, 4 cœurs, sans carte graphique. La part du correspondant —
            la rédaction — est en vermillon : 2,4 s pour écrire.
          </p>
        </footer>
      </figure>
    </SettleIn>
  );
}

/** LE CARNET DU JOUR — three entries; the first already runs on page one. */
function BureauFindings({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <figure className="border border-[#1c1914] bg-[#f6f1e7]">
        <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-[#1c1914] px-3.5 py-2.5 sm:px-4">
          <span className="flex items-center gap-2">
            <NotebookPen aria-hidden className="h-3.5 w-3.5 text-[#1c1914]" strokeWidth={2.2} />
            <span className="font-grotesk text-[11px] font-black uppercase tracking-[0.22em] text-[#1c1914]">
              Carnet du jour — trois entrées
            </span>
          </span>
          <span className={T.folio}>relevé à 06 h 12 · une seule en une</span>
        </figcaption>
        <ol className="divide-y divide-[#d6ccb6]">
          {BUREAU_FINDINGS.map((f, i) => (
            <li
              key={f.id}
              className="grid gap-x-4 gap-y-1.5 px-3.5 py-3.5 sm:grid-cols-[2.6rem_1fr] sm:px-4"
            >
              <span
                aria-hidden
                className={`${T.num} text-[15px] font-bold leading-none ${
                  f.toLead ? "text-[#bf3415]" : "text-[#857c69]"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="font-serif text-[16px] leading-[1.55] text-[#1c1914]">
                  <strong className="font-grotesk text-[13px] font-bold uppercase tracking-[0.08em]">
                    {f.place}
                  </strong>{" "}
                  — {f.fact}.
                </p>
                <p className="mt-1 font-serif text-[14px] italic leading-snug text-[#4a4438]">
                  {f.verdict}
                </p>
                {f.toLead && (
                  <p className="mt-2">
                    <InkLink href="#lead">
                      Lire la une — l'enquête sur le canal SMS{" "}
                      <ArrowUpRight aria-hidden className="inline h-3.5 w-3.5 align-[-2px]" />
                    </InkLink>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </figure>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.6 — FICHE TECHNIQUE · the spec box dropped between two questions
 *  A 2px-bordered plate, mono spec rows grouped the way the production desk
 *  thinks. It interrupts the transcript after Q.03 — exactly where a print
 *  editor would slot the sidebar so the reader gets the machinery before
 *  the speed question.
 * ──────────────────────────────────────────────────────────────────────────── */

/** One group of the spec table: a labelled cluster of key→value lines. */
function BureauFicheGroup({ group }: { group: BureauSpecGroup }) {
  return (
    <div className="border-t border-[#d6ccb6] px-4 py-3.5 first:border-t-0 sm:border-t-0 sm:px-5 sm:[&:nth-child(n+3)]:border-t sm:[&:nth-child(n+3)]:border-[#d6ccb6]">
      <div className="flex items-center gap-2 text-[#1c1914]">
        {group.icon}
        <span className="font-grotesk text-[10.5px] font-black uppercase tracking-[0.26em]">
          {group.group}
        </span>
      </div>
      <dl className="mt-2.5 space-y-1.5">
        {group.rows.map((row) => (
          <div key={row.k} className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 font-mono text-[10px] tracking-[0.04em] text-[#857c69]">
              {row.k}
            </dt>
            <span
              aria-hidden
              className="mb-[3px] hidden h-px min-w-3 flex-1 self-end bg-[#d6ccb6] sm:block"
            />
            <dd className={`${T.num} text-right text-[11.5px] font-semibold text-[#1c1914]`}>
              {row.v}
              {row.mark && <sup className="font-serif"> {row.mark}</sup>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The full plate, with its band header, 2×2 group grid and footnotes. */
function BureauFichePlate({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <aside
        aria-label="Fiche technique du correspondant"
        className="border-2 border-[#1c1914] bg-[#eee6d6] shadow-[4px_4px_0_#1c1914]"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-[#1c1914] px-4 py-2.5 sm:px-5">
          <span className="font-grotesk text-[12px] font-black uppercase tracking-[0.28em] text-[#1c1914]">
            Fiche technique
          </span>
          <span className={T.folio}>réf. DN-IA-07 · vérifiée par le service</span>
        </header>
        <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-[#d6ccb6]">
          {BUREAU_FICHE.map((g) => (
            <BureauFicheGroup key={g.id} group={g} />
          ))}
        </div>
        <footer className="space-y-1 border-t-2 border-[#1c1914] px-4 py-2.5 sm:px-5">
          <p className={T.folio}>† démarrage à froid, poste de bureau ordinaire, sans GPU dédié</p>
          <p className={T.folio}>
            ‡ repli automatique vers le CPU — le correspondant ne se plaint pas du matériel
          </p>
        </footer>
      </aside>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.7 — THE INTERVIEW ENGINE · one Q&A, typeset like print
 *  Big vermilion Q in the gutter, bold grotesk question on the baseline,
 *  serif answer behind a hairline rule. The first answer is set by TypeOn —
 *  hot type, character by character; the rest rise from their clip lines.
 * ──────────────────────────────────────────────────────────────────────────── */

function BureauQA({ item, index }: { item: BureauQAItem; index: number }) {
  const first = index === 0;
  const leadText = `« ${item.lead} »`;
  return (
    <article className="relative">
      <div className="grid gap-3 sm:grid-cols-[3.4rem_1fr] sm:gap-6">
        {/* the question gutter: Q in the editor's pen, folio number beneath */}
        <div className="flex items-baseline gap-3 sm:flex-col sm:items-end sm:gap-1.5 sm:pt-1">
          <span
            aria-hidden
            className="font-grotesk text-[1.7rem] font-black leading-none text-[#bf3415]"
          >
            Q
          </span>
          <span className={T.folio}>{item.no}</span>
        </div>
        <div className="min-w-0">
          <h3 className="font-grotesk text-[clamp(1.05rem,1.9vw,1.3rem)] font-bold leading-snug text-[#1c1914]">
            <span aria-hidden className="mr-2 text-[#bf3415]">
              —
            </span>
            {item.question}
          </h3>
          <div className="mt-4 border-l-2 border-[#d6ccb6] pl-4 sm:pl-6">
            {item.margin && (
              <div className="float-right ml-5 hidden w-44 sm:block lg:-mr-2">
                <MarginNote>{item.margin}</MarginNote>
              </div>
            )}
            {first ? (
              /* hot type: the very first words of the interview set themselves */
              <p className="font-serif text-[clamp(1.2rem,2.2vw,1.45rem)] font-medium leading-[1.45] text-[#1c1914] [font-variation-settings:'SOFT'_60,'WONK'_1]">
                <TypeOn text={leadText} speed={26} startDelay={250} />
              </p>
            ) : (
              <RiseIn amount={0.5}>
                <p className="font-serif text-[clamp(1.2rem,2.2vw,1.45rem)] font-medium leading-[1.45] text-[#1c1914] [font-variation-settings:'SOFT'_60,'WONK'_1]">
                  {leadText}
                </p>
              </RiseIn>
            )}
            {item.stamp && (
              <div className="mt-4">
                <Stamp tilt={-6}>{item.stamp}</Stamp>
              </div>
            )}
            {item.rest.map((para, i) => (
              <SettleIn key={para.id} delay={0.12 + i * 0.08}>
                <p className={`${T.body} mt-4`}>{para.body}</p>
              </SettleIn>
            ))}
            {item.figure === "matrix" && <BureauMatrixPlate className="mt-6" />}
            {item.figure === "timing" && <BureauTimingPlate className="mt-6" />}
            {item.figure === "findings" && <BureauFindings className="mt-6" />}
          </div>
        </div>
      </div>
    </article>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.8 — PAGE FURNITURE · header, the subject-in-brief box, the last word,
 *  the closing plate with the sample-briefing call.
 * ──────────────────────────────────────────────────────────────────────────── */

/** "LE SUJET EN BREF" — the little biography box every interview page runs. */
function BureauBioBox({ className }: { className?: string }) {
  return (
    <SettleIn delay={0.15} className={className}>
      <aside aria-label="Le sujet en bref" className="border border-[#1c1914] bg-[#eee6d6]">
        <header className="flex items-baseline justify-between gap-3 border-b border-[#1c1914] px-4 py-2">
          <span className="font-grotesk text-[10.5px] font-black uppercase tracking-[0.26em] text-[#1c1914]">
            Le sujet en bref
          </span>
          <span className={T.folio}>fiche d'identité</span>
        </header>
        <dl className="divide-y divide-[#d6ccb6] px-4 py-1">
          {BUREAU_BIO.map((row) => (
            <div key={row.id} className="grid grid-cols-[7.2rem_1fr] items-baseline gap-3 py-2">
              <dt className="font-mono text-[9.5px] uppercase leading-snug tracking-[0.14em] text-[#857c69]">
                {row.k}
              </dt>
              <dd className="font-serif text-[13.5px] leading-snug text-[#1c1914]">{row.v}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </SettleIn>
  );
}

/** Masthead, headline deck, standfirst and byline for the interview page. */
function BureauHeader() {
  return (
    <header>
      <SectionMast rubrique="L'entretien — notre correspondant local" no="p. 7" />
      <div className="mt-10 grid gap-10 lg:mt-14 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-8">
          <SettleIn>
            <p className={T.kicker}>L'entretien · cinq questions · zéro octet sortant</p>
          </SettleIn>
          <DeckReveal
            className="mt-4"
            lines={[
              <span
                key="l1"
                className="font-serif text-[clamp(2.4rem,5.5vw,4.6rem)] font-bold leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
              >
                The correspondent who
              </span>,
              <span
                key="l2"
                className="font-serif text-[clamp(2.4rem,5.5vw,4.6rem)] font-bold leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
              >
                never <PenUnderline delay={0.9}>files by wire</PenUnderline>
              </span>,
            ]}
          />
          <SettleIn delay={0.2} className="mt-6 max-w-[58ch]">
            <DropCapParagraph>
              Each copy of Data Navigator ships with a resident reporter: a language model that
              lives on the machine, reads the day's{" "}
              <span className="font-mono text-[0.92em] tabular-nums">2 147 380</span> transactions
              and writes the morning briefing before anyone asks. It granted us five questions, on
              one condition — that the interview never leave the room. Granted. Here is the
              transcript, printed in full.
            </DropCapParagraph>
          </SettleIn>
          <SettleIn delay={0.3} className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Byline
              name="Propos recueillis par la rédaction"
              desk="Bureau de l'intelligence · sur place"
            />
            <Stamp tilt={4}>Entretien exclusif</Stamp>
          </SettleIn>
        </div>
        <div className="lg:col-span-4">
          <BureauBioBox />
        </div>
      </div>
    </header>
  );
}

/**
 * The traditional closer no interviewer can resist — and the only answer
 * the subject gave in under a second. Unnumbered, as a courtesy.
 */
function BureauLastWord({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <div className="mx-auto max-w-[46ch] text-center">
        <p className="font-grotesk text-[13px] font-bold text-[#1c1914]">
          <span aria-hidden className="mr-2 text-[#bf3415]">
            Q —
          </span>
          Un dernier mot ?
        </p>
        <p className="mt-2 font-serif text-[1.2rem] italic leading-[1.45] text-[#1c1914]">
          « Fermez la porte en sortant. Moi, je reste. »
        </p>
      </div>
      <div className="mt-8 flex items-center gap-4" aria-hidden>
        <span className="h-px flex-1 bg-[#d6ccb6]" />
        <span className={T.folio}>— fin de l'entretien —</span>
        <span className="h-px flex-1 bg-[#d6ccb6]" />
      </div>
    </SettleIn>
  );
}

/** The closing plate: read a sample briefing, composed where else but here. */
function BureauClosing({ className }: { className?: string }) {
  return (
    <SettleIn className={className}>
      <div className="flex flex-col items-start justify-between gap-6 border-2 border-[#1c1914] bg-[#eee6d6] px-6 py-7 shadow-[4px_4px_0_#1c1914] sm:px-8 md:flex-row md:items-center">
        <div className="max-w-[46ch]">
          <p className={T.kicker}>Édition de démonstration</p>
          <p className="mt-2 font-serif text-[clamp(1.25rem,2.4vw,1.6rem)] font-bold leading-[1.2] text-[#1c1914] [font-variation-settings:'WONK'_1]">
            Le correspondant peut écrire le prochain briefing chez vous.
          </p>
          <p className={`${T.ui} mt-2 text-[14px]`}>
            Un exemple complet, composé sur votre machine — il ne saurait en être autrement.
          </p>
        </div>
        <InkButton tone="outline" href="/signup" className="shrink-0">
          Lire un briefing d'exemple
          <ArrowRight
            aria-hidden
            className="h-4 w-4 transition-transform group-hover:translate-x-1"
          />
        </InkButton>
      </div>
    </SettleIn>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §9.9 — THE SECTION · assembly of the interview spread
 *  Print layout: header across the page; then a classic interview spread —
 *  portrait rail on the left (plate, credential, correction, pull quote),
 *  transcript on the right with the FICHE TECHNIQUE dropped in after Q.03.
 *  On small screens the rail folds above the transcript, photograph first,
 *  exactly as the page would stack on a narrow press run.
 * ──────────────────────────────────────────────────────────────────────────── */

function BureauSection() {
  return (
    <section
      id="bureau"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 5400px" }}
    >
      <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-16 sm:px-8 lg:px-10 lg:pb-24 lg:pt-24">
        <BureauHeader />

        <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-12 lg:gap-12">
          {/* ── the portrait rail — photograph, paperwork, correction, quote ── */}
          <aside className="space-y-10 lg:col-span-4">
            <SettleIn>
              <BureauPortrait />
            </SettleIn>
            <BureauPressCard />
            <BureauRectificatif />
            <PullQuote cite="Le correspondant local" className="hidden lg:block">
              Je lis deux millions de lignes avant l'aube. Personne ne lit par-dessus mon épaule.
            </PullQuote>
            <div className="hidden lg:block">
              <MarginNote side="right">
                Notre photographe attend toujours son rendez-vous. Il attendra.
              </MarginNote>
            </div>
          </aside>

          {/* ── the transcript column ── */}
          <div className="min-w-0 lg:col-span-8">
            <BureauRecorderStrip />

            <div className="mt-12 space-y-14 sm:space-y-16">
              {/* Q.01 – Q.03 : domicile, lecture, interdits */}
              {BUREAU_INTERVIEW.slice(0, 3).map((item, i) => (
                <BureauQA key={item.no} item={item} index={i} />
              ))}

              {/* the sidebar lands here, between the interdictions and the
                  speed question — machinery first, performance second */}
              <BureauFichePlate />

              {/* Q.04 – Q.05 : chronométrage, carnet du jour */}
              {BUREAU_INTERVIEW.slice(3).map((item, i) => (
                <BureauQA key={item.no} item={item} index={i + 3} />
              ))}
            </div>

            {/* the pull quote surfaces in-flow on smaller presses */}
            <PullQuote cite="Le correspondant local" className="mt-14 lg:hidden">
              Je lis deux millions de lignes avant l'aube. Personne ne lit par-dessus mon épaule.
            </PullQuote>

            <BureauLastWord className="mt-14 sm:mt-16" />
            <BureauClosing className="mt-12" />
          </div>
        </div>

        <DoubleRule className="mt-16 lg:mt-20" />
        <FolioLine
          page="p. 7"
          note="L'entretien — il n'a pas raccroché : il n'a jamais décroché"
          className="mt-4"
        />
      </div>
    </section>
  );
}
