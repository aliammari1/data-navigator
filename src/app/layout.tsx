import type { Metadata, Viewport } from "next";
import { Fira_Code, Fraunces, JetBrains_Mono, Outfit, Poppins } from "next/font/google";
import { QueryProvider } from "@/components/query-provider";
import { SWRegister } from "@/components/sw-register";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ModelRequiredDialog } from "@/platform/ai/models/ModelRequiredDialog";
import { cn } from "@/shared/utils";
import "./globals.css";

// Outfit — top-tier modern enterprise UI sans for the whole app (chrome,
// headings, KPI numbers, labels). Self-hosted by next/font for offline resilience.
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-data-navigator-sans",
  display: "swap",
});

// Poppins — companion modern geometric display font for prominent headings & badges
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-data-navigator-display",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-moudir-mono",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-edition-serif",
  display: "swap",
});

// Developer "nerd"-style font for the desktop chrome (menu bar, dock, spotlight,
// window titles). Self-hosted by next/font so it works fully offline.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-nerd",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Data Navigator — Offline-first data analytics",
  description:
    "Query, transform and visualise data entirely on-device. DuckDB performance, embedded AI, no backend required.",
  applicationName: "Data Navigator",
  manifest: "/manifest.json",
  openGraph: {
    title: "Data Navigator — Offline-first data analytics",
    description:
      "Query, transform and visualise data entirely on-device. DuckDB performance, embedded AI, no backend required.",
    siteName: "Data Navigator",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1a22",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={cn(
        "h-full antialiased dark",
        outfit.variable,
        poppins.variable,
        firaCode.variable,
        fraunces.variable,
        jetbrainsMono.variable,
        "font-sans",
      )}
    >
      <head>
        {/* Pre-paint theme resolution — set the .dark/.light class from the
            stored preference or the OS (follow-system default) before first
            paint, so there's no flash. ThemeProvider takes over on hydrate. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='light'?false:t==='dark'?true:window.matchMedia('(prefers-color-scheme: dark)').matches;var c=document.documentElement.classList;c.remove('light','dark');c.add(d?'dark':'light');document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </QueryProvider>
          <ModelRequiredDialog />
          <Toaster />
        </ThemeProvider>

        {/* F2 — PWA Service Worker */}
        <SWRegister />
      </body>
    </html>
  );
}
