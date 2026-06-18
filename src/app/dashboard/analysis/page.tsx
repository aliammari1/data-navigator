import { Brain } from "lucide-react";
import { HubPage } from "@/features/dashboard-shell/nav/hub-page";
import { NAV_SECTIONS } from "@/features/dashboard-shell/nav/nav-config";

const ANALYSE = NAV_SECTIONS.find((s) => s.label === "Intelligence")?.items.find(
  (i) => i.href === "/dashboard/analysis",
);

export default function AnalysisHubPage() {
  return (
    <HubPage
      title="Analyse"
      description="Statistiques, analyses approfondies, prévisions et géographie de votre jeu de données."
      icon={<Brain />}
      items={ANALYSE?.children ?? []}
    />
  );
}
