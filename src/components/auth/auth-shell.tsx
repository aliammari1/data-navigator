"use client";

import { Activity, Database, Lock, Radar } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";

const telemetry = [
  { icon: Database, label: "Local SQLite auth", desc: "Accounts never leave the device." },
  { icon: Lock, label: "Zero outbound", desc: "No default network traffic." },
  { icon: Activity, label: "DuckDB in-process", desc: "Queries run on this machine." },
] as const;

/**
 * Shared scaffold for the auth routes.
 * Left: branded value panel. Right: the form card slot.
 * One cyan accent, one radius system (cards 2xl, inputs/buttons xl), no decoration.
 */
export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle: ReactNode;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#07090f] text-slate-200">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(55% 50% at 12% 0%, rgba(34,211,238,0.07), transparent 60%), radial-gradient(50% 50% at 100% 100%, rgba(59,130,246,0.05), transparent 55%)",
        }}
      />

      <div className="relative mx-auto grid min-h-[100dvh] w-full max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-2 lg:gap-16">
        {/* ── Value panel ── */}
        <section className="hidden flex-col justify-center lg:flex">
          <Link href="/" className="flex w-fit items-center gap-3">
            <div className="grid size-11 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/5">
              <Radar className="size-5 text-cyan-300" />
            </div>
            <span className="text-xl font-semibold tracking-tight text-white">Data Navigator</span>
          </Link>

          <h2 className="mt-10 max-w-md text-4xl font-semibold leading-tight tracking-tight text-white">
            Keep the workspace private and persistent.
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-slate-400">
            Unlock the console shell. Telecom files, report state, SQL history and restored sessions
            all stay on this machine.
          </p>

          <div className="mt-10 grid max-w-md gap-2.5">
            {telemetry.map((t) => {
              const Icon = t.icon;
              return (
                <div
                  key={t.label}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3"
                >
                  <div className="grid size-9 shrink-0 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/5 text-cyan-300">
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{t.label}</div>
                    <div className="text-xs text-slate-400">{t.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Form card ── */}
        <motion.section
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex justify-center lg:justify-end"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.02] p-7 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] sm:p-9">
            {/* mobile brand */}
            <Link href="/" className="mb-6 flex w-fit items-center gap-2.5 lg:hidden">
              <div className="grid size-9 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/5">
                <Radar className="size-4 text-cyan-300" />
              </div>
              <span className="text-base font-semibold text-white">Data Navigator</span>
            </Link>

            <div className="mb-7">
              <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">
                {eyebrow}
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">{title}</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{subtitle}</p>
            </div>

            {children}
          </div>
        </motion.section>
      </div>
    </main>
  );
}

/* ── Shared form field primitives ── */

export function Field({
  label,
  htmlFor,
  icon,
  rightSlot,
  children,
}: {
  label: string;
  htmlFor: string;
  icon: ReactNode;
  rightSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-200">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-slate-400">
          {icon}
        </span>
        {children}
        {rightSlot && (
          <span className="absolute right-3 top-1/2 z-10 -translate-y-1/2">{rightSlot}</span>
        )}
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-200"
    >
      {message}
    </p>
  );
}

/** Shared input + submit styles, so sign-in and sign-up stay identical. */
export const authInputClass =
  "h-12 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-10 text-[15px] text-white placeholder:text-slate-500 outline-none transition-colors focus-visible:border-cyan-400/50 focus-visible:ring-2 focus-visible:ring-cyan-400/25";

export const authSubmitClass =
  "mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 text-[15px] font-semibold text-[#04121f] transition-all hover:bg-cyan-300 active:translate-y-px disabled:opacity-60";
