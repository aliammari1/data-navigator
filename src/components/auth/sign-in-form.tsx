"use client";

import { ArrowRight, Eye, LockKeyhole, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { authClient, useSession } from "@/platform/auth/auth-client";
import { AuthShell, authInputClass, authSubmitClass, Field, FormError } from "./auth-shell";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const session = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (session.data) router.replace(redirectTo);
  }, [redirectTo, router, session.data]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const result = await authClient.signIn.email({ email, password, callbackURL: redirectTo });
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

  const signupHref = `/signup${redirectTo !== "/dashboard" ? `?redirect=${encodeURIComponent(redirectTo)}` : ""}`;

  return (
    <AuthShell
      eyebrow="Sign in"
      title="Welcome back"
      subtitle="Sign in with your email and password to unlock the console."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
            autoComplete="current-password"
            placeholder="••••••••"
            className={`${authInputClass} pr-10`}
          />
        </Field>

        <div className="-mt-1 flex justify-end">
          <button
            type="button"
            className="text-[13px] font-medium text-cyan-300 transition-colors hover:text-cyan-100"
          >
            Forgot password?
          </button>
        </div>

        <FormError message={error} />

        <button type="submit" disabled={pending} className={authSubmitClass}>
          {pending ? (
            <span className="size-4 animate-spin rounded-full border-2 border-[#04121f]/30 border-t-[#04121f]" />
          ) : (
            <>
              Sign in <ArrowRight className="size-4" />
            </>
          )}
        </button>

        <p className="text-center text-sm text-slate-400">
          Don&apos;t have an account?{" "}
          <Link
            href={signupHref}
            className="font-semibold text-cyan-300 transition-colors hover:text-cyan-100"
          >
            Create one
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
