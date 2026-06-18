/* ════════════════════════════════════════════════════════════════════════════
 *  §14 — LETTERS · COURRIER DES LECTEURS · p. 12
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Testimonials, but printed the only honest way a newspaper knows how:
 *  as reader mail. Four letters lie on the page like scraps on the courrier
 *  desk — each on its own paper shade, each tilted a degree or two off true,
 *  each drifting at its own parallax speed so the desk feels three scraps
 *  deep. Every letter carries the full postal apparatus: a torn deckle edge
 *  where it was opened with the coupe-papier, a postage stamp in the corner
 *  (perforated, with the persona's trade as the engraving), and a vermilion
 *  postmark — double ring, curved town name, wavy killer bars cancelling the
 *  stamp — because ink that has travelled should look like it.
 *
 *  Editorial honesty is the design brief here. The mast carries the
 *  disclaimer in plain serif italic — "Lettres authentiquement fictives —
 *  vos chiffres, eux, seront réels." — and the footnote at the bottom of the
 *  rubrique explains exactly how the composites were assembled. A landing
 *  page that fakes testimonials silently is slop; one that says "these are
 *  composites, the stopwatch is real" is a newspaper.
 *
 *  Layout: an intro column (the courrier desk's own ledger — counts, the
 *  registre, a cut-out coupon) sits sticky at lg while the letters scroll
 *  past in a two-column scatter. Below, the "aussi reçu" digest prints the
 *  one-liners that didn't earn a full column. Motion stays inside budget:
 *  Parallax (transform), InkPath postmarks (pathLength), SettleIn reveals
 *  (opacity/transform), one green VISÉ stamp slam (ed-stamp). Everything
 *  routes through useReducedMotion via the preamble primitives.
 * ════════════════════════════════════════════════════════════════════════════ */

/** One reader letter — the full postal object, not just a quote. */
type LettersLetter = {
  /** stable key + anchor for margin furniture */
  id: string;
  /** courrier desk filing reference, set in mono in the letter head */
  refCode: string;
  /** the "Objet:" line — French data label per the bilingual newsroom rule */
  objet: string;
  /** reception dateline, e.g. "Reçu le 3 juin" */
  received: string;
  /** how the letter physically arrived — desk wit, one per letter */
  via: string;
  salutation: string;
  /** serif body; ReactNode so the editor's pen (PenCircle/PenUnderline) can mark figures */
  paragraphs: ReadonlyArray<ReactNode>;
  signature: { name: string; role: string; city: string };
  /** vermilion cancellation: curved town arc, date + heure in the ring */
  postmark: { town: string; date: string; time: string; tilt: number };
  /** corner postage stamp: trade glyph + a denomination that tells the story */
  stamp: { icon: ReactNode; denomination: string };
  /** alternating scrap shade — PAPER_DEEP / PAPER_SHADE per the brief */
  shade: string;
  /** static scrap tilt, −2..2deg */
  tilt: number;
  /** px of parallax drift — every scrap floats at its own depth */
  parallax: number;
  /** degrees of slow parallax rotation across the transit (organic, tiny) */
  drift: number;
  /** lg-only top padding class, staggering the two-column scatter */
  lift: string;
  /** the courrier desk's routing slip, stamped at the letter's foot */
  routing: ReadonlyArray<{ step: string; time: string }>;
  /** optional rubber stamp slammed beside the signature (Karim's VISÉ) */
  approval?: { label: string; tilt: number };
  /** optional editor's reply scrap, paperclipped under the letter */
  reply?: ReactNode;
  /** optional pencilled marginalia tucked beneath the scrap at lg */
  marginNote?: string;
};

/* ── The mail itself ──────────────────────────────────────────────────────
 *  Four composites. Diverse names, real trades, organic numbers, and the
 *  one rule of the rubrique: every figure quoted survived the desk's
 *  stopwatch. The grudging one goes last — scepticism is the best closer. */
const LETTERS_MAIL: ReadonlyArray<LettersLetter> = [
  {
    id: "sana",
    refCode: "Réf. CL-847/114",
    objet: "Six heures devenues onze minutes",
    received: "Reçu le 3 juin",
    via: "par porteur",
    salutation: "À la rédaction,",
    paragraphs: [
      <>
        For four years my mornings belonged to a spreadsheet. The daily file lands at 6 h 02 —
        2 147 380 rows of DailyTransactions — and by the time the pivot tables stopped repainting
        it was mid-afternoon. Six hours on a good day, with the door closed and the fan begging.
      </>,
      <>
        Last Tuesday I dropped the same file into Data Navigator at 7 h 49. It profiled the
        columns, flagged two canaux I would have missed, and put the finished PDF on my desk at{" "}
        <PenCircle delay={0.5}>
          <strong className="font-mono text-[15px] font-bold tracking-tight">8 h 00</strong>
        </PenCircle>
        . Eleven minutes, end to end. I timed it twice because I did not believe it once.
      </>,
      <>
        I have spent the recovered afternoons hunting the billing anomalies nobody ever had time
        for. Found three. Print this letter so my chef d’exploitation stops asking what changed.”
      </>,
    ],
    signature: { name: "Sana B.", role: "Analyste réseau", city: "Sfax" },
    postmark: { town: "SFAX · COURRIER", date: "03-06", time: "07 H 49", tilt: -7 },
    stamp: {
      icon: <RadioTower aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.7} />,
      denomination: "11 MIN",
    },
    shade: PAPER_DEEP,
    tilt: -1.7,
    parallax: 18,
    drift: 0.5,
    lift: "",
    routing: [
      { step: "Levée", time: "06 h 12" },
      { step: "Tri", time: "06 h 40" },
      { step: "Marbre", time: "07 h 05" },
    ],
    reply: (
      <>
        La rédaction confirme : 11 minutes, montre en main. Le chrono est posé sur le bureau du
        rédacteur en chef ; il fait foi.{" "}
        <span className="font-grotesk text-[11px] font-bold not-italic uppercase tracking-[0.14em]">
          — N.D.L.R.
        </span>
      </>
    ),
  },
  {
    id: "karim",
    refCode: "Réf. CL-847/093",
    objet: "Approuvé pour ce qu’il ne fait pas",
    received: "Reçu le 28 mai",
    via: "par pli interne",
    salutation: "Monsieur le rédacteur,",
    paragraphs: [
      <>
        Security reviews are where my tools go to die. The questionnaire alone has outlived three
        vendors, and the analysts have learned not to name anything before it clears. So when the
        audit team took on Data Navigator, I scheduled a month and warned the desk not to get
        attached.
      </>,
      <>
        The review took eight days. They unplugged the network cable, ran the full morning
        pipeline — import, calculs, exports — and watched the firewall log stay{" "}
        <PenUnderline delay={0.45}>empty</PenUnderline>. Their conclusion fits on one line, and I
        have it framed: « Aucune donnée ne quitte le poste. »
      </>,
      <>
        I have approved many tools for what they do. This is the first one I have approved for
        what it refuses to do.”
      </>,
    ],
    signature: { name: "Karim T.", role: "Chef d’exploitation", city: "Tunis" },
    postmark: { town: "TUNIS R.P.", date: "28-05", time: "09 H 12", tilt: 5 },
    stamp: {
      icon: <ShieldCheck aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.7} />,
      denomination: "0 OCTET",
    },
    shade: PAPER_SHADE,
    tilt: 1.4,
    parallax: 40,
    drift: -0.4,
    lift: "lg:pt-24",
    routing: [
      { step: "Levée", time: "08 h 30" },
      { step: "Tri", time: "08 h 51" },
      { step: "Marbre", time: "09 h 04" },
    ],
    approval: { label: "Visé — sécurité", tilt: -6 },
  },
  {
    id: "mounira",
    refCode: "Réf. CL-847/121",
    objet: "Douze diapositives, 7 h 45",
    received: "Reçu le 5 juin",
    via: "sous double enveloppe",
    salutation: "Chère rédaction,",
    paragraphs: [
      <>
        I will be honest with your readers: I do not open dashboards. I chair a regional committee
        at 8 h 00 and I have no appetite for filters before coffee.
      </>,
      <>
        What I open is the PPTX. It is waiting on the regional drive at{" "}
        <PenUnderline delay={0.4}>
          <strong className="font-mono text-[15px] font-bold tracking-tight">7 h 45</strong>
        </PenUnderline>{" "}
        every morning — twelve slides, our own template, the figures already placed and the
        commentary already drafted by the desk’s offline AI. My meeting now begins with decisions
        instead of formatting.
      </>,
      <>
        Whoever taught a database to respect a slide master deserves a promotion. Not mine to
        give — but noted, in writing, in your pages.”
      </>,
    ],
    signature: { name: "Mounira G.", role: "Direction régionale", city: "Sousse" },
    postmark: { town: "SOUSSE GARE", date: "05-06", time: "07 H 45", tilt: -4 },
    stamp: {
      icon: <Presentation aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.7} />,
      denomination: "12 DIAPOS",
    },
    shade: PAPER_DEEP,
    tilt: 1.9,
    parallax: 26,
    drift: 0.4,
    lift: "lg:pt-4",
    routing: [
      { step: "Levée", time: "07 h 58" },
      { step: "Tri", time: "08 h 22" },
      { step: "Marbre", time: "08 h 47" },
    ],
    marginNote: "7 h 45 — avant même le café de la rédaction.",
  },
  {
    id: "yacine",
    refCode: "Réf. CL-847/130",
    objet: "Plainte retirée, à contrecœur",
    received: "Reçu le 9 juin",
    via: "glissée sous la porte",
    salutation: "To whoever edits this page,",
    paragraphs: [
      <>
        I came to file a complaint. I keep a pipeline alive for a living — a cluster, an
        orchestrator, three YAML files I see when I close my eyes. Your paper kept printing that
        a laptop now finishes the same morning aggregation before my cluster finishes
        provisioning. Irresponsible journalism, I thought.
      </>,
      <>
        So I tested it. DuckDB, embedded, no server: the GROUP BY over two million rows came back
        in{" "}
        <PenCircle delay={0.5}>
          <strong className="font-mono text-[15px] font-bold tracking-tight">11 secondes</strong>
        </PenCircle>
        . I read the query plan twice looking for the trick. There is no trick. There is a
        columnar engine doing its job uncomfortably well, on hardware I had already written off.
      </>,
      <>
        Fine. It is fast. I have written it down and I will not be repeating it in person. The
        complaint is withdrawn; the cluster and I need to talk.”
      </>,
    ],
    signature: { name: "Yacine R.", role: "Data engineer", city: "Ariana" },
    postmark: { town: "ARIANA NORD", date: "09-06", time: "23 H 41", tilt: 8 },
    stamp: {
      icon: <Database aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.7} />,
      denomination: "11 SEC",
    },
    shade: PAPER_SHADE,
    tilt: -1.2,
    parallax: 48,
    drift: -0.6,
    lift: "lg:pt-16",
    routing: [
      { step: "Levée", time: "23 h 50" },
      { step: "Tri", time: "06 h 15" },
      { step: "Marbre", time: "06 h 38" },
    ],
    marginNote: "Il a relu le query plan deux fois. Nous aussi.",
  },
];

/* ── The overflow tray ────────────────────────────────────────────────────
 *  One-liners that earned a line of type but not a column. Same honesty
 *  rule applies; the signatures stay in the registre. */
const LETTERS_DIGEST: ReadonlyArray<{ quote: string; sig: string }> = [
  {
    quote: "« Mon VPN n’a jamais été aussi reposé. »",
    sig: "H. K., infrastructure, Gabès",
  },
  {
    quote: "« J’ai cherché le bouton cloud pendant dix minutes. Il n’existe pas. Bravo. »",
    sig: "A. S., conformité, Tunis",
  },
  {
    quote: "« Les prévisions se trompent moins que mon stagiaire. Gardez les deux. »",
    sig: "F. Z., planification, Nabeul",
  },
  {
    quote: "« Le DOCX respecte nos marges. Même la direction n’y arrive pas. »",
    sig: "L. B., qualité, Monastir",
  },
  {
    quote: "« Onze minutes ? Chez nous, neuf. Signé : un service réseau mieux câblé. »",
    sig: "O. T., NOC, Kairouan",
  },
  {
    quote: "« Première application approuvée sans réunion. On s’est sentis inutiles. »",
    sig: "Comité sécurité, anonyme",
  },
];

/* ── The registre — the courrier desk's own ledger, printed in the intro
 *  column. The zero is the line the security teams read first. */
const LETTERS_REGISTRY: ReadonlyArray<{ label: string; value: string; hot?: boolean }> = [
  { label: "Lettres reçues cette semaine", value: "23" },
  { label: "Publiées dans cette édition", value: "4" },
  { label: "Réclamations sur la vitesse", value: "0" },
  { label: "Octets sortis des postes", value: "0", hot: true },
];

/* ── The one that didn't make it ──────────────────────────────────────────
 *  A testimonial page that shows a REJECTED testimonial is making a claim
 *  about its own standards. This slip is that claim: a letter sent back
 *  because it praised in adjectives instead of figures. The desk's rule,
 *  printed where readers can hold it against us. */
const LETTERS_RETURNED = {
  refCode: "Réf. CL-847/108",
  received: "Reçu le 6 juin",
  excerpt: "« Deux fois plus rapide que tout ce que j’ai connu, un outil incroyable… »",
  motif: "Motif — superlatif sans unité. Aucun chiffre, aucune montre, aucun fichier.",
  verdict:
    "Retournée à l’expéditeur avec le chrono de la rédaction, en prêt. Le courrier publie des minutes, pas des adjectifs.",
} as const;

/* ── Errata du courrier ───────────────────────────────────────────────────
 *  A newspaper that corrects itself is a newspaper you can quote. Two
 *  corrections, one of which corrects nothing — that joke IS the security
 *  posture, restated as print furniture. */
const LETTERS_ERRATA: ReadonlyArray<{ edition: string; text: string }> = [
  {
    edition: "Édition du 5 juin",
    text: "M. Yacine R. était crédité de « 12 secondes ». Il insiste : 11. Dont acte, et nos excuses au moteur.",
  },
  {
    edition: "Édition du 29 mai",
    text: "Le registre annonçait « 0 octet sorti des postes ». Après recomptage : toujours 0. La rédaction maintient.",
  },
];

/* ════════════════════════════════════════════════════════════════════════════
 *  POSTAL FURNITURE — the apparatus that makes a quote into mail
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Airmail rule — the par-avion border, alternating vermilion and press-blue
 * slants. Printed once under the mast and once on the coupon: it is the
 * rubrique's signature ornament, not a repeating texture. Static DOM, zero
 * animation cost. Width overshoots (72 × 24px ≈ 1 730px) and clips, so it
 * holds from 360px to 1680px without measurement.
 */
function LettersAirmailRule({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`flex h-[9px] items-stretch overflow-hidden ${className ?? ""}`}>
      {Array.from({ length: 72 }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: static ornament segments
          key={i}
          className="mr-[7px] inline-block h-full w-[17px] shrink-0 -skew-x-[24deg]"
          style={{ backgroundColor: i % 2 === 0 ? VERMILION : PRESS_BLUE }}
        />
      ))}
    </div>
  );
}

/**
 * Deckle edge — the torn top of a scrap, opened with the coupe-papier.
 * The silhouette is deterministic sine jitter seeded per letter (rule 13:
 * no Math.random), filled in the scrap's own shade so it reads as part of
 * the paper against the page background.
 */
function LettersDeckleEdge({ seed, fill }: { seed: number; fill: string }) {
  const d = useMemo(() => {
    const steps = 46;
    const w = 640;
    const h = 12;
    let path = `M0,${h}`;
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * w;
      const y =
        6 + Math.sin(i * 1.9 + seed * 3.1) * 2.6 + Math.cos(i * 0.7 + seed * 1.7) * 1.8;
      path += ` L${x.toFixed(1)},${y.toFixed(1)}`;
    }
    return `${path} L${w},${h} Z`;
  }, [seed]);
  return (
    <svg
      aria-hidden
      viewBox="0 0 640 12"
      preserveAspectRatio="none"
      className="absolute -top-[11px] left-0 h-[12px] w-full"
    >
      <path d={d} fill={fill} />
    </svg>
  );
}

/**
 * The vermilion postmark — double InkPath ring drawn on scroll, town name
 * curved along the upper arc, TUNISIE smiling along the lower, date and
 * heure set in mono at the centre, three wavy killer bars cancelling the
 * stamp to the right. mix-blend-multiply lets the ink sit INTO the paper
 * and the stamp beneath it, the way real cancellation ink does.
 */
function LettersPostmark({
  town,
  date,
  time,
  tilt,
}: {
  town: string;
  date: string;
  time: string;
  tilt: number;
}) {
  const id = useId().replace(/[:]/g, "");
  return (
    <svg
      aria-hidden
      viewBox="0 0 178 96"
      className="h-[78px] w-[144px] mix-blend-multiply sm:h-[88px] sm:w-[163px]"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      <defs>
        {/* upper arc for the town name, lower arc (smiling) for the country */}
        <path id={`lpm-top-${id}`} d="M14,48 a34,34 0 0 1 68,0" />
        <path id={`lpm-bot-${id}`} d="M19,48 a29,29 0 0 0 58,0" />
      </defs>
      {/* double ring, drawn outside-in like a cancellation press coming down */}
      <InkPath d="M48,7 a41,41 0 1 1 -0.02,0" stroke={VERMILION} strokeWidth={2.2} duration={0.8} />
      <InkPath
        d="M48,14 a34,34 0 1 1 -0.02,0"
        stroke={VERMILION}
        strokeWidth={1.3}
        delay={0.18}
        duration={0.75}
      />
      <text
        fontSize="7.5"
        fontFamily="var(--font-mono)"
        fontWeight="700"
        letterSpacing="2"
        fill={VERMILION}
      >
        <textPath href={`#lpm-top-${id}`} startOffset="50%" textAnchor="middle">
          {town}
        </textPath>
      </text>
      <text fontSize="6.5" fontFamily="var(--font-mono)" letterSpacing="2.6" fill={VERMILION}>
        <textPath href={`#lpm-bot-${id}`} startOffset="50%" textAnchor="middle">
          TUNISIE
        </textPath>
      </text>
      {/* the date block — the part readers actually check */}
      <text
        x="48"
        y="45.5"
        textAnchor="middle"
        fontSize="9.5"
        fontWeight="700"
        fontFamily="var(--font-mono)"
        letterSpacing="1"
        fill={VERMILION}
      >
        {date}
      </text>
      <text
        x="48"
        y="56"
        textAnchor="middle"
        fontSize="7"
        fontFamily="var(--font-mono)"
        letterSpacing="1.4"
        fill={VERMILION}
      >
        {time}
      </text>
      <text x="13.5" y="51" fontSize="7" fill={VERMILION}>
        ✦
      </text>
      <text x="77.5" y="51" fontSize="7" fill={VERMILION}>
        ✦
      </text>
      {/* killer bars — they ride over the stamp via absolute positioning */}
      <InkPath
        d="M96,30 q9,-5 18,0 t18,0 t18,0 t18,0"
        stroke={VERMILION}
        strokeWidth={2.4}
        delay={0.3}
        duration={0.5}
      />
      <InkPath
        d="M96,48 q9,-5 18,0 t18,0 t18,0 t18,0"
        stroke={VERMILION}
        strokeWidth={2.4}
        delay={0.38}
        duration={0.5}
      />
      <InkPath
        d="M96,66 q9,-5 18,0 t18,0 t18,0 t18,0"
        stroke={VERMILION}
        strokeWidth={2.4}
        delay={0.46}
        duration={0.5}
      />
    </svg>
  );
}

/**
 * Corner postage stamp — dotted outer border standing in for perforation,
 * a thin vermilion frame, the persona's trade as the engraving, and a
 * denomination that prices the letter in the unit that matters (11 MIN,
 * 0 OCTET…). Sits under the postmark's killer bars in the z-order.
 */
function LettersStampCorner({ icon, denomination }: { icon: ReactNode; denomination: string }) {
  return (
    <div
      aria-hidden
      className="relative h-[64px] w-[52px] rotate-[2.5deg] border-2 border-dotted border-[#857c69]/70 bg-[#f6f1e7] p-[4px] shadow-[3px_3px_0_#1c1914] sm:h-[72px] sm:w-[58px] sm:p-[5px]"
    >
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 border-[1.5px] border-[#bf3415] bg-[#eee6d6] text-[#1c1914]">
        {icon}
        <span className="font-mono text-[7.5px] font-semibold tracking-[0.06em] text-[#bf3415] sm:text-[8px]">
          {denomination}
        </span>
      </div>
    </div>
  );
}

/**
 * The full postal corner: stamp at right, postmark overlapping from the
 * left so its killer bars cancel the stamp. Pointer-events off — it is
 * furniture, not UI. The letter head reserves height for it (min-h on the
 * head row) so body copy never collides, even at 360px.
 */
function LettersPostalCorner({ letter }: { letter: LettersLetter }) {
  return (
    <div className="pointer-events-none absolute right-4 top-4 sm:right-6 sm:top-5">
      <div className="relative">
        <LettersStampCorner icon={letter.stamp.icon} denomination={letter.stamp.denomination} />
        <div className="absolute -left-[88px] top-0 z-10 sm:-left-[100px] sm:top-0.5">
          <LettersPostmark
            town={letter.postmark.town}
            date={letter.postmark.date}
            time={letter.postmark.time}
            tilt={letter.postmark.tilt}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Routing slip — the desk's own stamp at the letter's foot: levée, tri,
 * marbre, each ticked in proof-green, destination p. 12 in vermilion.
 * Pure print furniture; it also quietly tells the reader every letter on
 * this page went through a human tri.
 */
function LettersRoutingSlip({ routing }: { routing: ReadonlyArray<{ step: string; time: string }> }) {
  return (
    <div className="mt-6 border-t border-[#d6ccb6] pt-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#857c69]">
          Acheminement
        </span>
        {routing.map((s) => (
          <span key={s.step} className="inline-flex items-center gap-1.5">
            <Check aria-hidden className="h-3 w-3 text-[#2f6b3f]" strokeWidth={3} />
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#4a4438]">
              {s.step} {s.time}
            </span>
          </span>
        ))}
        <span className="ml-auto font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[#bf3415]">
          → p. 12
        </span>
      </div>
    </div>
  );
}

/** Hand-drawn ink flourish under a reader's signature — readers sign in ink;
 *  only the editor writes in vermilion. */
function LettersSignatureFlourish() {
  return (
    <svg aria-hidden viewBox="0 0 130 10" className="h-[9px] w-[120px]">
      <InkPath
        d="M3,6 C 22,1 40,9 60,4 S 98,2 127,6"
        stroke={INK}
        strokeWidth={1.6}
        delay={0.25}
        duration={0.5}
      />
    </svg>
  );
}

/**
 * The editor's reply — a smaller scrap paperclipped beneath a letter,
 * set in italic vermilion because it is the pen, not the press, speaking.
 * Only one letter earns a reply; restraint is what makes it land.
 */
function LettersEditorReply({ children }: { children: ReactNode }) {
  return (
    <SettleIn y={12} className="relative z-10 -mt-3 ml-5 mr-8 sm:ml-12 sm:mr-16">
      <div className="relative rotate-[1.3deg] border border-[#d6ccb6] bg-[#f6f1e7] px-5 py-4 shadow-[3px_3px_0_#1c1914]">
        <Paperclip
          aria-hidden
          className="absolute -top-3.5 left-6 h-6 w-6 -rotate-12 text-[#4a4438]"
          strokeWidth={1.6}
        />
        <div className="flex items-start gap-2.5">
          <PenLine aria-hidden className="mt-1 h-4 w-4 shrink-0 text-[#bf3415]" strokeWidth={1.8} />
          <p className="font-serif text-[15px] italic leading-[1.55] text-[#bf3415]">{children}</p>
        </div>
      </div>
    </SettleIn>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  THE LETTER SCRAP — one reader's mail, complete
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * A single letter on its scrap. A real component (not a map callback) so
 * the postmark's useId and the deckle's useMemo run legally. Each scrap:
 * static tilt from data, its own Parallax depth and a whisper of rotation
 * drift, deckle edge in its own shade, offset-print shadow, and a hover
 * lift on a separate wrapper so the transform doesn't fight the tilt.
 */
function LettersLetterCard({ letter, index }: { letter: LettersLetter; index: number }) {
  return (
    <Parallax speed={letter.parallax} rotate={letter.drift} className={letter.lift}>
      <div className="transition-transform duration-300 ease-out hover:-translate-y-1">
        <div style={{ transform: `rotate(${letter.tilt}deg)` }}>
          <article
            aria-label={`Lettre de ${letter.signature.name}, ${letter.signature.role}`}
            className="relative shadow-[4px_4px_0_#1c1914]"
            style={{ backgroundColor: letter.shade }}
          >
            <LettersDeckleEdge seed={index + 1} fill={letter.shade} />
            <LettersPostalCorner letter={letter} />

            <div className="px-6 pb-7 pt-6 sm:px-8 sm:pb-9 sm:pt-7">
              {/* letter head — filing ref top-left, postal corner reserves the right */}
              <div className="min-h-[84px] sm:min-h-[92px]">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#857c69]">
                  {letter.refCode}
                </p>
                <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#857c69]">
                  Courrier · {EDITION.issue}
                </p>
              </div>

              <Rule className="mb-4" />

              {/* the Objet line — French data label, grotesk, the rubrique's handle */}
              <p className="font-grotesk text-[12px] font-bold uppercase tracking-[0.18em] text-[#1c1914]">
                Objet — {letter.objet}
              </p>
              <p className={`mt-1.5 ${T.folio}`}>
                {letter.received} · {letter.via}
              </p>

              {/* serif body with a hanging quotation mark — these are spoken words */}
              <div className="relative mt-6">
                <span
                  aria-hidden
                  className="absolute -left-1.5 -top-5 select-none font-serif text-[3.4rem] leading-none text-[#1c1914]/60"
                >
                  “
                </span>
                <p className="pl-7 font-serif text-[15px] italic leading-snug text-[#4a4438]">
                  {letter.salutation}
                </p>
                <div className="mt-3 space-y-4 pl-7">
                  {letter.paragraphs.map((para, pi) => (
                    <p
                      // biome-ignore lint/suspicious/noArrayIndexKey: static letter copy
                      key={pi}
                      className="font-serif text-[16px] leading-[1.68] text-[#1c1914]"
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </div>

              {/* signature row — optional rubber stamp left, grotesk signature right */}
              <div className="mt-7 flex items-end justify-between gap-4">
                <div className="min-w-0">
                  {letter.approval && (
                    <Stamp color={STAMP_GREEN} tilt={letter.approval.tilt}>
                      {letter.approval.label}
                    </Stamp>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  <LettersSignatureFlourish />
                  <span className="font-grotesk text-[13px] font-bold uppercase tracking-[0.14em] text-[#1c1914]">
                    {letter.signature.name}
                  </span>
                  <span className="font-serif text-[13px] italic leading-tight text-[#4a4438]">
                    {letter.signature.role} · {letter.signature.city}
                  </span>
                </div>
              </div>

              <LettersRoutingSlip routing={letter.routing} />
            </div>
          </article>

          {letter.reply && <LettersEditorReply>{letter.reply}</LettersEditorReply>}

          {/* pencilled marginalia, tucked under the scrap edge — xl only, where
              the desk has room to scribble without colliding with the next scrap */}
          {letter.marginNote && (
            <div className="relative hidden xl:block">
              <div className="absolute -bottom-2 right-10 translate-y-full">
                <MarginNote side="right">{letter.marginNote}</MarginNote>
              </div>
            </div>
          )}
        </div>
      </div>
    </Parallax>
  );
}

/**
 * The returned letter — a thin slip on plain paper (lighter than the four
 * scraps, soft lift instead of offset shadow: it never reached the press).
 * It closes the scatter grid: after four letters that passed the stopwatch,
 * the reader sees what failing it looks like. The strike-through on the
 * quoted superlative is the editor's pen doing the rejecting, live.
 */
function LettersReturnedSlip() {
  return (
    <Parallax speed={30} rotate={-0.3} className="lg:pt-6">
      <div className="transition-transform duration-300 ease-out hover:-translate-y-1">
        <div style={{ transform: "rotate(0.9deg)" }}>
          <aside
            aria-label="Lettre retournée par la rédaction"
            className="relative border border-[#d6ccb6] bg-[#f6f1e7] px-6 py-6 shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)] sm:px-7"
          >
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#857c69]">
                  {LETTERS_RETURNED.refCode}
                </p>
                <p className={`mt-1.5 ${T.folio}`}>{LETTERS_RETURNED.received} · non publiée</p>
              </div>
              <Stamp color={VERMILION} tilt={6}>
                Retourné au lecteur
              </Stamp>
            </div>

            <Rule className="my-4" />

            {/* the offending sentence, struck through by the pen itself */}
            <p className="font-serif text-[15.5px] italic leading-[1.6] text-[#4a4438]">
              <PenStrike delay={0.55}>{LETTERS_RETURNED.excerpt}</PenStrike>
            </p>
            <p className="mt-3 font-grotesk text-[11px] font-bold uppercase tracking-[0.16em] text-[#bf3415]">
              {LETTERS_RETURNED.motif}
            </p>
            <p className={`mt-3 ${T.ui}`}>{LETTERS_RETURNED.verdict}</p>

            <div className="mt-5 flex items-center gap-2 border-t border-[#d6ccb6] pt-3">
              <CornerUpLeft aria-hidden className="h-3.5 w-3.5 text-[#857c69]" strokeWidth={2} />
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#857c69]">
                Réexpédition · affranchie à 0 octet, comme tout le reste
              </span>
            </div>
          </aside>
        </div>
      </div>
    </Parallax>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  THE COURRIER DESK — intro column: ledger, registre, coupon
 * ════════════════════════════════════════════════════════════════════════════ */

/** Registre row — one line of the desk's ledger; the zero rows run hot. */
function LettersRegistryRow({ entry }: { entry: { label: string; value: string; hot?: boolean } }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#d6ccb6] py-2.5">
      <span className="font-grotesk text-[12px] uppercase tracking-[0.12em] text-[#4a4438]">
        {entry.label}
      </span>
      {entry.hot ? (
        <PenCircle delay={0.6}>
          <span className="font-mono text-[15px] font-bold tabular-nums text-[#bf3415]">
            {entry.value}
          </span>
        </PenCircle>
      ) : (
        <span className="font-mono text-[15px] font-bold tabular-nums text-[#1c1914]">
          {entry.value}
        </span>
      )}
    </div>
  );
}

/**
 * The cut-out coupon — dashed border, scissors at the corner, one outline
 * button. The rubrique's only call to action, priced like everything else
 * on this page: in the reader's own minutes.
 */
function LettersCoupon() {
  return (
    <SettleIn delay={0.15} className="relative mt-10">
      <div className="relative border-2 border-dashed border-[#857c69] p-5 sm:p-6">
        <Scissors
          aria-hidden
          className="absolute -top-[13px] left-5 h-5 w-5 rotate-90 bg-[#f6f1e7] px-0.5 text-[#4a4438]"
          strokeWidth={1.8}
        />
        <LettersAirmailRule className="mb-4" />
        <p className={T.kicker}>Bon pour un essai · découpez ici</p>
        <p className="mt-3 font-serif text-[16px] leading-[1.6] text-[#1c1914]">
          Run the stopwatch on your own CSV. The courrier desk accepts corrections, complaints and
          query plans — by the same route the data takes:{" "}
          <span className="font-semibold">none</span>.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <InkButton href="/signup" tone="outline">
            Écrire sa propre lettre
            <Send aria-hidden className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </InkButton>
          <InkLink href="#faq">Questions au courrier →</InkLink>
        </div>
        <p className={`mt-4 ${T.folio}`}>Valable hors connexion. Surtout hors connexion.</p>
      </div>
    </SettleIn>
  );
}

/**
 * The intro column. Sticky at lg so the desk's ledger keeps the reader
 * company while the four scraps scroll by. Headline is the rubrique's
 * whole argument in three lines.
 */
function LettersDeskIntro() {
  return (
    <div className="lg:sticky lg:top-24">
      <SettleIn>
        <div className="flex items-center gap-2.5">
          <Mail aria-hidden className="h-4 w-4 text-[#bf3415]" strokeWidth={1.8} />
          <span className={T.kicker}>Rubrique courrier · ouverte au coupe-papier</span>
        </div>
      </SettleIn>

      <DeckReveal
        className="mt-5"
        lines={[
          <span
            key="l1"
            className="font-serif text-[clamp(2.1rem,3.6vw,3.3rem)] font-semibold leading-[1.02] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
          >
            Four letters,
          </span>,
          <span
            key="l2"
            className="font-serif text-[clamp(2.1rem,3.6vw,3.3rem)] font-semibold leading-[1.02] tracking-[-0.015em] text-[#1c1914] [font-variation-settings:'WONK'_1]"
          >
            one stopwatch,
          </span>,
          <span
            key="l3"
            className="font-serif text-[clamp(2.1rem,3.6vw,3.3rem)] font-semibold leading-[1.02] tracking-[-0.015em] text-[#bf3415] [font-variation-settings:'WONK'_1]"
          >
            zero packets.
          </span>,
        ]}
      />

      <SettleIn delay={0.1}>
        <p className={`mt-6 ${T.body}`}>
          Every tool page prints applause; this desk prints mail. The letters opposite are
          composites — drawn from evaluation notes, renamed, set in type. The figures they quote
          went past our fact-checking desk, which owns a stopwatch and very little patience.
        </p>
        <p className={`mt-4 ${T.ui}`}>
          Le tri est fait à la main. Les chiffres sont vérifiés à la montre. Le réseau, lui, n’est
          au courant de rien.
        </p>
      </SettleIn>

      {/* the registre — the desk's ledger, closed by the line that matters */}
      <SettleIn delay={0.15} className="mt-9">
        <div className="flex items-center gap-2.5">
          <Inbox aria-hidden className="h-4 w-4 text-[#4a4438]" strokeWidth={1.8} />
          <span className={T.kicker}>Registre du courrier — semaine 24</span>
        </div>
        <div className="mt-2">
          {LETTERS_REGISTRY.map((entry) => (
            <LettersRegistryRow key={entry.label} entry={entry} />
          ))}
        </div>
        <p className={`mt-3 ${T.folio}`}>Relevé du {EDITION.datelineShort} · signé du coupe-papier</p>
      </SettleIn>

      <LettersCoupon />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  THE OVERFLOW TRAY — « aussi reçu » digest
 * ════════════════════════════════════════════════════════════════════════════ */

/** One digest entry — a quote that earned a line, not a column. */
function LettersDigestEntry({ entry }: { entry: { quote: string; sig: string } }) {
  return (
    <figure className="mb-7 break-inside-avoid border-l-2 border-[#d6ccb6] pl-4">
      <blockquote className="font-serif text-[15px] italic leading-[1.55] text-[#1c1914]">
        {entry.quote}
      </blockquote>
      <figcaption className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#857c69]">
        — {entry.sig}
      </figcaption>
    </figure>
  );
}

/**
 * Errata du courrier — the corrections box every honest paper carries.
 * Boxed in a full ink border (corrections are formal), set smaller than
 * the letters: the paper lowering its voice to correct itself.
 */
function LettersErrata() {
  return (
    <div className="border border-[#1c1914] px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex items-center gap-2.5">
        <PenLine aria-hidden className="h-3.5 w-3.5 text-[#bf3415]" strokeWidth={1.8} />
        <span className={T.kicker}>Errata du courrier</span>
      </div>
      <div className="mt-3 space-y-3">
        {LETTERS_ERRATA.map((erratum) => (
          <p key={erratum.edition} className="font-serif text-[13.5px] leading-[1.6] text-[#1c1914]">
            <span className="font-grotesk text-[10px] font-bold uppercase tracking-[0.14em] text-[#857c69]">
              {erratum.edition} ·{" "}
            </span>
            {erratum.text}
          </p>
        ))}
      </div>
    </div>
  );
}

/**
 * The digest strip. CSS columns (not a grid of cards — this is a newspaper)
 * so the quotes rag naturally like classified lineage. One column at 360px,
 * two at 768px, three at 1280px. The errata box and the composites footnote
 * close the rubrique side by side at lg — confession and method, same row.
 */
function LettersDigest() {
  return (
    <SettleIn className="mt-16 sm:mt-20">
      <div className="flex items-center gap-4">
        <div className="flex shrink-0 items-center gap-2.5">
          <MailOpen aria-hidden className="h-4 w-4 text-[#4a4438]" strokeWidth={1.8} />
          <span className={T.kicker}>Aussi reçu cette semaine</span>
        </div>
        <Rule className="flex-1" />
        <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[#857c69] sm:block">
          19 lettres non publiées · conservées
        </span>
      </div>
      <div className="mt-7 gap-10 md:columns-2 lg:columns-3">
        {LETTERS_DIGEST.map((entry) => (
          <LettersDigestEntry key={entry.sig} entry={entry} />
        ))}
      </div>
      <div className="mt-4 grid items-start gap-8 lg:grid-cols-[minmax(0,30rem)_1fr]">
        <LettersErrata />
        {/* the honesty footnote — how the composites were made, in plain type */}
        <p className="max-w-2xl font-serif text-[12.5px] italic leading-[1.6] text-[#857c69] lg:pt-1">
          * Lettres composites : prénoms changés, métiers réels, chiffres vérifiés au chrono par
          la rédaction. Aucun octet n’a quitté un poste pour imprimer cette page. Les lettres non
          publiées dorment dans un tiroir — hors-ligne, évidemment.
        </p>
      </div>
    </SettleIn>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
 *  §14 ROOT — LettersSection
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * COURRIER DES LECTEURS — p. 12 of The Daily Edition.
 *
 * Reading order: mast → honesty note → airmail rule → the desk (intro
 * column, sticky at lg) beside the scatter of four scraps → overflow
 * digest → folio. At 360px everything stacks in source order; the postal
 * corners shrink but never collide with copy because the letter heads
 * reserve their height. No StickyScene here, so contentVisibility is on
 * and the whole rubrique costs nothing until it scrolls near.
 */
function LettersSection() {
  return (
    <section
      id="letters"
      className="relative"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 3400px" }}
    >
      <div className="mx-auto max-w-7xl px-5 pb-20 pt-24 sm:px-8 sm:pb-24 sm:pt-28 lg:px-12">
        <SectionMast rubrique="Courrier des lecteurs" no="p. 12" />

        {/* the honesty note — the rubrique's terms, printed before the praise */}
        <SettleIn delay={0.1} className="mt-5 text-center">
          <p className="mx-auto max-w-xl font-serif text-[15px] italic leading-[1.6] text-[#4a4438]">
            Lettres authentiquement fictives<span className="text-[#bf3415]">*</span> — vos
            chiffres, eux, seront réels.
          </p>
        </SettleIn>

        <SettleIn delay={0.18} className="mt-7">
          <LettersAirmailRule />
        </SettleIn>

        {/* the desk and the scatter */}
        <div className="mt-12 grid gap-14 sm:mt-16 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-4">
            <LettersDeskIntro />
          </div>

          {/* four scraps: 1-col stack on mobile in reading order, 2-col scatter
              at lg with per-letter lift + parallax doing the desk arrangement */}
          <div className="lg:col-span-8">
            <div className="grid items-start gap-12 sm:gap-14 lg:grid-cols-2 lg:gap-x-8 lg:gap-y-16">
              {LETTERS_MAIL.map((letter, index) => (
                <LettersLetterCard key={letter.id} letter={letter} index={index} />
              ))}
              <LettersReturnedSlip />
            </div>
          </div>
        </div>

        <LettersDigest />

        <DoubleRule className="mt-14" />
        <FolioLine
          className="mt-3"
          page="p. 12"
          note="Le courrier est lu entre deux presses — répondre n’engage que l’encre"
        />
      </div>
    </section>
  );
}
