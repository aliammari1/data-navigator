/* ════════════════════════════════════════════════════════════════════════════
 *  §10 — CARTO · THE CARTOGRAPHY PLATE                                     p. 8
 *  ────────────────────────────────────────────────────────────────────────────
 *  Geographic analysis presented as a printed map plate — a "planche" filed by
 *  the paper's map desk. The conceit: Data Navigator joins every row of
 *  DailyTransactions.csv to its région and prints availability as an engraved
 *  dot-screen map, entirely offline (PMTiles base map shipped inside the
 *  installer, MapLibre rendering from disk). The plate is the hero image; the
 *  legend table is the real, readable equivalent of the decorative map; three
 *  regional dispatches carry the newsroom voice; and a technical footnote says
 *  the thing the security team actually came to read.
 *
 *  Motion inventory (transform / opacity / pathLength only, all primitives
 *  gate behind prefers-reduced-motion):
 *  · Parallax 45 on the plate + Parallax 20 on a backing offset frame — two
 *    drift speeds read as two physical plates stacked on the light table.
 *  · InkPath draws the compass rose and the incident annotation; the
 *    graticule is static hairline ink.
 *  · The editor's vermilion pen is spent exactly once on the map: a dashed
 *    halo around the EST marker with a hand underline beneath its label.
 *  · Legend réussite figures count up in tabular numerals; aria-hidden wraps
 *    the live counter and an sr-only span keeps the static value.
 *
 *  Data discipline: region volumes sum to exactly 2 147 380 (EDITION.rows),
 *  sites sum to exactly 1 904 (the layer inventory's point count), and the
 *  part-weighted réussite lands on 97,4 % (EDITION.successRate). The page
 *  reconciles like a real ledger — readers who check should be rewarded.
 * ════════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────────────
 *  Plate geometry + markers — the three story points called out on the map.
 *  Coordinates are relative (0–1) per InkDotMap's contract.
 * ──────────────────────────────────────────────────────────────────────────── */

const CARTO_MAP_W = 680;
const CARTO_MAP_H = 300;

const CARTO_MARKERS = [
  { x: 0.72, y: 0.38, label: "EST — incident passerelle" },
  { x: 0.45, y: 0.18, label: "NORD 99,2 %" },
  { x: 0.5, y: 0.55, label: "CENTRE 98,9 %" },
] as const;

/** Inset enlargement — the Sfax corridor, where the evening's story happened. */
const CARTO_INSET_MARKERS = [
  { x: 0.36, y: 0.4, label: "SFX-1" },
  { x: 0.66, y: 0.52, label: "SFX-2" },
] as const;

/**
 * Toponyms — faint italic place names printed on the plate, the way an
 * engraved map names its towns. Coordinates in plate space (680 × 300),
 * positioned clear of the three markers, the incident halo and the inset.
 * `anchor` keeps each name on the open side of its town dot.
 */
const CARTO_TOWNS = [
  { x: 296, y: 44, name: "Tunis", anchor: "end" },
  { x: 252, y: 22, name: "Bizerte", anchor: "end" },
  { x: 182, y: 72, name: "Béja", anchor: "end" },
  { x: 330, y: 186, name: "Kairouan", anchor: "end" },
  { x: 458, y: 88, name: "Sfax", anchor: "end" },
  { x: 522, y: 232, name: "Gabès", anchor: "start" },
  { x: 152, y: 246, name: "Tozeur", anchor: "start" },
] as const;

/** Graticule — printed lat/long hairlines. Tunisia sits ~33–37°N, 8–11°E. */
const CARTO_GRATICULE = {
  verticals: [
    { x: 170, label: "9°E" },
    { x: 340, label: "10°E" },
    { x: 510, label: "11°E" },
  ],
  horizontals: [
    { y: 100, label: "36°N" },
    { y: 200, label: "35°N" },
  ],
} as const;

/* ─────────────────────────────────────────────────────────────────────────────
 *  The legend ledger — six régions, reconciled to the edition's totals.
 *  lignes sum:  742 911 + 489 603 + 395 118 + 195 411 + 191 067 + 133 270
 *             = 2 147 380  ✓ (EDITION.rows)
 *  sites sum:   612 + 418 + 366 + 201 + 188 + 119 = 1 904  ✓ (layer inventory)
 *  réussite, part-weighted: 97,4 %  ✓ (EDITION.successRate)
 *  spark = hourly réussite, 08 h → 19 h, twelve readings per région.
 * ──────────────────────────────────────────────────────────────────────────── */

type CartoRegionRow = {
  region: string;
  /** chef-lieu — anchors each row to a real place name */
  chef: string;
  /** share of the day's traffic */
  part: string;
  /** réussite as a number, for the count-up; formatted fr-FR at render */
  reussiteNum: number;
  /** static string twin of reussiteNum — sr-only + footer reconciliation */
  reussite: string;
  lignes: string;
  sites: number;
  /** delta vs. J-1, signed, French decimal comma */
  delta: string;
  spark: ReadonlyArray<number>;
  /** index in spark to ring in vermilion (the 16 h reading for EST) */
  markIndex?: number;
  incident?: boolean;
  /** the desk's one-line margin verdict — read out in the sr summary */
  note: string;
};

const CARTO_REGIONS: ReadonlyArray<CartoRegionRow> = [
  {
    region: "Nord",
    chef: "Tunis",
    part: "34,6 %",
    reussiteNum: 99.2,
    reussite: "99,2 %",
    lignes: "742 911",
    sites: 612,
    delta: "+0,1",
    spark: [99.1, 99.3, 99.2, 99.4, 99.2, 99.1, 99.3, 99.2, 99.0, 99.2, 99.3, 99.2],
    note: "pointe du matin absorbée sans commentaire du bureau",
  },
  {
    region: "Centre",
    chef: "Kairouan",
    part: "22,8 %",
    reussiteNum: 98.9,
    reussite: "98,9 %",
    lignes: "489 603",
    sites: 418,
    delta: "−0,2",
    spark: [98.7, 98.8, 99.0, 98.9, 98.8, 99.1, 98.9, 98.7, 98.8, 99.0, 98.9, 98.9],
    note: "rien à signaler — la meilleure phrase du métier",
  },
  {
    region: "Est",
    chef: "Sfax",
    part: "18,4 %",
    reussiteNum: 91.4,
    reussite: "91,4 %",
    lignes: "395 118",
    sites: 366,
    delta: "−6,1",
    spark: [97.3, 97.5, 97.4, 97.2, 97.6, 97.4, 97.1, 97.3, 71.2, 84.6, 93.8, 96.9],
    markIndex: 8,
    incident: true,
    note: "chute de la passerelle SFX-2 à 16 h 04 — enquête p. 3",
  },
  {
    region: "Sud-Est",
    chef: "Gabès",
    part: "9,1 %",
    reussiteNum: 97.8,
    reussite: "97,8 %",
    lignes: "195 411",
    sites: 201,
    delta: "+0,4",
    spark: [97.6, 97.9, 97.7, 98.0, 97.8, 97.6, 97.9, 98.1, 97.7, 97.8, 97.6, 97.9],
    note: "meilleure journée du mois pour le littoral sud",
  },
  {
    region: "Nord-Ouest",
    chef: "Béja",
    part: "8,9 %",
    reussiteNum: 98.4,
    reussite: "98,4 %",
    lignes: "191 067",
    sites: 188,
    delta: "0,0",
    spark: [98.2, 98.5, 98.3, 98.6, 98.4, 98.2, 98.5, 98.3, 98.4, 98.6, 98.3, 98.4],
    note: "plat comme une plaine céréalière — exactement comme hier",
  },
  {
    region: "Sud-Ouest",
    chef: "Tozeur",
    part: "6,2 %",
    reussiteNum: 98.1,
    reussite: "98,1 %",
    lignes: "133 270",
    sites: 119,
    delta: "−0,3",
    spark: [98.0, 98.2, 97.9, 98.3, 98.1, 98.0, 98.2, 98.4, 97.9, 98.1, 98.0, 98.2],
    note: "faible volume, forte fiabilité — le désert ne se plaint pas",
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
 *  Feuille de relevés — the surveyor's hourly log, folded under the legend.
 *  Tells the incident as a timeline: nominal, drop, failover, recovery, close.
 * ──────────────────────────────────────────────────────────────────────────── */

type CartoReading = {
  heure: string;
  region: string;
  valeur: string;
  note: string;
  /** vermilion row — the reading that became page 3 */
  alarm?: boolean;
};

const CARTO_READINGS: ReadonlyArray<CartoReading> = [
  { heure: "06 h 00", region: "Toutes", valeur: "97,9 %", note: "ouverture du relevé" },
  { heure: "09 h 15", region: "Nord", valeur: "99,3 %", note: "pointe du matin absorbée" },
  { heure: "11 h 40", region: "Centre", valeur: "98,9 %", note: "RAS" },
  { heure: "14 h 30", region: "Est", valeur: "97,3 %", note: "dernière mesure nominale" },
  { heure: "16 h 04", region: "Est", valeur: "71,2 %", note: "chute passerelle SFX-2", alarm: true },
  { heure: "16 h 31", region: "Est", valeur: "78,9 %", note: "bascule sur SFX-1 engagée" },
  { heure: "17 h 12", region: "Est", valeur: "84,6 %", note: "38 412 transactions réacheminées" },
  { heure: "19 h 02", region: "Est", valeur: "96,9 %", note: "retour quasi nominal" },
  { heure: "23 h 59", region: "Toutes", valeur: "97,4 %", note: "clôture de l'édition" },
];

/* ─────────────────────────────────────────────────────────────────────────────
 *  Dépêches régionales — three datelined briefs in the paper's dry voice.
 *  English editorial, French figures: the newsroom's house bilingualism.
 * ──────────────────────────────────────────────────────────────────────────── */

type CartoDispatchItem = {
  dateline: string;
  heure: string;
  canal: string;
  body: string;
  figure: string;
  figureLabel: string;
};

const CARTO_DISPATCHES: ReadonlyArray<CartoDispatchItem> = [
  {
    dateline: "SFAX",
    heure: "16 h 41",
    canal: "tous canaux",
    body:
      "The eastern gateway went quiet at 16 h 04; 38 412 transactions took the long way " +
      "round through SFX-1 before the evening close, and the plate shows exactly where.",
    figure: "38 412",
    figureLabel: "transactions réacheminées",
  },
  {
    dateline: "TUNIS",
    heure: "09 h 30",
    canal: "USSD · agence",
    body:
      "The north absorbed the morning rush at 99,2 % and filed nothing else — which, at " +
      "this desk, is the highest compliment a région can earn.",
    figure: "742 911",
    figureLabel: "lignes au nord, réussite 99,2 %",
  },
  {
    dateline: "BIZERTE",
    heure: "12 h 05",
    canal: "agence",
    body:
      "A quiet corner of the plate: 64 118 lignes, zero alerts, and the cartographer left " +
      "for lunch on schedule.",
    figure: "0",
    figureLabel: "alerte · 64 118 lignes",
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
 *  Layer inventory — what actually ships on disk. Weighs 29,0 Mo all in:
 *  28,4 + 0,412 + 0,096 + 0,038 + 0,064 = 29,01 Mo. The security reviewer's
 *  favourite table on the whole page.
 * ──────────────────────────────────────────────────────────────────────────── */

type CartoLayerRow = {
  couche: string;
  detail: string;
  poids: string;
  note: string;
};

const CARTO_LAYERS: ReadonlyArray<CartoLayerRow> = [
  {
    couche: "Fond de carte",
    detail: "PMTiles · z0 – z14",
    poids: "28,4 Mo",
    note: "livré dans l'installateur, jamais téléchargé",
  },
  {
    couche: "Limites régionales",
    detail: "GeoJSON · 6 entités",
    poids: "412 Ko",
    note: "jointure « region » directe sur le CSV",
  },
  {
    couche: "Sites & passerelles",
    detail: "1 904 points",
    poids: "96 Ko",
    note: "index spatial tenu par le moteur DuckDB",
  },
  {
    couche: "Styles de planche",
    detail: "encre · nuit · relief",
    poids: "38 Ko",
    note: "hérités de la maquette de l'édition",
  },
  {
    couche: "Glossaire toponymique",
    detail: "fr-TN",
    poids: "64 Ko",
    note: "recherche de lieux, résolue localement",
  },
];

/* ═════════════════════════════════════════════════════════════════════════════
 *  CARTOGRAPHIC FURNITURE — compass, registration marks, graticule, scale bar
 * ═════════════════════════════════════════════════════════════════════════════ */

/**
 * Compass rose, drawn stroke by stroke like an engraver finishing the corner
 * of the plate. North needle takes the only vermilion on the instrument; the
 * paper disc beneath occludes the dot-screen so the rose reads cleanly.
 */
function CartoCompassRose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="50" r="46" fill={PAPER} fillOpacity="0.92" />
      {/* outer ring, then a dashed inner ring — bezel and dial */}
      <InkPath
        d="M50 10 A40 40 0 0 1 90 50 A40 40 0 0 1 50 90 A40 40 0 0 1 10 50 A40 40 0 0 1 50 10"
        strokeWidth={1.8}
        duration={1.2}
      />
      <InkPath
        d="M50 22 A28 28 0 0 1 78 50 A28 28 0 0 1 50 78 A28 28 0 0 1 22 50 A28 28 0 0 1 50 22"
        strokeWidth={1}
        duration={1}
        delay={0.2}
        dashed
      />
      {/* cardinal cross with a hub gap — four strokes, drawn in sequence */}
      <InkPath d="M50 14 L50 43" strokeWidth={1.4} delay={0.4} duration={0.35} />
      <InkPath d="M50 57 L50 86" strokeWidth={1.4} delay={0.45} duration={0.35} />
      <InkPath d="M14 50 L43 50" strokeWidth={1.4} delay={0.5} duration={0.35} />
      <InkPath d="M57 50 L86 50" strokeWidth={1.4} delay={0.55} duration={0.35} />
      {/* intercardinals, lighter and dashed — secondary information */}
      <InkPath d="M28 28 L41 41" strokeWidth={1} delay={0.6} duration={0.3} dashed />
      <InkPath d="M72 28 L59 41" strokeWidth={1} delay={0.65} duration={0.3} dashed />
      <InkPath d="M72 72 L59 59" strokeWidth={1} delay={0.7} duration={0.3} dashed />
      <InkPath d="M28 72 L41 59" strokeWidth={1} delay={0.75} duration={0.3} dashed />
      {/* the needle: vermilion north, paper south, ink hub */}
      <InkPath
        d="M50 24 L55 50 L45 50 Z"
        stroke={VERMILION}
        strokeWidth={1.2}
        fill={VERMILION}
        delay={0.9}
        duration={0.35}
      />
      <InkPath d="M50 76 L55 50 L45 50 Z" strokeWidth={1.2} fill={PAPER} delay={0.95} duration={0.35} />
      <circle cx="50" cy="50" r="2.4" fill={INK} />
      <text x="50" y="9" textAnchor="middle" fontSize="9" fontWeight="700" fontFamily="var(--font-mono)" fill={INK}>
        N
      </text>
      <text x="95" y="53.5" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill={INK_SOFT}>
        E
      </text>
      <text x="50" y="99" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill={INK_SOFT}>
        S
      </text>
      <text x="5" y="53.5" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill={INK_SOFT}>
        O
      </text>
    </svg>
  );
}

/**
 * Pre-press registration mark — the little cross-in-circle printers use to
 * align colour passes. Four of them sit just outside the plate corners; they
 * say "this page went through a press" louder than any texture could.
 */
function CartoRegMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-4 w-4 ${className ?? ""}`} aria-hidden>
      <line x1="8" y1="0.5" x2="8" y2="15.5" stroke={INK_SOFT} strokeWidth="1" />
      <line x1="0.5" y1="8" x2="15.5" y2="8" stroke={INK_SOFT} strokeWidth="1" />
      <circle cx="8" cy="8" r="4.2" fill="none" stroke={INK_SOFT} strokeWidth="1" />
    </svg>
  );
}

/**
 * Graticule overlay — static dashed meridians/parallels with mono degree
 * labels and tick marks along the frame. No animation: survey lines are the
 * quiet, permanent layer beneath the day's news.
 */
function CartoGraticule() {
  return (
    <svg
      viewBox={`0 0 ${CARTO_MAP_W} ${CARTO_MAP_H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      {CARTO_GRATICULE.verticals.map((v) => (
        <g key={v.label}>
          <line x1={v.x} y1={0} x2={v.x} y2={CARTO_MAP_H} stroke={RULE} strokeWidth="1" strokeDasharray="2 7" />
          <text x={v.x + 5} y={CARTO_MAP_H - 7} fontSize="8.5" fontFamily="var(--font-mono)" fill={INK_FADED}>
            {v.label}
          </text>
        </g>
      ))}
      {CARTO_GRATICULE.horizontals.map((hz) => (
        <g key={hz.label}>
          <line x1={0} y1={hz.y} x2={CARTO_MAP_W} y2={hz.y} stroke={RULE} strokeWidth="1" strokeDasharray="2 7" />
          <text x={6} y={hz.y - 5} fontSize="8.5" fontFamily="var(--font-mono)" fill={INK_FADED}>
            {hz.label}
          </text>
        </g>
      ))}
      {/* frame ticks — every 68 viewBox-px along top and bottom edges */}
      {Array.from({ length: 9 }, (_, i) => {
        const x = 68 * (i + 1);
        return (
          <g key={`vt-${x}`}>
            <line x1={x} y1={0} x2={x} y2={5} stroke={INK_SOFT} strokeWidth="1" />
            <line x1={x} y1={CARTO_MAP_H - 5} x2={x} y2={CARTO_MAP_H} stroke={INK_SOFT} strokeWidth="1" />
          </g>
        );
      })}
      {/* and every 50 along the sides */}
      {Array.from({ length: 5 }, (_, i) => {
        const y = 50 * (i + 1);
        return (
          <g key={`ht-${y}`}>
            <line x1={0} y1={y} x2={5} y2={y} stroke={INK_SOFT} strokeWidth="1" />
            <line x1={CARTO_MAP_W - 5} y1={y} x2={CARTO_MAP_W} y2={y} stroke={INK_SOFT} strokeWidth="1" />
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Toponym layer — town dots and italic serif names, printed at the same
 * faint weight as the dot-screen so they sit *in* the map rather than on it.
 * Static like the graticule: place names are not news.
 */
function CartoToponyms() {
  return (
    <svg
      viewBox={`0 0 ${CARTO_MAP_W} ${CARTO_MAP_H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      {CARTO_TOWNS.map((t) => (
        <g key={t.name}>
          <circle
            cx={t.anchor === "end" ? t.x + 5 : t.x - 5}
            cy={t.y - 3}
            r="1.8"
            fill={INK}
            fillOpacity="0.55"
          />
          <text
            x={t.x}
            y={t.y}
            textAnchor={t.anchor}
            fontSize="10"
            fontStyle="italic"
            fontFamily="var(--font-serif)"
            fill={INK_SOFT}
            fillOpacity="0.8"
          >
            {t.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

/**
 * The editor's pen on the map — used once, at the EST marker (489.6, 114 in
 * plate coordinates): a dashed halo around the point, a hand underline under
 * its printed label, and a serif aside giving the hour. Draw order is halo →
 * underline → caption, like a hand actually annotating the proof.
 */
function CartoIncidentAnnotation() {
  const reduce = useReducedMotion();
  return (
    <svg
      viewBox={`0 0 ${CARTO_MAP_W} ${CARTO_MAP_H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      <InkPath
        d="M467.6 114 A22 22 0 1 1 511.6 114 A22 22 0 1 1 467.6 114"
        stroke={VERMILION}
        strokeWidth={1.8}
        delay={0.9}
        duration={0.6}
        dashed
      />
      <InkPath
        d="M503 124 Q 540 120.5, 575 123 T 641 121.5"
        stroke={VERMILION}
        strokeWidth={1.6}
        delay={1.25}
        duration={0.45}
      />
      <motion.g
        initial={reduce ? undefined : { opacity: 0, y: 4 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ delay: 1.55, duration: 0.5, ease: EASE_INK }}
      >
        <text
          x={489.6}
          y={152}
          textAnchor="middle"
          fontSize="11.5"
          fontStyle="italic"
          fontFamily="var(--font-serif)"
          fill={VERMILION}
        >
          tombée à 16 h 04 — voir p. 3
        </text>
      </motion.g>
    </svg>
  );
}

/**
 * Printed scale bar — alternating ink/paper segments with the ratio in mono.
 * Pure ink-and-border construction; nothing here animates.
 */
function CartoScaleBar() {
  return (
    <div className="flex items-center gap-3">
      <Ruler aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#4a4438]" strokeWidth={1.8} />
      <div>
        <div className="flex h-[7px] w-36 border border-[#1c1914] sm:w-40">
          <div className="flex-1 bg-[#1c1914]" />
          <div className="flex-1 bg-transparent" />
          <div className="flex-1 bg-[#1c1914]" />
          <div className="flex-1 bg-transparent" />
        </div>
        <div className="mt-0.5 flex justify-between font-mono text-[8px] tracking-tight text-[#857c69]">
          <span>0</span>
          <span>50</span>
          <span>100 km</span>
        </div>
      </div>
      <span className="hidden font-mono text-[9px] tracking-[0.08em] text-[#857c69] sm:block">
        1 : 1 850 000
      </span>
    </div>
  );
}

/**
 * Inset enlargement — printed maps put their drama in a boxed "encart".
 * Ours zooms the Sfax corridor where SFX-2 fell over; the two gateway points
 * carry their own labels. Hidden below lg: the corner is too crowded on
 * small plates, and the dispatches tell the same story in text.
 */
function CartoInset({ className }: { className?: string }) {
  return (
    <div
      className={`w-[196px] border-2 border-[#1c1914] bg-[#f6f1e7] shadow-[3px_3px_0_#1c1914] ${className ?? ""}`}
    >
      <div className="border-b border-[#1c1914] px-2 py-1">
        <span className="font-mono text-[8px] font-semibold tracking-[0.12em] text-[#1c1914]">
          ENCART — CORRIDOR DE SFAX
        </span>
      </div>
      <div className="relative aspect-[200/96]">
        <InkDotMap w={200} h={96} markers={CARTO_INSET_MARKERS} className="absolute inset-0" />
      </div>
      <div className="flex justify-between border-t border-[#d6ccb6] px-2 py-0.5 font-mono text-[7.5px] text-[#857c69]">
        <span>1 : 420 000</span>
        <span>SFX-1 · SFX-2</span>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
 *  THE PLATE — frame, header strip, map stack, footer strip
 * ═════════════════════════════════════════════════════════════════════════════ */

/** Header strip riveted to the top of the frame — title left, plate no. right. */
function CartoPlateHeader() {
  return (
    <header className="flex items-center justify-between gap-3 border-b-[3px] border-[#1c1914] px-3 py-2.5 sm:px-4">
      <h3 className="font-grotesk text-[10px] font-bold uppercase tracking-[0.16em] text-[#1c1914] sm:text-[12px] sm:tracking-[0.18em]">
        Carte des régions — <span className="whitespace-nowrap">disponibilité du 11 juin</span>
      </h3>
      <div className="flex shrink-0 items-center gap-1.5 font-mono text-[9px] font-semibold tracking-[0.1em] text-[#bf3415]">
        <Compass aria-hidden className="h-3.5 w-3.5" strokeWidth={1.8} />
        <span className="hidden sm:inline">PLANCHE VIII</span>
        <span className="sm:hidden">PL. VIII</span>
      </div>
    </header>
  );
}

/** Footer strip — scale bar, projection note, site tally. Engraver's small print. */
function CartoPlateFooter() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[#d6ccb6] px-3 py-2.5 sm:px-4">
      <CartoScaleBar />
      <span className={`hidden md:block ${T.folio}`}>
        Projection encre-sur-papier · relevé clos à 23 h 59
      </span>
      <span className={T.folio}>1 904 sites · 6 régions</span>
    </footer>
  );
}

/**
 * The full plate: 3px ink frame on paper lift, registration marks outside the
 * corners, then the layered map stack — dot-screen base, graticule, incident
 * annotation, compass (top-left, clear of all three markers), Sfax inset
 * (bottom-left, ≥lg). Everything visual is aria-hidden; the visible
 * figcaption and the legend table carry the real content.
 */
function CartoPlate() {
  return (
    <figure className="relative">
      <div className="relative border-[3px] border-[#1c1914] bg-[#f6f1e7] shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)]">
        {/* registration marks — pre-press corners, outside the frame */}
        <CartoRegMark className="absolute -left-3 -top-3" />
        <CartoRegMark className="absolute -right-3 -top-3" />
        <CartoRegMark className="absolute -bottom-3 -left-3" />
        <CartoRegMark className="absolute -bottom-3 -right-3" />
        <CartoPlateHeader />
        <div className="relative aspect-[680/300] w-full" aria-hidden>
          <InkDotMap w={CARTO_MAP_W} h={CARTO_MAP_H} markers={CARTO_MARKERS} className="absolute inset-0" />
          <CartoGraticule />
          <CartoToponyms />
          <CartoIncidentAnnotation />
          <CartoCompassRose className="absolute left-3 top-3 hidden h-[72px] w-[72px] sm:block lg:h-20 lg:w-20" />
          <CartoInset className="absolute bottom-3 left-3 hidden lg:block" />
        </div>
        <CartoPlateFooter />
      </div>
      <figcaption className={`mt-3 ${T.folio}`}>
        Fig. 8.1 — planche tirée de {EDITION.fileName} · fond de carte embarqué, aucun
        téléchargement
      </figcaption>
    </figure>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
 *  THE LEGEND — hairline ledger of régions; the map's textual truth
 * ═════════════════════════════════════════════════════════════════════════════ */

/**
 * One ledger row. The EST row takes the section's vermilion: name, figure and
 * sparkline all in the editor's red, with a triangle flag. Counter is
 * aria-hidden with an sr-only static twin so screen readers never hear the
 * count-up stutter. Spark + delta columns yield below sm — part and réussite
 * are the load-bearing figures on a phone.
 */
function CartoLegendRow({ row }: { row: CartoRegionRow }) {
  const hot = row.incident === true;
  const inkTone = hot ? "text-[#bf3415]" : "text-[#1c1914]";
  return (
    <tr className={`border-b border-[#d6ccb6] last:border-b-0 ${hot ? "bg-[#bf3415]/[0.05]" : ""}`}>
      <th scope="row" className="py-2.5 pr-2 text-left align-top font-normal">
        <span className={`flex items-center gap-1.5 font-grotesk text-[13px] font-bold uppercase tracking-[0.08em] ${inkTone}`}>
          {hot && <TriangleAlert aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />}
          {row.region}
        </span>
        <span className={`mt-0.5 block ${T.folio}`}>{row.chef}</span>
      </th>
      <td className="py-2.5 pr-2 text-right align-top font-mono text-[12px] tabular-nums text-[#4a4438]">
        {row.part}
      </td>
      <td className={`py-2.5 pr-2 text-right align-top font-mono text-[13px] font-semibold tabular-nums ${inkTone}`}>
        <span aria-hidden>
          <CountUpInk end={row.reussiteNum} decimals={1} suffix=" %" duration={1.2} />
        </span>
        <span className="sr-only">{row.reussite}</span>
      </td>
      <td className="hidden py-2.5 pr-2 text-right align-top font-mono text-[11px] tabular-nums text-[#857c69] sm:table-cell">
        {row.delta}
      </td>
      <td className="hidden py-2.5 align-middle sm:table-cell">
        <div className="ml-auto h-6 w-20">
          <InkLine
            data={row.spark}
            w={80}
            h={24}
            stroke={hot ? VERMILION : INK}
            markIndex={row.markIndex}
            duration={0.9}
          />
        </div>
      </td>
    </tr>
  );
}

/**
 * Legend box — the plate's ledger. A real <table> (the decorative map's text
 * equivalent), reconciliation footer, and the editor's margin note steering
 * readers to the page-3 enquête. The note sits in flow below the table,
 * rotated like a pencil aside, so it never overflows narrow viewports.
 */
function CartoLegend() {
  return (
    <SettleIn className="border border-[#1c1914] bg-[#eee6d6] px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 font-grotesk text-[12px] font-bold uppercase tracking-[0.22em] text-[#1c1914]">
          <MapPin aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
          Légende & relevés
        </h3>
        <span className={T.folio}>11 juin</span>
      </div>
      <Rule className="mt-3 bg-[#1c1914]" />
      <table className="mt-1 w-full border-collapse">
        <caption className="sr-only">
          Disponibilité par région le 11 juin : part du trafic, taux de réussite, écart à la
          veille et relevé horaire de 08 h à 19 h.
        </caption>
        <thead>
          <tr className="border-b-2 border-[#1c1914]">
            <th scope="col" className={`py-2 pr-2 text-left ${T.folio}`}>
              Région
            </th>
            <th scope="col" className={`py-2 pr-2 text-right ${T.folio}`}>
              Part
            </th>
            <th scope="col" className={`py-2 pr-2 text-right ${T.folio}`}>
              Réussite
            </th>
            <th scope="col" className={`hidden py-2 pr-2 text-right sm:table-cell ${T.folio}`}>
              Δ&nbsp;j−1
            </th>
            <th scope="col" className={`hidden py-2 text-right sm:table-cell ${T.folio}`}>
              08 h – 19 h
            </th>
          </tr>
        </thead>
        <tbody>
          {CARTO_REGIONS.map((row) => (
            <CartoLegendRow key={row.region} row={row} />
          ))}
        </tbody>
      </table>
      {/* reconciliation line — the ledger balances against the masthead totals */}
      <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t-2 border-[#1c1914] pt-2.5 ${T.folio}`}>
        <span className="flex items-center gap-1.5">
          <RadioTower aria-hidden className="h-3 w-3" strokeWidth={2} />1 904 sites
        </span>
        <span aria-hidden>·</span>
        <span>{EDITION.rows} lignes</span>
        <span aria-hidden>·</span>
        <span>moyenne pondérée {EDITION.successRate}</span>
      </div>
      {/* symbol key — what the plate's ink means, in three glyphs */}
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 border-t border-[#d6ccb6] pt-3 sm:grid-cols-3">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0" aria-hidden>
            <circle cx="7" cy="7" r="3" fill={VERMILION} />
            <circle cx="7" cy="7" r="6" fill="none" stroke={VERMILION} strokeWidth="1.2" strokeOpacity="0.55" />
          </svg>
          <dt className="sr-only">Point vermillon cerclé</dt>
          <dd className={T.folio}>incident signalé</dd>
        </div>
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0" aria-hidden>
            <circle cx="3.5" cy="4" r="1.3" fill={INK} fillOpacity="0.35" />
            <circle cx="8" cy="4" r="1.3" fill={INK} fillOpacity="0.35" />
            <circle cx="12.5" cy="4" r="1.3" fill={INK} fillOpacity="0.35" />
            <circle cx="5.5" cy="9" r="1.3" fill={INK} fillOpacity="0.35" />
            <circle cx="10" cy="9" r="1.3" fill={INK} fillOpacity="0.35" />
          </svg>
          <dt className="sr-only">Trame de points</dt>
          <dd className={T.folio}>territoire couvert</dd>
        </div>
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0" aria-hidden>
            <circle
              cx="7"
              cy="7"
              r="5.4"
              fill="none"
              stroke={VERMILION}
              strokeWidth="1.3"
              strokeDasharray="2.4 2.2"
            />
          </svg>
          <dt className="sr-only">Cercle pointillé vermillon</dt>
          <dd className={T.folio}>annotation de l'éditeur</dd>
        </div>
      </dl>
      {/* the pencilled aside — vermilion, slightly askew, points at page 3 */}
      <div className="mt-4 flex justify-end pr-1">
        <MarginNote side="right">
          <a
            href="#lead"
            className="underline decoration-[#bf3415]/50 decoration-1 underline-offset-2 transition-colors hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]"
          >
            l'Est a fait la une — voir l'enquête p. 3 ↘
          </a>
        </MarginNote>
      </div>
    </SettleIn>
  );
}

/**
 * Feuille de relevés — the surveyor's hourly log behind a disclosure. Real
 * <button> with aria-expanded/aria-controls; the panel enters on opacity and
 * a small y-slide only (no height animation — motion budget). The 16 h 04 row
 * is the page-3 incident, flagged in vermilion.
 */
function CartoReadingsSheet() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="border border-[#d6ccb6]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#1c1914]/[0.04] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]"
      >
        <span className="font-grotesk text-[12px] font-bold uppercase tracking-[0.18em] text-[#1c1914]">
          Feuille de relevés — 11 juin
        </span>
        <span className="flex items-center gap-2">
          <span className={`hidden sm:block ${T.folio}`}>9 mesures</span>
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 text-[#4a4438] transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            strokeWidth={2}
          />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            initial={reduce ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease: EASE_INK }}
            className="border-t border-[#d6ccb6] px-4 pb-4"
          >
            <table className="w-full border-collapse">
              <caption className="sr-only">
                Relevés horaires du 11 juin : heure, région mesurée, taux de réussite et note du
                bureau des cartes.
              </caption>
              <thead>
                <tr className="border-b border-[#d6ccb6]">
                  <th scope="col" className={`py-2 pr-3 text-left ${T.folio}`}>
                    Heure
                  </th>
                  <th scope="col" className={`py-2 pr-3 text-left ${T.folio}`}>
                    Région
                  </th>
                  <th scope="col" className={`py-2 pr-3 text-right ${T.folio}`}>
                    Réussite
                  </th>
                  <th scope="col" className={`hidden py-2 text-left sm:table-cell ${T.folio}`}>
                    Note
                  </th>
                </tr>
              </thead>
              <tbody>
                {CARTO_READINGS.map((r) => (
                  <tr
                    key={r.heure}
                    className={`border-b border-[#d6ccb6]/70 last:border-b-0 ${
                      r.alarm ? "text-[#bf3415]" : "text-[#1c1914]"
                    }`}
                  >
                    <td className="py-1.5 pr-3 font-mono text-[11px] tabular-nums">{r.heure}</td>
                    <td className="py-1.5 pr-3 font-grotesk text-[11px] font-semibold uppercase tracking-[0.06em]">
                      {r.region}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono text-[11px] font-semibold tabular-nums">
                      {r.valeur}
                    </td>
                    <td className="hidden py-1.5 font-serif text-[12.5px] italic leading-snug text-[#4a4438] sm:table-cell">
                      {r.alarm ? <span className="text-[#bf3415]">{r.note}</span> : r.note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
 *  DÉPÊCHES RÉGIONALES — three datelined briefs under the plate
 * ═════════════════════════════════════════════════════════════════════════════ */

/**
 * One dispatch. Dateline in small caps, body in serif, the figure set large
 * in mono beneath — a news brief with its own statistic. The half-degree
 * rotation from index math gives each brief the faint misregistration of a
 * page pulled off a real press.
 */
function CartoDispatch({ item, index }: { item: CartoDispatchItem; index: number }) {
  const tilt = Math.sin(index * 2.7) * 0.45;
  return (
    <SettleIn delay={index * 0.1} className="md:px-6 md:first:pl-0 md:last:pr-0">
      <article style={{ transform: `rotate(${tilt}deg)` }}>
        <div className={`flex items-baseline justify-between gap-2 ${T.folio}`}>
          <span>Dépêche · {item.heure}</span>
          <span className="uppercase">{item.canal}</span>
        </div>
        <Rule className="mb-3 mt-1.5 bg-[#1c1914]" />
        <p className="font-serif text-[16px] leading-[1.55] text-[#1c1914]">
          <span className="font-grotesk text-[13px] font-bold uppercase tracking-[0.1em]">
            {item.dateline} —{" "}
          </span>
          {item.body}
        </p>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="font-mono text-[1.3rem] font-semibold tabular-nums leading-none text-[#1c1914]">
            {item.figure}
          </span>
          <span className={T.folio}>{item.figureLabel}</span>
        </div>
      </article>
    </SettleIn>
  );
}

/**
 * The dispatch rail — an uneven three-column setting (first column wider,
 * hairline column rules) so it reads as a newspaper brief column, not a
 * feature-card grid. Stacks with generous rhythm below md.
 */
function CartoDispatchRail() {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-serif text-[1.55rem] font-medium leading-tight tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
          Dépêches régionales
        </h3>
        <span className={T.folio}>trois brèves · bouclées le 11 juin, 23 h 59</span>
      </div>
      <DoubleRule className="mt-3" />
      <div className="mt-6 grid gap-y-10 md:grid-cols-[1.15fr_1fr_1fr] md:divide-x md:divide-[#d6ccb6] md:gap-y-0">
        {CARTO_DISPATCHES.map((item, i) => (
          <CartoDispatch key={item.dateline} item={item} index={i} />
        ))}
      </div>
      <div className="mt-8 flex justify-end">
        <InkLink href="#lead">
          L'enquête complète sur l'incident de l'Est — p. 3
          <ArrowUpRight aria-hidden className="ml-1 inline h-3.5 w-3.5 align-[-2px]" strokeWidth={2.2} />
        </InkLink>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
 *  NOTE TECHNIQUE — the footnote band the security team reads twice
 * ═════════════════════════════════════════════════════════════════════════════ */

/** One row of the layer inventory: name + spec on the left, weight right. */
function CartoLayerLine({ layer }: { layer: CartoLayerRow }) {
  return (
    <li className="border-b border-[#d6ccb6] py-2.5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-grotesk text-[13px] font-semibold text-[#1c1914]">{layer.couche}</span>
        <span className="font-mono text-[12px] tabular-nums text-[#1c1914]">{layer.poids}</span>
      </div>
      <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="font-mono text-[10px] tracking-[0.06em] text-[#857c69]">{layer.detail}</span>
        <span className="font-serif text-[12.5px] italic text-[#4a4438]">{layer.note}</span>
      </div>
    </li>
  );
}

/**
 * Full-bleed deep-paper band. Left: the bunker line (verbatim, in guillemets,
 * as the desk's official position) plus the sober English explanation and a
 * green RENDU LOCAL stamp. Right: the layer inventory with its 29,0 Mo total
 * and the zero-outbound-requests counter — WifiOff is the only icon allowed
 * to editorialise here.
 */
function CartoFootnote() {
  return (
    <div className="border-y border-[#d6ccb6] bg-[#eee6d6]">
      <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 sm:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div>
            <p className={T.kicker}>Note technique — le fond de carte</p>
            <SettleIn className="mt-4">
              <p className="font-serif text-[clamp(1.45rem,2.6vw,2rem)] font-medium leading-[1.25] tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
                « Cartes PMTiles embarquées — fonctionne dans un{" "}
                <PenUnderline delay={0.5}>bunker</PenUnderline>. »
              </p>
            </SettleIn>
            <SettleIn delay={0.1} className="mt-5 max-w-[52ch]">
              <p className={T.ui}>
                The base map ships inside the installer and renders with MapLibre GL straight
                from disk. No tile server, no API key, no outbound request — if the building
                loses its uplink, page 8 prints anyway. The régions join onto the CSV in the
                same DuckDB process that set the rest of this edition.
              </p>
            </SettleIn>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Stamp color={STAMP_GREEN} tilt={-6}>
                Rendu local
              </Stamp>
              <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#4a4438]">
                <WifiOff aria-hidden className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                requêtes sortantes pendant le rendu : 0
              </span>
            </div>
          </div>
          <SettleIn delay={0.15}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="flex items-center gap-2 font-grotesk text-[12px] font-bold uppercase tracking-[0.22em] text-[#1c1914]">
                <Layers aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
                Inventaire des couches
              </h3>
              <span className={T.folio}>5 couches · 29,0 Mo</span>
            </div>
            <Rule className="mt-3 bg-[#1c1914]" />
            <ul className="mt-1">
              {CARTO_LAYERS.map((layer) => (
                <CartoLayerLine key={layer.couche} layer={layer} />
              ))}
            </ul>
            <p className={`mt-3 ${T.folio}`}>
              poids total vérifié au bouclage — rien d'autre ne touche le disque
            </p>
          </SettleIn>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
 *  ACCESSIBILITY — the spoken version of the plate
 * ═════════════════════════════════════════════════════════════════════════════ */

/**
 * Screen-reader summary. The map stack is aria-hidden end to end, so this
 * paragraph + list state everything the ink says: the three callouts, the
 * incident hour, and each région's verdict from the legend data.
 */
function CartoSrSummary() {
  return (
    <div className="sr-only">
      <p>
        Carte des régions du 11 juin : le Nord tient 99,2 % de réussite, le Centre 98,9 %, et
        l'Est signale un incident de passerelle survenu à 16 h 04, ramenant sa journée à
        91,4 %. Détail complet par région ci-dessous, dans la légende.
      </p>
      <ul>
        {CARTO_REGIONS.map((r) => (
          <li key={r.region}>
            {r.region} ({r.chef}) : {r.part} du trafic, réussite {r.reussite}, écart {r.delta}{" "}
            point par rapport à la veille — {r.note}.
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════════
 *  §10 ROOT — CartoSection
 *  Page rhythm: mast → headline + article column → plate (parallax pair) with
 *  legend rail → dispatch rail → technical footnote band → folio. The only
 *  other section referenced is #lead (the page-3 enquête), twice, on purpose.
 * ═════════════════════════════════════════════════════════════════════════════ */

function CartoSection() {
  return (
    <section
      id="carto"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 2900px" }}
    >
      <div className="mx-auto max-w-[1180px] px-5 pb-8 pt-20 sm:px-8 sm:pt-28">
        <SectionMast rubrique="Cartographie" no="p. 8" />
        <CartoSrSummary />

        {/* ── headline row: deck left, article column right ─────────────────── */}
        <div className="mt-12 grid gap-10 sm:mt-16 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <SettleIn>
              <p className={T.kicker}>Rubrique VIII · le bureau des cartes</p>
            </SettleIn>
            <DeckReveal
              className="mt-4"
              lines={[
                <span
                  key="l1"
                  className="font-serif text-[clamp(2.5rem,5.2vw,4.5rem)] font-medium leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  Six régions, one plate,
                </span>,
                <span
                  key="l2"
                  className="font-serif text-[clamp(2.5rem,5.2vw,4.5rem)] font-medium leading-[0.98] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
                >
                  <PenUnderline delay={0.7}>no satellite</PenUnderline> required.
                </span>,
              ]}
            />
            <SettleIn delay={0.15} className="mt-6 max-w-[58ch]">
              <p className="font-grotesk text-[17px] leading-relaxed text-[#4a4438]">
                Geo analysis runs on the same desk as everything else: PMTiles base map in the
                installer, MapLibre drawing from disk, régions joined straight off the CSV. The
                map is finished before the kettle is.
              </p>
            </SettleIn>
            <Byline className="mt-6" name="Le bureau des cartes" desk="Géo hors ligne · MapLibre & PMTiles" />
          </div>
          <div className="lg:col-span-5 lg:pt-12">
            <DropCapParagraph>
              Maps are where dashboards go to exaggerate. The Daily Edition treats geography
              like any other column of the report: each of the 2 147 380 transactions carries a
              région, each région earns its dots on the plate, and the plate gets printed
              whether the news is good or not. On the 11th it mostly was — five régions filed
              between 97,8 % and 99,2 %.
            </DropCapParagraph>
            <p className={`mt-4 ${T.body}`}>
              The exception sits east. At 16 h 04 the Sfax gateway dropped, réussite fell to
              71,2 % inside the half-hour, and the desk re-routed 38 412 transactions through
              SFX-1 before the evening close. The full enquête runs on{" "}
              <a
                href="#lead"
                className="font-medium italic text-[#2b4a8b] underline decoration-[#2b4a8b]/40 underline-offset-[3px] transition-colors hover:decoration-[#bf3415] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]"
              >
                page 3
              </a>
              ; the map just shows you where it happened.
            </p>
          </div>
        </div>

        {/* ── the plate + legend rail ───────────────────────────────────────────
             Two parallax speeds: the backing frame (20) lags the plate (45), so
             the pair separates as the reader scrolls — two physical plates on a
             light table. The backing frame is decorative, never interactive. */}
        <div className="mt-14 grid items-start gap-10 sm:mt-20 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
          <div className="relative">
            <Parallax speed={20} className="pointer-events-none absolute inset-0">
              <div
                aria-hidden
                className="absolute inset-0 translate-x-3 translate-y-4 border-2 border-[#1c1914]/25 sm:translate-x-5 sm:translate-y-6"
              />
            </Parallax>
            <Parallax speed={45}>
              <CartoPlate />
            </Parallax>
          </div>
          <div className="flex flex-col gap-5">
            <CartoLegend />
            <CartoReadingsSheet />
          </div>
        </div>

        {/* ── dépêches ──────────────────────────────────────────────────────── */}
        <div className="mt-20 sm:mt-24">
          <CartoDispatchRail />
        </div>
      </div>

      {/* ── note technique — full-bleed deep paper band ─────────────────────── */}
      <div className="mt-14 sm:mt-20">
        <CartoFootnote />
      </div>

      {/* ── folio ───────────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-[1180px] px-5 pb-14 pt-10 sm:px-8">
        <Rule className="mb-4" />
        <FolioLine page="p. 8" note="Cartographie · planche VIII · fond de carte embarqué" />
      </div>
    </section>
  );
}
