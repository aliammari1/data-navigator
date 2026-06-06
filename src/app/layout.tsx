import type { Metadata, Viewport } from "next";
import { Fira_Code, Poppins } from "next/font/google";
import { QueryProvider } from "@/components/query-provider";
import { SWRegister } from "@/components/sw-register";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/shared/utils";
import "./globals.css";
import "@/design/tokens.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-data-navigator-sans",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-moudir-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DataNavigator — Offline-first data analytics",
  description:
    "Query, transform and visualise data entirely in your browser. DuckDB WASM · Offline AI · No backend required.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#1E40AF",
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
      className={cn("h-full antialiased dark", poppins.variable, firaCode.variable)}
    >
      <body
        className="min-h-full flex flex-col bg-background text-foreground"
        style={{ scrollBehavior: "smooth" }}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
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
