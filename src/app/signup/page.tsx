import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create account · Data Navigator",
  description: "Create a local Data Navigator account that stays on your device.",
};

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}
