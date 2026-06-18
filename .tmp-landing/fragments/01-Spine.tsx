/* ════════════════════════════════════════════════════════════════════════════
 *  §SECTION 01 — SPINE · the reading apparatus
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The spine is the only piece of the broadsheet that never scrolls away: a
 *  slim newsroom bar pinned over the page, the vermilion reading-progress
 *  rule beneath it, the "EN KIOSQUE" folio strip hugging the right edge on
 *  wide presses, and — on small formats — a full-paper sommaire that drops
 *  over the page like tomorrow's front page being pulled down from the rack.
 *
 *  Editorial logic
 *  ───────────────
 *  • Over the masthead the bar is bare ink on the page itself — the big
 *    nameplate below it carries the identity, so the bar stays quiet.
 *    Past 60 px of scroll the bar "inks in": paper background, offset-print
 *    lift, and the broadsheet's signature DoubleRule along its bottom edge.
 *  • The 3 px vermilion rule under the bar is the editor's pen dragged across
 *    the whole edition — scaleX driven by page scroll through a plate spring,
 *    origin left, so it reads as ink being laid rather than a loading bar.
 *  • The dateline tag only appears once the bar has inked: while the masthead
 *    is on screen its own dateline does that job; the chrome never repeats
 *    what the page is already saying.
 *  • The mobile sommaire is typeset as a newspaper index: numbered rubriques
 *    in big wonky serif, hairline rules between entries, lettered "cahiers"
 *    for secondary destinations, the HORS LIGNE stamp slammed beside the
 *    nameplate, and the small print a security reviewer actually reads.
 *
 *  Structure (fixed chrome — deliberately NO contentVisibility on the root;
 *  the section renders as a height-0 shell whose children are all fixed):
 *    SpineSection
 *    ├─ SpineSkipLink        a11y: jump straight to the lead story
 *    ├─ SpineBar             fixed top bar (nameplate · rail · actions)
 *    │   └─ SpineProgressRule
 *    ├─ SpineKioskStrip      right-edge vertical folio, xl+ only
 *    └─ SpineMobileIndex     AnimatePresence full-paper sommaire, <md only
 * ════════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────────────
 *  §S1 — DATA · rubriques, cahiers, small print
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The four rubriques the bar points at. Page folios match the edition's real
 * section order (Press = p. 06, Classified = p. 07, Questions = p. 15,
 * Subscribe = p. 16) so the index reads like an honest table of contents.
 * Order matters: the scroll-spy walks this list top-to-bottom and keeps the
 * last anchor whose section has crossed the reading line.
 */
const SPINE_RUBRIQUES = [
  {
    no: "01",
    href: "#workflow",
    label: "Workflow",
    fr: "La chaîne de fabrication",
    page: "p. 06",
    blurb: "From raw CSV to a signed morning report — the golden path, press by press.",
  },
  {
    no: "02",
    href: "#capabilities",
    label: "Capabilities",
    fr: "Les petites annonces",
    page: "p. 07",
    blurb: "Thirty-odd tools in the classified index: forecasting, geo plates, exports, voice.",
  },
  {
    no: "03",
    href: "#faq",
    label: "FAQ",
    fr: "Questions au rédacteur",
    page: "p. 15",
    blurb: "Short answers on hardware, formats, licences — and what offline actually means.",
  },
  {
    no: "04",
    href: "#subscribe",
    label: "Subscribe",
    fr: "Le kiosque",
    page: "p. 16",
    blurb: "One desk licence, zero telemetry. The edition prints on your machine every morning.",
  },
] as const;

type SpineRubrique = (typeof SPINE_RUBRIQUES)[number];

/**
 * Secondary destinations in the mobile sommaire, lettered like newspaper
 * supplements (cahier A, B, C) rather than numbered with the rubriques —
 * they are services, not stories.
 */
const SPINE_INDEX_EXTRAS = [
  {
    cahier: "A",
    href: "#lead",
    label: "La une",
    note: "This morning's anomaly, investigated line by line.",
    Icon: Newspaper,
  },
  {
    cahier: "B",
    href: "/dashboard",
    label: "Ouvrir l'application",
    note: "Straight to the desk. The report is already waiting.",
    Icon: AppWindow,
  },
  {
    cahier: "C",
    href: "#top",
    label: "Revenir en tête",
    note: "Back to the nameplate and the front page.",
    Icon: ArrowUp,
  },
] as const;

type SpineExtraEntry = (typeof SPINE_INDEX_EXTRAS)[number];

/**
 * The small print at the foot of the sommaire — the three sentences the
 * security team that approves this tool will actually read. Icons are pulled
 * from the merged lucide import; the copy keeps the bilingual newsroom rule:
 * English editorial voice, French data labels.
 */
const SPINE_MENU_NOTES = [
  {
    Icon: WifiOff,
    text: "Fully offline. The press runs on your machine, not on somebody else's cloud.",
  },
  {
    Icon: Lock,
    text: "Nothing is uploaded, telemetered or quietly “anonymised”. Columns stay at the desk.",
  },
  {
    Icon: FileSpreadsheet,
    text: "One input — DailyTransactions.csv. One output — the finished morning report.",
  },
] as const;

type SpineMenuNote = (typeof SPINE_MENU_NOTES)[number];

/** French aria strings, grouped so the chrome speaks one consistent voice. */
const SPINE_A11Y = {
  nameplate: "Data Navigator — retour à la une",
  rail: "Rubriques de l'édition",
  openIndex: "Ouvrir le sommaire",
  closeIndex: "Fermer le sommaire",
  index: "Sommaire de l'édition",
  skip: "Skip to the lead story",
} as const;

/** Scroll depth (px) past which the bar inks in. The masthead owns the top. */
const SPINE_INK_THRESHOLD = 60;

/* ────────────────────────────────────────────────────────────────────────────
 *  §S2 — ATOMS · skip link, nameplate, rail links, menu button
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A11y skip link — invisible until keyboard focus, then it surfaces as a
 * proper ink button pinned top-left, above every other piece of chrome.
 * First tab stop of the entire page.
 */
function SpineSkipLink() {
  return (
    <a
      href="#lead"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:inline-flex focus:items-center focus:gap-2 focus:border-2 focus:border-[#1c1914] focus:bg-[#f6f1e7] focus:px-5 focus:py-3 focus:font-grotesk focus:text-[12px] focus:font-bold focus:uppercase focus:tracking-[0.16em] focus:text-[#1c1914] focus:shadow-[3px_3px_0_#1c1914] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]"
    >
      {SPINE_A11Y.skip}
      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
    </a>
  );
}

/** Hairline interpunct used between metadata fragments in the bar. */
function SpineDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-[3px] w-[3px] rounded-full bg-[#857c69] ${className ?? ""}`}
    />
  );
}

/** Vertical hairline separating clusters inside the bar. */
function SpineHairline({ className }: { className?: string }) {
  return <span aria-hidden className={`h-6 w-px bg-[#d6ccb6] ${className ?? ""}`} />;
}

/**
 * The nameplate monogram — "DN" set in wonky serif inside a 2 px ink box,
 * with a tiny vermilion registration mark pinned to the top-right corner
 * (the printer's mark that says this plate is aligned). Mechanical press
 * on tap, like every button on the page.
 */
function SpineMonogram() {
  return (
    <span className="relative grid h-9 w-9 shrink-0 place-items-center border-2 border-[#1c1914] font-serif text-[15px] font-black tracking-tight text-[#1c1914] [font-variation-settings:'WONK'_1] md:h-10 md:w-10 md:text-[16px]">
      DN
      <span aria-hidden className="absolute -right-[5px] -top-[5px] h-2 w-2 bg-[#bf3415]" />
    </span>
  );
}

/**
 * Monogram + wordmark, the whole cluster a single link back to the top.
 * The serif wordmark always renders; the folio sub-line only earns its
 * space on lg+ where the bar can breathe.
 */
function SpineNameplate() {
  return (
    <motion.span whileTap={{ scale: 0.97 }} className="inline-block">
      <a
        href="#top"
        aria-label={SPINE_A11Y.nameplate}
        className="group flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bf3415]"
      >
        <SpineMonogram />
        <span className="flex flex-col">
          <span className="whitespace-nowrap font-serif text-[16px] font-bold leading-none tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1] md:text-[17px]">
            The Daily Edition
          </span>
          <span className={`mt-1 hidden whitespace-nowrap lg:block ${T.folio}`}>
            par Data Navigator — édition du matin
          </span>
        </span>
      </a>
    </motion.span>
  );
}

/**
 * One rubrique link on the desktop rail. The vermilion underline is a pure
 * scaleX transform: drawn for the active section, drawn on hover/focus for
 * the rest. Numbers step back below lg so the rail fits a 768 px press.
 */
function SpineNavLink({ item, active }: { item: SpineRubrique; active: boolean }) {
  return (
    <a
      href={item.href}
      aria-current={active ? "true" : undefined}
      className="group relative flex items-baseline gap-1.5 whitespace-nowrap px-1 py-2 font-grotesk text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1c1914] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415] lg:text-[12px] lg:tracking-[0.18em]"
    >
      <span aria-hidden className="hidden font-mono text-[9px] font-normal text-[#bf3415] lg:inline">
        {item.no}
      </span>
      {item.label}
      <span
        aria-hidden
        className={`absolute inset-x-1 bottom-[3px] h-[2px] origin-left bg-[#bf3415] transition-transform duration-300 motion-reduce:transition-none ${
          active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100 group-focus-visible:scale-x-100"
        }`}
      />
    </a>
  );
}

/**
 * Dateline tag — slides into the bar only once it has inked in, because the
 * masthead's own dateline is doing the job while it is on screen. Chrome
 * should never repeat what the page already says.
 */
function SpineEditionTag({ inked }: { inked: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span className="hidden xl:block">
      <AnimatePresence initial={false}>
        {inked && (
          <motion.span
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: EASE_INK }}
            className="flex items-center gap-2.5"
          >
            <span className={`whitespace-nowrap ${T.folio}`}>{EDITION.dateline}</span>
            <SpineDot />
            <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-[#bf3415]">
              {EDITION.issue}
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/**
 * Hamburger — a bordered, offset-shadowed press button (the same mechanical
 * grammar as InkButton, scaled to chrome). The glyph swaps Menu ⇄ X with a
 * quarter-turn; reduced motion collapses that to a plain crossfade.
 */
function SpineMenuButton({
  open,
  onToggle,
  buttonRef,
}: {
  open: boolean;
  onToggle: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  const reduce = useReducedMotion();
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="spine-index"
      aria-label={open ? SPINE_A11Y.closeIndex : SPINE_A11Y.openIndex}
      className="grid h-10 w-10 shrink-0 place-items-center border-2 border-[#1c1914] bg-transparent text-[#1c1914] shadow-[2px_2px_0_#1c1914] transition-transform active:translate-x-[1px] active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415] motion-reduce:transition-none md:hidden"
    >
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.span
            key="spine-glyph-close"
            initial={reduce ? { opacity: 0 } : { rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { rotate: 90, opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_PRESS }}
            className="grid place-items-center"
          >
            <X aria-hidden className="h-5 w-5" />
          </motion.span>
        ) : (
          <motion.span
            key="spine-glyph-open"
            initial={reduce ? { opacity: 0 } : { rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { rotate: -90, opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_PRESS }}
            className="grid place-items-center"
          >
            <Menu aria-hidden className="h-5 w-5" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §S3 — APPARATUS · progress rule, kiosk strip, rail, the bar itself
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The reading-progress rule: 3 px of vermilion laid across the page width as
 * the reader works through the edition. Driven by page scrollYProgress
 * through the plate spring so the ink settles rather than snaps; reduced
 * motion gets the raw, un-sprung value (still accurate, never bouncy).
 * The faint ink bed underneath keeps the rule legible over the masthead.
 */
function SpineProgressRule() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const sprung = useSpring(scrollYProgress, SPRING_PLATE);
  const scaleX = reduce ? scrollYProgress : sprung;
  return (
    <div aria-hidden className="relative h-[3px] w-full bg-[#1c1914]/[0.07]">
      <motion.div
        className="absolute inset-0 bg-[#bf3415]"
        style={{ scaleX, transformOrigin: "left center" }}
      />
    </div>
  );
}

/**
 * Typographer's gauge — the little tick ruler punctuating the kiosk strip.
 * Static SVG, hairline strokes, every fourth tick heavier. Pure furniture.
 */
function SpineKioskRuler() {
  return (
    <svg aria-hidden viewBox="0 0 10 96" className="h-24 w-2.5 text-[#857c69]">
      {Array.from({ length: 13 }, (_, i) => (
        <line
          key={`tick-${i * 8}`}
          x1={i % 4 === 0 ? 1 : 4.5}
          y1={i * 8}
          x2={10}
          y2={i * 8}
          stroke="currentColor"
          strokeWidth={i % 4 === 0 ? 1.4 : 0.8}
        />
      ))}
    </svg>
  );
}

/**
 * Right-edge folio strip — "EN KIOSQUE — ÉDITION № 847" set vertically along
 * the page edge on xl+ presses, like the spine label on a bound volume.
 *
 * It drifts a few pixels against the scroll. The preamble's <Parallax> can't
 * serve here: it measures an element's *document* offsets, and fixed chrome
 * never travels through the document — so we drive the same grammar by hand
 * from page scrollYProgress through the plate spring. Decorative, untabbable,
 * and invisible to readers below xl and to screen readers everywhere.
 */
function SpineKioskStrip() {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const drift = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [26, -26]);
  const settled = useSpring(drift, SPRING_PLATE);
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed right-0 top-1/2 z-[40] hidden -translate-y-1/2 xl:block"
    >
      <motion.div style={{ y: settled }} className="flex flex-col items-center gap-4 pr-3">
        <span className={`${reduce ? "" : "ed-caret"} h-1.5 w-1.5 bg-[#bf3415]`} />
        <span className="font-grotesk text-[10px] font-bold uppercase tracking-[0.32em] text-[#1c1914] [writing-mode:vertical-rl]">
          En kiosque
        </span>
        <SpineKioskRuler />
        <span className="font-mono text-[10px] uppercase tracking-[0.26em] text-[#4a4438] [writing-mode:vertical-rl]">
          Édition {EDITION.issue}
        </span>
        <SpineKioskRuler />
        <span className="border-[1.5px] border-[#bf3415] px-[3px] py-2 font-grotesk text-[9px] font-black uppercase tracking-[0.22em] text-[#bf3415] [writing-mode:vertical-rl]">
          100 % hors ligne
        </span>
      </motion.div>
    </div>
  );
}

/**
 * Desktop rubrique rail with a hand-rolled scroll-spy: on every scroll frame
 * we walk the four anchor targets (they appear in page order) and keep the
 * last one whose top has crossed the reading line at 35 % of the viewport.
 * Rect reads on four cached elements are cheap — no observers to juggle when
 * downstream sections resize themselves under contentVisibility.
 */
function SpineRubriqueRail() {
  const { scrollY } = useScroll();
  const [active, setActive] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);

  useMotionValueEvent(scrollY, "change", () => {
    let current: string | null = null;
    for (const r of SPINE_RUBRIQUES) {
      const el = document.getElementById(r.href.slice(1));
      if (el && el.getBoundingClientRect().top <= window.innerHeight * 0.35) {
        current = r.href;
      }
    }
    if (current !== activeRef.current) {
      activeRef.current = current;
      setActive(current);
    }
  });

  return (
    <nav
      aria-label={SPINE_A11Y.rail}
      className="hidden min-w-0 flex-1 items-center justify-center gap-3 md:flex lg:gap-6"
    >
      {SPINE_RUBRIQUES.map((item) => (
        <SpineNavLink key={item.href} item={item} active={active === item.href} />
      ))}
    </nav>
  );
}

/**
 * The bar. A 56/64 px strip of fixed chrome:
 *   left   — nameplate (monogram + wordmark) and, once inked, the dateline;
 *   centre — the rubrique rail (md+);
 *   right  — "Se connecter" InkLink and a chrome-scale "S'abonner" InkButton
 *            (h-9 via Tailwind v4 important overrides — the preamble button
 *            is fixed at h-12, too tall for a slim newspaper bar);
 *   <md    — the hamburger that opens the sommaire.
 *
 * Ink-in behaviour: a paper layer + offset-print lift crossfades behind the
 * content, and the signature DoubleRule scales down along the bottom edge —
 * opacity and transform only, the bar's height never animates.
 */
function SpineBar({
  indexOpen,
  onToggleIndex,
  menuButtonRef,
}: {
  indexOpen: boolean;
  onToggleIndex: () => void;
  menuButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const [inked, setInked] = useState(false);

  useMotionValueEvent(scrollY, "change", (v) => {
    setInked(v > SPINE_INK_THRESHOLD);
  });

  // Reloading mid-page must not leave the bar transparent over body copy —
  // motion only emits "change" events, so seed the state once on mount.
  useEffect(() => {
    setInked(window.scrollY > SPINE_INK_THRESHOLD);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-[60]">
      <div className="relative">
        {/* paper layer — fades in past the masthead; shadow rides the layer's
            opacity, so no box-shadow is ever animated directly */}
        <motion.div
          aria-hidden
          className="absolute inset-0 bg-[#f6f1e7] shadow-[0_14px_40px_-18px_rgba(28,25,20,0.35)]"
          initial={false}
          animate={{ opacity: inked ? 1 : 0 }}
          transition={{ duration: reduce ? 0 : 0.35, ease: EASE_INK }}
        />

        <div className="relative mx-auto flex h-14 max-w-[1560px] items-center justify-between gap-3 px-4 sm:px-6 md:h-16 md:gap-4 xl:px-10">
          {/* left — nameplate cluster */}
          <div className="flex min-w-0 items-center gap-4 xl:gap-5">
            <SpineNameplate />
            <SpineHairline className="hidden xl:block" />
            <SpineEditionTag inked={inked} />
          </div>

          {/* centre — rubrique rail, md+ */}
          <SpineRubriqueRail />

          {/* right — session actions + hamburger */}
          <div className="flex shrink-0 items-center gap-3 md:gap-4 xl:gap-5">
            <span className="hidden md:inline-block">
              <InkLink href="/login">Se connecter</InkLink>
            </span>
            <span className="hidden sm:inline-block">
              <InkButton
                href="/signup"
                tone="vermilion"
                className="h-9! px-4! text-[11px]! tracking-[0.12em]!"
              >
                S'abonner
                <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
              </InkButton>
            </span>
            <SpineMenuButton open={indexOpen} onToggle={onToggleIndex} buttonRef={menuButtonRef} />
          </div>
        </div>

        {/* the broadsheet's signature — scales down from the bar's bottom edge
            once inked; absolute so the bar's height never changes */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0"
          initial={false}
          animate={{ opacity: inked ? 1 : 0, scaleY: inked ? 1 : 0 }}
          style={{ transformOrigin: "center bottom" }}
          transition={{ duration: reduce ? 0 : 0.35, ease: EASE_INK }}
        >
          <DoubleRule />
        </motion.div>
      </div>

      <SpineProgressRule />
    </header>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §S4 — THE SOMMAIRE · full-paper mobile index, typeset like page two
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * One numbered rubrique entry in the sommaire: vermilion folio number, a big
 * wonky serif headline, the French rubrique name and a one-line standfirst,
 * the page folio at the right edge, and a hairline rule below. The arrow
 * glyph sets itself only on hover/focus — quiet by default, like a proof.
 */
function SpineIndexEntry({
  item,
  order,
  onSelect,
}: {
  item: SpineRubrique;
  order: number;
  onSelect: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      initial={reduce ? false : { y: 34, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.18 + order * 0.08, duration: 0.6, ease: EASE_INK }}
    >
      <a
        href={item.href}
        onClick={onSelect}
        className="group block py-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#bf3415]"
      >
        <span className="flex items-baseline justify-between gap-4">
          <span className="flex min-w-0 items-baseline gap-4">
            <span aria-hidden className="font-mono text-[12px] text-[#bf3415]">
              {item.no}
            </span>
            <span className="font-serif text-[clamp(2.1rem,8.5vw,3rem)] font-semibold leading-[0.98] tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
              {item.label}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1.5">
            <ArrowUpRight
              aria-hidden
              className="h-5 w-5 -translate-x-1 translate-y-1 text-[#bf3415] opacity-0 transition-transform duration-200 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:translate-y-0 group-focus-visible:opacity-100 motion-reduce:transition-none"
            />
            <span className={T.folio}>{item.page}</span>
          </span>
        </span>
        <span className="mt-2 flex flex-col gap-1 pl-8">
          <span className={T.kicker}>{item.fr}</span>
          <span className="font-serif text-[14px] italic leading-snug text-[#4a4438]">
            {item.blurb}
          </span>
        </span>
      </a>
      <Rule />
    </motion.li>
  );
}

/**
 * Lettered cahier row — smaller than the rubriques, set with its icon in a
 * hairline box. Routes ("/dashboard") go through <Link>; anchors stay plain.
 */
function SpineIndexExtraRow({
  item,
  order,
  onSelect,
}: {
  item: SpineExtraEntry;
  order: number;
  onSelect: () => void;
}) {
  const reduce = useReducedMotion();
  const inner = (
    <span className="flex items-center gap-4 py-3.5">
      <span aria-hidden className="font-mono text-[11px] text-[#bf3415]">
        {item.cahier}.
      </span>
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center border border-[#d6ccb6] text-[#4a4438]"
      >
        <item.Icon className="h-4 w-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-serif text-[19px] font-semibold leading-tight text-[#1c1914]">
          {item.label}
        </span>
        <span className="font-grotesk text-[12px] leading-snug text-[#857c69]">{item.note}</span>
      </span>
      <ArrowRight aria-hidden className="ml-auto h-4 w-4 shrink-0 text-[#857c69]" />
    </span>
  );
  const linkClass =
    "block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415]";
  return (
    <motion.li
      initial={reduce ? false : { y: 22, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.52 + order * 0.06, duration: 0.5, ease: EASE_INK }}
    >
      {item.href.startsWith("#") ? (
        <a href={item.href} onClick={onSelect} className={linkClass}>
          {inner}
        </a>
      ) : (
        <Link href={item.href} onClick={onSelect} className={linkClass}>
          {inner}
        </Link>
      )}
      <Rule />
    </motion.li>
  );
}

/**
 * Sommaire masthead — repeats the nameplate at index scale, slams the
 * HORS LIGNE stamp beside the dateline, and carries the close button.
 */
function SpineIndexMasthead({
  onClose,
  closeRef,
}: {
  onClose: () => void;
  closeRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <SpineMonogram />
          <span className="font-serif text-[22px] font-bold leading-none tracking-[-0.01em] text-[#1c1914] [font-variation-settings:'WONK'_1]">
            The Daily Edition
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={T.folio}>
            {EDITION.dateline} · {EDITION.issue}
          </span>
          <Stamp tilt={5} className="text-[10px]">
            Hors ligne
          </Stamp>
        </div>
      </div>
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label={SPINE_A11Y.closeIndex}
        className="grid h-11 w-11 shrink-0 place-items-center border-2 border-[#1c1914] text-[#1c1914] shadow-[2px_2px_0_#1c1914] transition-transform active:translate-x-[1px] active:translate-y-[1px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#bf3415] motion-reduce:transition-none"
      >
        <X aria-hidden className="h-5 w-5" />
      </button>
    </div>
  );
}

/**
 * Sommaire foot — the subscription block (the same two actions as the bar,
 * at full size now that there is room), the security small print, and the
 * closing folio line. The pen underlines "every morning" because that is
 * the promise the whole product keeps.
 */
function SpineIndexFooter({ onSelect }: { onSelect: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.72, duration: 0.55, ease: EASE_INK }}
      className="flex flex-col gap-7"
    >
      <div className="flex flex-col gap-4">
        <p className="font-serif text-[20px] font-medium leading-snug text-[#1c1914]">
          The edition prints on your desk <PenUnderline delay={1}>every morning</PenUnderline>.
        </p>
        <div className="flex flex-wrap items-center gap-5">
          <span onClickCapture={onSelect}>
            <InkButton href="/signup" tone="vermilion">
              S'abonner
              <ArrowUpRight aria-hidden className="h-4 w-4" />
            </InkButton>
          </span>
          <span onClickCapture={onSelect}>
            <InkLink href="/login">Se connecter</InkLink>
          </span>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {SPINE_MENU_NOTES.map((note) => (
          <SpineMenuNoteRow key={note.text} note={note} />
        ))}
      </ul>

      <div>
        <Rule className="mb-3" />
        <FolioLine page="Sommaire" note={EDITION.motto} />
      </div>
    </motion.div>
  );
}

/** One line of sommaire small print: hairline-boxed icon + a dry sentence. */
function SpineMenuNoteRow({ note }: { note: SpineMenuNote }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-[1px] grid h-6 w-6 shrink-0 place-items-center border border-[#d6ccb6] text-[#4a4438]"
      >
        <note.Icon className="h-3.5 w-3.5" />
      </span>
      <span className="font-grotesk text-[12.5px] leading-snug text-[#4a4438]">{note.text}</span>
    </li>
  );
}

/**
 * The full-paper sommaire. Drops from the top edge like a sheet pulled off
 * the rack (EASE_PRESS — mechanical, not bouncy), scroll-locks the body
 * while open, closes on Escape, on any selection, and automatically if the
 * viewport grows past md (where the rail takes over). Minimal dialog
 * semantics: role, aria-modal, initial focus on the close button, focus
 * handed back to the hamburger by the parent on close.
 */
function SpineMobileIndex({ onClose }: { onClose: () => void }) {
  const reduce = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Scroll lock — restored on unmount, i.e. after the exit animation.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Escape closes, like any well-mannered dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // If the press widens past md while the sommaire is open, the rail takes
  // over — close rather than leaving an orphaned scroll lock behind.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) onClose();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [onClose]);

  // First focus lands on the close button.
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  // Release the scroll lock *before* the browser performs the anchor jump —
  // a locked body swallows same-page navigation on some engines. The
  // unmount cleanup re-clearing it afterwards is harmless.
  const handleSelect = useCallback(() => {
    document.body.style.overflow = "";
    onClose();
  }, [onClose]);

  return (
    <motion.div
      id="spine-index"
      role="dialog"
      aria-modal="true"
      aria-label={SPINE_A11Y.index}
      initial={reduce ? { opacity: 0 } : { y: "-100%" }}
      animate={reduce ? { opacity: 1 } : { y: 0 }}
      exit={reduce ? { opacity: 0 } : { y: "-102%" }}
      transition={{ duration: 0.55, ease: EASE_PRESS }}
      className="fixed inset-0 z-[80] overflow-y-auto bg-[#f6f1e7] md:hidden"
    >
      <div className="mx-auto flex min-h-full max-w-xl flex-col gap-8 px-5 pb-10 pt-5 sm:px-8">
        <div>
          <SpineIndexMasthead onClose={onClose} closeRef={closeRef} />
          <DoubleRule className="mt-5" />
        </div>

        <div>
          <p className={`${T.kicker} mb-1`}>Sommaire — édition {EDITION.issue}</p>
          <ul className="flex flex-col">
            {SPINE_RUBRIQUES.map((item, i) => (
              <SpineIndexEntry key={item.href} item={item} order={i} onSelect={handleSelect} />
            ))}
          </ul>
        </div>

        <div>
          <p className={`${T.kicker} mb-1`}>Cahiers & services</p>
          <ul className="flex flex-col">
            {SPINE_INDEX_EXTRAS.map((item, i) => (
              <SpineIndexExtraRow key={item.href} item={item} order={i} onSelect={handleSelect} />
            ))}
          </ul>
        </div>

        <div className="mt-auto">
          <SpineIndexFooter onSelect={handleSelect} />
        </div>
      </div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 *  §S5 — ROOT · height-0 shell, fixed children
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * SpineSection — the page's fixed chrome. Deliberately NOT given
 * contentVisibility (rule 10's exception applies twice over: it is fixed
 * chrome, and hiding it would unmount the very apparatus that tells the
 * reader where they are). The section itself is a height-0 shell; the bar,
 * the kiosk strip and the sommaire all live in fixed layers above the page.
 *
 * Z-order ledger (everything in one place, so later sections can stay out
 * of the chrome's way): kiosk strip 40 · bar 60 · sommaire 80 · skip link
 * 100 (focus only).
 */
function SpineSection() {
  const [indexOpen, setIndexOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const toggleIndex = useCallback(() => setIndexOpen((v) => !v), []);

  // Closing returns focus to the hamburger — without scrolling, since the
  // button lives in fixed chrome and is always on screen anyway.
  const closeIndex = useCallback(() => {
    setIndexOpen(false);
    menuButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section id="spine" className="relative h-0">
      <SpineSkipLink />
      <SpineBar indexOpen={indexOpen} onToggleIndex={toggleIndex} menuButtonRef={menuButtonRef} />
      <SpineKioskStrip />
      <AnimatePresence>
        {indexOpen && <SpineMobileIndex onClose={closeIndex} />}
      </AnimatePresence>
    </section>
  );
}
