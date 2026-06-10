"use client";

import { ArrowRight, Eye, LockKeyhole, Mail, User } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { authClient, useSession } from "@/platform/auth/auth-client";
import { AuthShell, authInputClass, authSubmitClass, Field, FormError } from "./auth-shell";
import { scorePassword } from "./password-strength";

export function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const session = useSession();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const strength = useMemo(() => scorePassword(password), [password]);

  useEffect(() => {
    if (session.data) router.replace(redirectTo);
  }, [redirectTo, router, session.data]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const result = await authClient.signUp.email({
        name: name.trim() || email.split("@")[0] || "DataNavigator User",
        email,
        password,
        callbackURL: redirectTo,
      });
      if (result.error) {
        setError(result.error.message || "Could not create account.");
        return;
      }
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account.");
    } finally {
      setPending(false);
    }
  }

  const loginHref = `/login${redirectTo !== "/dashboard" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`;

  return (
    <AuthShell
      eyebrow="Create account"
      title="Create your account"
      subtitle="Set up a local account. It stays on this device. Minimum 8-character password."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field label="Name" htmlFor="name" icon={<User className="size-4" />}>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            placeholder="Ammar Khelifi"
            className={authInputClass}
          />
        </Field>

        <Field label="Email" htmlFor="email" icon={<Mail className="size-4" />}>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            className={authInputClass}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          icon={<LockKeyhole className="size-4" />}
          rightSlot={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-slate-400 transition-colors hover:text-cyan-200"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <Eye className="size-4" />
            </button>
          }
        >
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="••••••••"
            className={`${authInputClass} pr-10`}
          />
        </Field>

        {/* strength meter */}
        <div className="flex items-center gap-3">
          <div className="flex flex-1 gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  password && strength.score > i ? strength.tone : "bg-white/10"
                }`}
              />
            ))}
          </div>
          <span className="w-16 text-right font-mono text-[10px] uppercase tracking-wider text-slate-400">
            {password ? strength.label : ""}
          </span>
        </div>

        <FormError message={error} />

        <button type="submit" disabled={pending} className={authSubmitClass}>
          {pending ? (
            <span className="size-4 animate-spin rounded-full border-2 border-[#04121f]/30 border-t-[#04121f]" />
          ) : (
            <>
              Create account <ArrowRight className="size-4" />
            </>
          )}
        </button>

        <p className="text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link
            href={loginHref}
            className="font-semibold text-cyan-300 transition-colors hover:text-cyan-100"
          >
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
