import { Database } from "lucide-react";
import { HubPage } from "@/features/dashboard-shell/nav/hub-page";
import { NAV_SECTIONS } from "@/features/dashboard-shell/nav/nav-config";

const DONNEES = NAV_SECTIONS.find((s) => s.label === "Données")?.items.find(
  (i) => i.href === "/dashboard/data",
);

export default function DataHubPage() {
  return (
    <HubPage
      title="Données"
      description="Catalogue, profil, exploration, transformations, lignage et journal d'activité."
      icon={<Database />}
      items={DONNEES?.children ?? []}
    />
  );
}
