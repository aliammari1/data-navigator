import type { Metadata } from "next";
import { Suspense } from "react";
import { OsLogin } from "@/components/auth/os-login";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in · Data Navigator",
  description: "Sign in to your local Data Navigator workspace.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <OsLogin />
    </Suspense>
  );
}
