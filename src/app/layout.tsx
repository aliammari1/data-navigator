import type { Metadata, Viewport } from "next";
import { QueryProvider } from "@/components/query-provider";
import { SWRegister } from "@/components/sw-register";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/shared/utils";
import "./globals.css";
import "@/design/tokens.css";

export const metadata: Metadata = {
  title: "DataNavigator — Offline-first data analytics",
  description:
    "Query, transform and visualise data entirely in your browser. DuckDB WASM · Offline AI · No backend required.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full antialiased dark")}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </QueryProvider>
        </ThemeProvider>

        {/* F2 — PWA Service Worker */}
        <SWRegister />
      </body>
    </html>
  );
}
