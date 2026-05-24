"use client";

import {
  ArrowRight,
  CircleDot,
  Database,
  Eye,
  LockKeyhole,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient, useSession } from "@/platform/auth/auth-client";

type AuthMode = "signin" | "signup";

const LOGO_SRC = "/icon.png";
const AUTH_BG_SRC = "/auth-bg.png";

const features = [
  {
    title: "SQLite",
    description: "Better auth stores users locally.",
    icon: Database,
  },
  {
    title: "IndexedDB",
    description: "Reports restore between sessions.",
    icon: Database,
  },
  {
    title: "DuckDB",
    description: "Queries run in-browser with high performance.",
    icon: CircleDot,
  },
];

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const session = useSession();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const isSignup = mode === "signup";

  useEffect(() => {
    if (session.data) {
      router.replace(redirectTo);
    }
  }, [redirectTo, router, session.data]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const result = isSignup
        ? await authClient.signUp.email({
            name: name.trim() || email.split("@")[0] || "DataNavigator User",
            email,
            password,
            callbackURL: redirectTo,
          })
        : await authClient.signIn.email({
            email,
            password,
            callbackURL: redirectTo,
          });

      if (result.error) {
        setError(result.error.message || "Authentication failed.");
        return;
      }

      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020812] text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: `url(${AUTH_BG_SRC})`,
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "58% center",
        }}
      />

      <div className="pointer-events-none absolute inset-0 bg-[#020812]/12" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,transparent_0%,rgba(2,8,18,0.08)_38%,rgba(2,8,18,0.48)_100%)]" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[16%] bg-gradient-to-r from-[#020812]/32 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[22%] bg-gradient-to-l from-[#020812]/36 to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1280px] items-center gap-12 px-6 py-10 lg:grid-cols-[640px_560px] xl:gap-[76px]"
      >
        <HeroPanel />

        <AuthCard
          isSignup={isSignup}
          mode={mode}
          setMode={setMode}
          name={name}
          setName={setName}
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          showPassword={showPassword}
          setShowPassword={setShowPassword}
          error={error}
          setError={setError}
          pending={pending}
          handleSubmit={handleSubmit}
        />
      </motion.div>
    </main>
  );
}

function HeroPanel() {
  return (
    <section className="relative flex min-h-[590px] flex-col justify-center">
      <Link href="/" className="relative mb-8 flex w-fit items-center gap-5">
        <span className="flex size-[74px] items-center justify-center rounded-[18px] border border-cyan-300/20 bg-[#071a2d]/80 shadow-[0_0_32px_rgba(34,211,238,0.22)] backdrop-blur-sm">
          <Image
            src={LOGO_SRC}
            width={74}
            height={74}
            alt="DataNavigator logo"
            priority
            className="rounded-[18px] object-cover"
          />
        </span>

        <span className="font-serif text-[37px] font-semibold tracking-[-0.03em] text-white drop-shadow-[0_0_18px_rgba(255,255,255,0.14)]">
          DataNavigator
        </span>
      </Link>

      <div className="relative mb-9 inline-flex w-fit items-center gap-3 rounded-xl border border-cyan-300/20 bg-cyan-400/8 px-4 py-2 text-[14px] font-semibold text-cyan-300 shadow-[0_0_34px_rgba(34,211,238,0.08)] backdrop-blur-sm">
        <ShieldCheck className="size-4" />
        <span>Local auth</span>
        <span className="text-cyan-300/45">•</span>
        <span>Local data</span>
        <span className="text-cyan-300/45">•</span>
        <span>Offline-first analytics</span>
      </div>

      <div className="relative max-w-[650px]">
        <h1 className="font-serif text-[58px] font-semibold leading-[1.08] tracking-[0.055em] text-white sm:text-[64px]">
          Keep the workspace
          <br />
          <span className="bg-gradient-to-r from-cyan-100 via-cyan-300 to-cyan-500 bg-clip-text text-transparent">
            private and persistent.
          </span>
        </h1>

        <p className="mt-7 max-w-[585px] text-[20px] leading-8 text-slate-300/78">
          Sign in to unlock the dashboard shell. Telecom files, report state,
          SQL history, and restored sessions stay on this machine.
        </p>
      </div>

      <div className="relative mt-10 grid max-w-[615px] gap-4 sm:grid-cols-3">
        {features.map((feature) => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </div>
    </section>
  );
}

function AuthCard({
  isSignup,
  mode,
  setMode,
  name,
  setName,
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  error,
  setError,
  pending,
  handleSubmit,
}: {
  isSignup: boolean;
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  name: string;
  setName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  showPassword: boolean;
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
  error: string;
  setError: (value: string) => void;
  pending: boolean;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="relative flex justify-center lg:justify-end">
      <div className="absolute -inset-7 rounded-[34px] bg-cyan-400/8 blur-2xl" />

      <div className="relative w-full max-w-[560px] overflow-hidden rounded-[22px] border border-cyan-300/24 bg-[#07111f]/58 px-[50px] pb-[28px] pt-[38px] shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_30px_90px_rgba(0,0,0,0.52)] backdrop-blur-[6px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_4%,rgba(34,211,238,0.13),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.008)_42%,transparent)]" />
        <div className="pointer-events-none absolute inset-0 bg-[#05101d]/18" />
        <div className="pointer-events-none absolute inset-0 rounded-[22px] ring-1 ring-cyan-200/8" />

        <div className="relative">
          <div className="mx-auto mb-9 flex size-[94px] items-center justify-center rounded-[18px] border border-cyan-300/22 bg-[#061528]/70 shadow-[0_0_28px_rgba(34,211,238,0.18)] backdrop-blur-sm">
            <Image
              src={LOGO_SRC}
              width={94}
              height={94}
              alt="DataNavigator logo"
              priority
              className="rounded-[18px] object-cover"
            />
          </div>

          <div className="mb-10 text-center">
            <h2 className="font-serif text-[39px] font-semibold leading-none tracking-[-0.025em] text-white">
              {isSignup ? "Create account" : "Welcome back"}
            </h2>

            <p className="mx-auto mt-5 max-w-[390px] text-[17px] leading-7 text-slate-300/82">
              Use email and password. Minimum password length is
              <br />8 characters.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignup && (
              <FieldShell
                label="Name"
                htmlFor="name"
                icon={<User className="size-5" />}
              >
                <Input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  placeholder="Ammar"
                  className="h-[55px] rounded-[14px] border-white/12 bg-[#0d1826]/62 pl-[58px] text-[16px] text-white placeholder:text-slate-500 shadow-inner shadow-black/20 focus-visible:ring-1 focus-visible:ring-cyan-300/35"
                />
              </FieldShell>
            )}

            <FieldShell
              label="Email"
              htmlFor="email"
              icon={<Mail className="size-5" />}
            >
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                className="h-[55px] rounded-[14px] border-white/12 bg-[#0d1826]/62 pl-[58px] text-[16px] text-white placeholder:text-slate-500 shadow-inner shadow-black/20 focus-visible:ring-1 focus-visible:ring-cyan-300/35"
              />
            </FieldShell>

            <FieldShell
              label="Password"
              htmlFor="password"
              icon={<LockKeyhole className="size-5" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="text-slate-500 transition hover:text-cyan-200"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <Eye className="size-5" />
                </button>
              }
            >
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isSignup ? "new-password" : "current-password"}
                placeholder="••••••••"
                className="h-[55px] rounded-[14px] border-white/12 bg-[#0d1826]/62 pl-[58px] pr-[58px] text-[16px] text-white placeholder:text-slate-500 shadow-inner shadow-black/20 focus-visible:ring-1 focus-visible:ring-cyan-300/35"
              />
            </FieldShell>

            {!isSignup && (
              <div className="-mt-1 flex justify-end">
                <button
                  type="button"
                  className="text-[14px] font-medium text-cyan-300 transition hover:text-cyan-100"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={pending}
              className="mt-7 h-[58px] w-full rounded-[9px] bg-gradient-to-r from-cyan-300 to-blue-600 text-[17px] font-semibold text-white shadow-[0_16px_44px_rgba(14,165,233,0.25)] transition hover:from-cyan-200 hover:to-blue-500 disabled:opacity-60"
            >
              {pending ? "Working..." : isSignup ? "Create account" : "Sign in"}
              <ArrowRight className="ml-3 size-5" />
            </Button>

            <div className="flex items-center gap-6 py-3 text-[16px] text-slate-400">
              <div className="h-px flex-1 bg-white/10" />
              <span>or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <p className="text-center text-[16px] text-slate-300/82">
              {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signup" ? "signin" : "signup");
                  setError("");
                }}
                className="font-semibold text-cyan-300 transition hover:text-cyan-100"
              >
                {isSignup ? "Sign in" : "Sign up"}
              </button>
            </p>

            <div className="mt-8 flex items-start gap-5 rounded-[9px] border border-white/10 bg-white/[0.045] px-7 py-5 backdrop-blur-sm">
              <ShieldCheck className="mt-0.5 size-8 shrink-0 text-cyan-300" />
              <p className="text-[16px] leading-7 text-slate-300/88">
                This account stays on this device.
                <br />
                We do not send your data anywhere.
              </p>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: typeof Database;
}) {
  return (
    <div className="rounded-xl border border-cyan-300/16 bg-[#071423]/52 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.22)] backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-8 items-center justify-center text-cyan-300">
          <Icon className="size-7" />
        </div>
        <h3 className="font-serif text-[19px] font-semibold text-white">
          {title}
        </h3>
      </div>
      <p className="text-[15px] leading-6 text-slate-300/76">{description}</p>
    </div>
  );
}

function FieldShell({
  label,
  htmlFor,
  icon,
  rightIcon,
  children,
}: {
  label: string;
  htmlFor: string;
  icon: React.ReactNode;
  rightIcon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-3 block font-serif text-[18px] font-semibold text-white"
      >
        {label}
      </label>

      <div className="relative">
        <div className="pointer-events-none absolute left-5 top-1/2 z-10 -translate-y-1/2 text-slate-500">
          {icon}
        </div>

        {children}

        {rightIcon && (
          <div className="absolute right-5 top-1/2 z-10 -translate-y-1/2">
            {rightIcon}
          </div>
        )}
      </div>
    </div>
  );
}
