"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowRight,
  Database,
  LockKeyhole,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient, useSession } from "@/lib/auth-client";

type AuthMode = "signin" | "signup";

export function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const session = useSession();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const heading = mode === "signin" ? "Welcome back" : "Create local account";
  const initials = useMemo(
    () =>
      name
        .trim()
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase() || "DN",
    [name],
  );

  useEffect(() => {
    if (session.data) router.replace(redirectTo);
  }, [redirectTo, router, session.data]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const result =
        mode === "signin"
          ? await authClient.signIn.email({
              email,
              password,
              callbackURL: redirectTo,
            })
          : await authClient.signUp.email({
              name: name.trim() || email.split("@")[0],
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-size-[48px_48px] opacity-[0.12]" />
      <div className="absolute inset-x-0 top-0 h-64 bg-linear-to-b from-primary/10 to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_420px]"
      >
        <section className="flex flex-col justify-center rounded-2xl border border-border bg-card/70 p-8 shadow-xl shadow-black/10 backdrop-blur">
          <Link
            href="/"
            className="mb-10 flex w-fit items-center gap-2 text-sm font-semibold text-foreground"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Database className="size-4" />
            </span>
            DataNavigator
          </Link>
          <div className="max-w-xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
              <ShieldCheck className="size-3.5" />
              Local auth, local data, offline-first analytics
            </div>
            <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-5xl">
              Keep the workspace private and persistent.
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
              Sign in to unlock the dashboard shell. Telecom files, report
              state, SQL history, and restored sessions stay on this machine.
            </p>
          </div>

          <div className="mt-10 grid max-w-xl gap-3 sm:grid-cols-3">
            {[
              ["SQLite", "Better Auth stores users locally"],
              ["IndexedDB", "Reports restore between sessions"],
              ["DuckDB", "Queries run in-browser"],
            ].map(([title, desc]) => (
              <div
                key={title}
                className="rounded-xl border border-border bg-background/60 p-3"
              >
                <div className="text-sm font-semibold text-foreground">
                  {title}
                </div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">
                  {desc}
                </div>
              </div>
            ))}
          </div>
        </section>

        <Card className="rounded-2xl border border-border bg-card/90 shadow-2xl shadow-black/20 backdrop-blur">
          <CardHeader>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-muted text-sm font-semibold">
                {initials}
              </div>
              <LockKeyhole className="size-5 text-muted-foreground" />
            </div>
            <CardTitle className="text-2xl">{heading}</CardTitle>
            <CardDescription>
              Use email and password. Minimum password length is 8 characters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(value) => setMode(value as AuthMode)}>
              <TabsList className="mb-6 w-full rounded-xl">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
              </TabsList>

              <form onSubmit={handleSubmit}>
                <FieldGroup className="gap-4">
                  <TabsContent value="signup" className="m-0">
                    <Field>
                      <FieldLabel htmlFor="name">Name</FieldLabel>
                      <div className="relative">
                        <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="name"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          autoComplete="name"
                          className="pl-9"
                          placeholder="Ammar"
                        />
                      </div>
                    </Field>
                  </TabsContent>

                  <TabsContent value="signin" className="m-0 contents" />

                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        autoComplete="email"
                        className="pl-9"
                        placeholder="you@example.com"
                      />
                    </div>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        required
                        minLength={8}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete={
                          mode === "signin" ? "current-password" : "new-password"
                        }
                        className="pl-9"
                        placeholder="8+ characters"
                      />
                    </div>
                    <FieldDescription>
                      This account is for this local DataNavigator instance.
                    </FieldDescription>
                  </Field>

                  {error && <FieldError>{error}</FieldError>}

                  <Button type="submit" size="lg" disabled={pending}>
                    {pending
                      ? "Working..."
                      : mode === "signin"
                        ? "Sign in"
                        : "Create account"}
                    <ArrowRight className="size-4" />
                  </Button>
                </FieldGroup>
              </form>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>
    </main>
  );
}
