"use client";

import { AnimatePresence, motion, useAnimate } from "motion/react";
import { Check, Eye, EyeOff, Moon, Sun, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { authClient } from "@/platform/auth/auth-client";
import { scorePassword } from "@/components/auth/password-strength";
import { useAppTheme } from "@/hooks/use-app-theme";

/* ─── Theme tokens ──────────────────────────────────────────────────────── */

const DARK = {
  pageBg:      "radial-gradient(ellipse 150% 80% at 50% 0%, #131c32 0%, #0d1117 60%)",
  text:        "#e5eaf3",
  textSub:     "#7a8394",
  textMuted:   "#3b4556",
  inputBg:     "rgba(255,255,255,0.045)",
  inputBorder: "rgba(255,255,255,0.09)",
  inputText:   "#e5eaf3",
  inputPH:     "#38435a",
  cardBg:      "rgba(255,255,255,0.035)",
  cardBorder:  "rgba(255,255,255,0.075)",
  cardShadow:  "0 0 0 1px rgba(255,255,255,0.06)",
  toggleBg:    "rgba(255,255,255,0.07)",
  errColor:    "#f87171",
  avaShadow:   "0 0 0 4px rgba(47,107,255,0.18), 0 8px 30px rgba(47,107,255,0.22)",
  linkColor:   "#3b4556",
  linkHover:   "#7a8394",
};

const LIGHT = {
  pageBg:      "radial-gradient(ellipse 150% 80% at 50% 0%, #d9e5ff 0%, #eceff5 55%)",
  text:        "#18202e",
  textSub:     "#586070",
  textMuted:   "#9aa3b0",
  inputBg:     "#ffffff",
  inputBorder: "#d8dde8",
  inputText:   "#18202e",
  inputPH:     "#9aa3b0",
  cardBg:      "#ffffff",
  cardBorder:  "#e0e5ef",
  cardShadow:  "0 4px 28px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)",
  toggleBg:    "rgba(0,0,0,0.07)",
  errColor:    "#dc2626",
  avaShadow:   "0 0 0 4px rgba(47,107,255,0.12), 0 8px 24px rgba(47,107,255,0.18)",
  linkColor:   "#9aa3b0",
  linkHover:   "#586070",
};

/* ─── localStorage ──────────────────────────────────────────────────────── */

const USER_KEY = "dn.auth.user";
interface StoredUser { email: string; name: string }

function readUser(): StoredUser | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(USER_KEY) ?? "null"); } catch { return null; }
}
function saveUser(u: StoredUser) { localStorage.setItem(USER_KEY, JSON.stringify(u)); }
function dropUser()              { localStorage.removeItem(USER_KEY); }
function initials(n: string) {
  const parts = n.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : n.slice(0, 2).toUpperCase();
}

/* ─── Clock ─────────────────────────────────────────────────────────────── */

function useClock() {
  const [c, setC] = useState({ h: "", m: "", date: "", greeting: "" });
  useEffect(() => {
    const tick = () => {
      const d = new Date(), h = d.getHours();
      const raw = d.toLocaleDateString(undefined, {
        weekday: "long", day: "numeric", month: "long",
      });
      setC({
        h:        String(h).padStart(2, "0"),
        m:        String(d.getMinutes()).padStart(2, "0"),
        date:     raw.charAt(0).toUpperCase() + raw.slice(1),
        greeting: h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening",
      });
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  return c;
}

/* ─── Spinner ───────────────────────────────────────────────────────────── */

function Spin() {
  return (
    <span
      aria-hidden
      className="inline-block size-[18px] shrink-0 animate-spin rounded-full
                 border-2 border-white/20 border-t-white"
    />
  );
}

/* ─── OsLogin ───────────────────────────────────────────────────────────── */

type Mode   = "boot" | "lock" | "setup";
type Submit = "idle" | "pending" | "success";

export function OsLogin() {
  const router     = useRouter();
  const params     = useSearchParams();
  const redirectTo = params.get("redirect") ?? "/dashboard";
  const clock      = useClock();

  /* ── theme toggle — synced to the global ThemeProvider ── */
  const { resolvedTheme, setTheme } = useAppTheme();
  const isDark = resolvedTheme === "dark";
  const T = isDark ? DARK : LIGHT;

  /* ── boot → resolve mode ── */
  const [mode,   setMode]   = useState<Mode>("boot");
  const [stored, setStored] = useState<StoredUser | null>(null);
  useEffect(() => {
    const u = readUser();
    setStored(u);
    setMode(u ? "lock" : "setup");
  }, []);

  /* ── lock ── */
  const [pw,         setPw]        = useState("");
  const [showPw,     setShowPw]    = useState(false);
  const [altEmail,   setAltEmail]  = useState("");
  const [useAlt,     setUseAlt]    = useState(false);
  const [lockErr,    setLockErr]   = useState("");
  const [lockSt,     setLockSt]    = useState<Submit>("idle");
  const [shakeRef,   doShake]      = useAnimate();

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setLockErr("");
    setLockSt("pending");
    const email = useAlt ? altEmail : (stored?.email ?? "");
    try {
      const res = await authClient.signIn.email({ email, password: pw, callbackURL: redirectTo });
      if (res.error) {
        setPw("");
        setLockErr("That didn't match. Please check your password and try again.");
        if (shakeRef.current)
          void doShake(shakeRef.current, { x: [0, -10, 10, -7, 7, -3, 3, 0] }, { duration: 0.4 });
        setLockSt("idle");
        return;
      }
      if (useAlt) saveUser({ email, name: email.split("@")[0] });
      setLockSt("success");
      setTimeout(() => { router.replace(redirectTo); router.refresh(); }, 700);
    } catch {
      setPw("");
      setLockErr("Something went wrong. Please try again.");
      if (shakeRef.current)
        void doShake(shakeRef.current, { x: [0, -10, 10, -7, 7, -3, 3, 0] }, { duration: 0.4 });
      setLockSt("idle");
    }
  }

  /* ── setup ── */
  const [sName,    setSName]   = useState("");
  const [sEmail,   setSEmail]  = useState("");
  const [sPw,      setSPw]     = useState("");
  const [sShowPw,  setSShowPw] = useState(false);
  const [sErr,     setSErr]    = useState("");
  const [sSt,      setSSt]     = useState<Submit>("idle");
  const strength = useMemo(() => scorePassword(sPw), [sPw]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSErr("");
    setSSt("pending");
    const name = sName.trim() || sEmail.split("@")[0] || "User";
    try {
      const res = await authClient.signUp.email({
        name, email: sEmail, password: sPw, callbackURL: redirectTo,
      });
      if (res.error) {
        setSErr(res.error.message ?? "Couldn't create your account. Please try again.");
        setSSt("idle");
        return;
      }
      saveUser({ email: sEmail, name });
      setSSt("success");
      setTimeout(() => { router.replace(redirectTo); router.refresh(); }, 700);
    } catch {
      setSErr("Something went wrong. Please try again.");
      setSSt("idle");
    }
  }

  /* ── shared input style ── */
  const inputBase: React.CSSProperties = {
    height: 48, width: "100%",
    borderRadius: 10,
    border: `1.5px solid ${T.inputBorder}`,
    background: T.inputBg,
    padding: "0 16px",
    fontSize: 15, color: T.inputText,
    outline: "none",
    transition: "border-color .15s, box-shadow .15s",
  };
  const onFocus: React.FocusEventHandler<HTMLInputElement> = (e) => {
    e.currentTarget.style.borderColor = "#2f6bff";
    e.currentTarget.style.boxShadow   = "0 0 0 3px rgba(47,107,255,0.13)";
  };
  const onBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
    e.currentTarget.style.borderColor = T.inputBorder;
    e.currentTarget.style.boxShadow   = "none";
  };

  /* ─── render ─── */
  if (mode === "boot")
    return <div className="fixed inset-0" style={{ background: T.pageBg }} />;

  return (
    <div
      className="fixed inset-0 overflow-auto"
      style={{ background: T.pageBg, userSelect: "none" }}
    >
      {/* ── theme toggle ── */}
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className="absolute right-5 top-5 z-10 grid size-9 place-items-center rounded-full
                   transition-opacity hover:opacity-90"
        style={{ background: T.toggleBg, color: T.textSub }}
      >
        {isDark ? <Sun className="size-[15px]" /> : <Moon className="size-[15px]" />}
      </button>

      {/* ── clock ── */}
      <motion.div
        className="absolute left-1/2 top-[8vh] -translate-x-1/2 text-center"
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
      >
        <p
          className="tabular-nums leading-none"
          style={{
            fontSize: "clamp(60px, 12.5vw, 106px)",
            fontWeight: 200,
            letterSpacing: "-0.025em",
            color: T.text,
          }}
        >
          {clock.h || "--"}
          <span style={{ opacity: 0.35 }}>:</span>
          {clock.m || "--"}
        </p>
        {clock.date && (
          <p
            className="mt-2.5 text-[13px] font-normal"
            style={{ color: T.textSub, letterSpacing: "0.02em" }}
          >
            {clock.date}
          </p>
        )}
      </motion.div>

      {/* ── main (vertically centered in remaining space below clock) ── */}
      <div className="flex min-h-full items-center justify-center px-4 pb-16 pt-[28vh]">
        <AnimatePresence mode="wait">

          {/* ════════════ LOCK SCREEN ════════════ */}
          {mode === "lock" && (
            <motion.div
              key="lock"
              className="flex w-full max-w-[310px] flex-col items-center"
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1,    y: 0 }}
              exit={{    opacity: 0, scale: 0.96, y: -12 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Avatar */}
              <div
                className="mb-5 grid place-items-center rounded-full
                           text-[20px] font-semibold text-white"
                style={{
                  width: 80, height: 80,
                  background: "linear-gradient(145deg, #3f7aff 0%, #1030bc 100%)",
                  boxShadow: T.avaShadow,
                }}
              >
                {stored ? initials(stored.name) : <UserRound className="size-8" />}
              </div>

              {/* Name + greeting */}
              {stored && !useAlt && (
                <div className="mb-6 text-center">
                  <p className="text-[21px] font-semibold" style={{ color: T.text }}>
                    {stored.name}
                  </p>
                  <p className="mt-0.5 text-[13px]" style={{ color: T.textSub }}>
                    {clock.greeting}
                  </p>
                </div>
              )}

              {/* Form */}
              <div ref={shakeRef} className="w-full">
                <form onSubmit={handleSignIn} className="flex flex-col gap-3">
                  {useAlt && (
                    <input
                      type="email"
                      required
                      autoFocus
                      value={altEmail}
                      onChange={(e) => setAltEmail(e.target.value)}
                      autoComplete="email"
                      placeholder="Email address"
                      style={{ ...inputBase }}
                      onFocus={onFocus}
                      onBlur={onBlur}
                    />
                  )}

                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      required
                      autoFocus={!useAlt}
                      value={pw}
                      onChange={(e) => { setPw(e.target.value); setLockErr(""); }}
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      style={{ ...inputBase, paddingRight: 48 }}
                      onFocus={onFocus}
                      onBlur={onBlur}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2"
                      style={{ color: T.textMuted, opacity: 0.9 }}
                    >
                      {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>

                  <AnimatePresence>
                    {lockErr && (
                      <motion.p
                        role="alert"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{    opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="text-center text-[13px] leading-snug"
                        style={{ color: T.errColor }}
                      >
                        {lockErr}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <motion.button
                    type="submit"
                    disabled={lockSt !== "idle"}
                    whileTap={lockSt === "idle" ? { scale: 0.98 } : {}}
                    className="mt-1 flex h-12 w-full items-center justify-center gap-2
                               rounded-[10px] text-[15px] font-semibold text-white
                               transition-colors disabled:cursor-default"
                    style={{
                      background: lockSt === "success" ? "#16a34a" : "#2f6bff",
                      opacity:    lockSt === "pending"  ? 0.8 : 1,
                    }}
                  >
                    {lockSt === "pending" ? (
                      <Spin />
                    ) : lockSt === "success" ? (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                        <Check className="size-5" strokeWidth={2.5} />
                      </motion.span>
                    ) : (
                      "Sign in"
                    )}
                  </motion.button>
                </form>
              </div>

              {/* Footer links */}
              <div
                className="mt-5 flex items-center gap-3 text-[13px]"
                style={{ color: T.linkColor }}
              >
                {stored && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setUseAlt(v => !v);
                        setLockErr("");
                        setAltEmail("");
                      }}
                      className="transition-colors"
                      style={{ color: T.linkColor }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = T.linkHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.color = T.linkColor)}
                    >
                      {useAlt ? "Go back" : "Use a different account"}
                    </button>
                    <span style={{ opacity: 0.4 }}>·</span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    dropUser();
                    setStored(null);
                    setMode("setup");
                    setPw("");
                    setLockErr("");
                    setAltEmail("");
                    setUseAlt(false);
                  }}
                  className="transition-colors"
                  style={{ color: T.linkColor }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = T.linkHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = T.linkColor)}
                >
                  Create account
                </button>
              </div>
            </motion.div>
          )}

          {/* ════════════ SETUP — CREATE ACCOUNT ════════════ */}
          {mode === "setup" && (
            <motion.div
              key="setup"
              className="w-full max-w-[390px]"
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1,    y: 0 }}
              exit={{    opacity: 0, scale: 0.96, y: -12 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Card */}
              <div
                className="rounded-2xl px-8 py-9"
                style={{
                  background:  T.cardBg,
                  border:      `1px solid ${T.cardBorder}`,
                  boxShadow:   T.cardShadow,
                }}
              >
                {/* Header */}
                <div className="mb-7 flex flex-col items-center text-center">
                  <div
                    className="mb-5 grid size-[52px] place-items-center rounded-2xl text-white"
                    style={{
                      background: "linear-gradient(145deg, #3f7aff 0%, #1030bc 100%)",
                      boxShadow:  "0 4px 20px rgba(47,107,255,0.28)",
                    }}
                  >
                    <UserRound className="size-[22px]" />
                  </div>
                  <h1
                    className="text-[22px] font-semibold"
                    style={{ color: T.text, letterSpacing: "-0.01em" }}
                  >
                    Welcome to Data Navigator
                  </h1>
                  <p
                    className="mt-2 text-[14px] leading-relaxed"
                    style={{ color: T.textSub }}
                  >
                    Create your account — it only takes a moment.
                  </p>
                </div>

                {/* Form */}
                <form onSubmit={handleCreate} className="flex flex-col gap-4">

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium" style={{ color: T.textSub }}>
                      Full name
                    </label>
                    <input
                      type="text"
                      value={sName}
                      onChange={(e) => setSName(e.target.value)}
                      autoComplete="name"
                      placeholder="Your name (optional)"
                      style={{ ...inputBase }}
                      onFocus={onFocus}
                      onBlur={onBlur}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium" style={{ color: T.textSub }}>
                      Email address
                    </label>
                    <input
                      type="email"
                      required
                      value={sEmail}
                      onChange={(e) => { setSEmail(e.target.value); setSErr(""); }}
                      autoComplete="email"
                      placeholder="you@example.com"
                      style={{ ...inputBase }}
                      onFocus={onFocus}
                      onBlur={onBlur}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[13px] font-medium" style={{ color: T.textSub }}>
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={sShowPw ? "text" : "password"}
                        required
                        minLength={8}
                        value={sPw}
                        onChange={(e) => { setSPw(e.target.value); setSErr(""); }}
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        style={{ ...inputBase, paddingRight: 48 }}
                        onFocus={onFocus}
                        onBlur={onBlur}
                      />
                      <button
                        type="button"
                        onClick={() => setSShowPw(v => !v)}
                        aria-label={sShowPw ? "Hide password" : "Show password"}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2"
                        style={{ color: T.textMuted, opacity: 0.9 }}
                      >
                        {sShowPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>

                    {/* Strength meter */}
                    <AnimatePresence>
                      {sPw && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{    opacity: 0, height: 0 }}
                          transition={{ duration: 0.15 }}
                          className="flex items-center gap-2 pt-1"
                        >
                          <div className="flex flex-1 gap-1">
                            {[0, 1, 2, 3].map((i) => {
                              const filled = strength.score > i;
                              return (
                                <div
                                  key={i}
                                  className={`h-[3px] flex-1 rounded-full transition-all duration-300 ${
                                    filled ? strength.tone : ""
                                  }`}
                                  style={
                                    filled
                                      ? undefined
                                      : { background: isDark ? "rgba(255,255,255,0.07)" : "#e0e5ef" }
                                  }
                                />
                              );
                            })}
                          </div>
                          <span className="min-w-[30px] text-[12px]" style={{ color: T.textMuted }}>
                            {strength.label}
                          </span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <AnimatePresence>
                    {sErr && (
                      <motion.p
                        role="alert"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{    opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="text-[13px] leading-snug"
                        style={{ color: T.errColor }}
                      >
                        {sErr}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <motion.button
                    type="submit"
                    disabled={sSt !== "idle"}
                    whileTap={sSt === "idle" ? { scale: 0.98 } : {}}
                    className="flex h-12 w-full items-center justify-center gap-2
                               rounded-[10px] text-[15px] font-semibold text-white
                               transition-colors disabled:cursor-default"
                    style={{
                      background: sSt === "success" ? "#16a34a" : "#2f6bff",
                      opacity:    sSt === "pending"  ? 0.8 : 1,
                    }}
                  >
                    {sSt === "pending" ? (
                      <Spin />
                    ) : sSt === "success" ? (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                        <Check className="size-5" strokeWidth={2.5} />
                      </motion.span>
                    ) : (
                      "Get started"
                    )}
                  </motion.button>
                </form>
              </div>

              {/* Sign in link */}
              <p className="mt-5 text-center text-[13px]" style={{ color: T.linkColor }}>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("lock");
                    setUseAlt(true);
                    setSErr("");
                  }}
                  className="font-medium underline-offset-2 hover:underline"
                  style={{ color: T.textSub }}
                >
                  Sign in
                </button>
              </p>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* ── footer ── */}
      <motion.p
        className="absolute bottom-5 left-1/2 -translate-x-1/2 text-[11px] tracking-wide"
        style={{ color: T.textMuted }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.2 }}
      >
        Data Navigator
      </motion.p>
    </div>
  );
}
