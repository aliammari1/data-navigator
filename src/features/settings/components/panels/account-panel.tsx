"use client";

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { KeyRound, LogIn, LogOut, ShieldCheck, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCollabHubStore } from "@/core/stores/collab-hub-store";
import type { DashboardRole } from "@/core/stores/settings-store";
import { useSettingsStore } from "@/core/stores/settings-store";
import { authClient, signOut, useSession } from "@/platform/auth/auth-client";
import { Section, SettingRow, SettingSelect } from "../controls";

function AccessSection() {
  const role = useSettingsStore((s) => s.role);
  const setRole = useSettingsStore((s) => s.setRole);
  const username = useCollabHubStore.use.username();
  const setUsername = useCollabHubStore.use.setUsername();
  const [nameDraft, setNameDraft] = useState(username);

  return (
    <Section title="Access & Identity" icon={ShieldCheck}>
      <SettingRow
        label="Display name"
        description="Shown to teammates in collaboration, comments, and audit history"
      >
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            const trimmed = nameDraft.trim();
            if (trimmed && trimmed !== username) setUsername(trimmed);
            else setNameDraft(username);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-40 bg-card border border-border text-sm text-foreground rounded-lg px-3 py-1.5 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </SettingRow>
      <SettingRow
        label="Role"
        description="Gates upload/export/rename/comment actions on this device"
      >
        <SettingSelect<DashboardRole>
          value={role}
          onChange={setRole}
          ariaLabel="Role"
          options={[
            { value: "owner", label: "Owner" },
            { value: "editor", label: "Editor" },
            { value: "viewer", label: "Viewer" },
          ]}
        />
      </SettingRow>
    </Section>
  );
}

// ─── Change-password form schema (TanStack Form consumes Zod via Standard Schema) ─

const ChangePasswordSchema = z
  .object({
    current: z.string().min(8, "At least 8 characters"),
    next: z.string().min(8, "At least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, {
    path: ["confirm"],
    message: "Passwords don't match",
  });

function ChangePasswordForm() {
  const form = useForm({
    defaultValues: { current: "", next: "", confirm: "" },
    validators: { onChange: ChangePasswordSchema },
    onSubmit: async ({ value, formApi }) => {
      const { error } = await authClient.changePassword({
        currentPassword: value.current,
        newPassword: value.next,
        revokeOtherSessions: true,
      });
      if (error) {
        toast.error("Could not change password", {
          description: error.message ?? undefined,
        });
        return;
      }
      toast.success("Password updated");
      formApi.reset();
    },
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="current">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor={field.name}>Current password</Label>
            <Input
              id={field.name}
              name={field.name}
              type="password"
              autoComplete="current-password"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            <FieldError messages={field.state.meta.errors} />
          </div>
        )}
      </form.Field>

      <form.Field name="next">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor={field.name}>New password</Label>
            <Input
              id={field.name}
              name={field.name}
              type="password"
              autoComplete="new-password"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            <FieldError messages={field.state.meta.errors} />
          </div>
        )}
      </form.Field>

      <form.Field name="confirm">
        {(field) => (
          <div className="space-y-1">
            <Label htmlFor={field.name}>Confirm new password</Label>
            <Input
              id={field.name}
              name={field.name}
              type="password"
              autoComplete="new-password"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            <FieldError messages={field.state.meta.errors} />
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting] as const}>
        {([canSubmit, isSubmitting]) => (
          <Button type="submit" size="sm" disabled={!canSubmit || isSubmitting}>
            <KeyRound className="w-3.5 h-3.5" />
            {isSubmitting ? "Updating…" : "Update password"}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

/** TanStack Form errors are `string | { message }` issues; flatten to text. */
function FieldError({ messages }: { messages: unknown[] }) {
  if (!messages || messages.length === 0) return null;
  const text = messages
    .map((m) =>
      typeof m === "string"
        ? m
        : typeof m === "object" && m && "message" in m
          ? String((m as { message: unknown }).message)
          : "",
    )
    .filter(Boolean)
    .join(", ");
  if (!text) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {text}
    </p>
  );
}

export function AccountPanel() {
  const router = useRouter();
  const session = useSession();
  const [signingOut, setSigningOut] = useState(false);

  if (session.isPending) {
    return (
      <>
        <AccessSection />
        <Section title="Account" icon={User}>
          <p className="text-sm text-muted-foreground">Loading session…</p>
        </Section>
      </>
    );
  }

  if (!session.data) {
    return (
      <>
        <AccessSection />
        <Section title="Account" icon={User}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-foreground">Not signed in</div>
              <div className="text-xs text-muted-foreground">
                Sign in to manage your local account and change your password.
              </div>
            </div>
            <Button asChild size="sm">
              <Link href="/login?redirect=/dashboard/settings">
                <LogIn className="w-3.5 h-3.5" /> Sign in
              </Link>
            </Button>
          </div>
        </Section>
      </>
    );
  }

  const user = session.data.user;

  return (
    <>
      <AccessSection />
      <Section title="Account" icon={User}>
        <SettingRow label="Signed in as">
          <span className="text-sm text-foreground font-mono">{user.email}</span>
        </SettingRow>
        {user.name && (
          <SettingRow label="Name">
            <span className="text-sm text-foreground">{user.name}</span>
          </SettingRow>
        )}
        <SettingRow
          label="Session"
          description="Stored locally; sign out to clear it from this device"
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              try {
                await signOut();
                toast.success("Signed out");
                router.replace("/login");
                router.refresh();
              } catch {
                toast.error("Could not sign out");
                setSigningOut(false);
              }
            }}
          >
            <LogOut className="w-3.5 h-3.5" />
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </SettingRow>
      </Section>

      <Section title="Change Password" icon={KeyRound}>
        <ChangePasswordForm />
      </Section>
    </>
  );
}
