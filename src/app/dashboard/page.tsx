import { redirect } from "next/navigation";

/**
 * Dashboard index.
 *
 * There is no standalone Accueil/home screen — the telecom report's Vue
 * d'ensemble tab is the landing page. It already has its own empty state
 * ("Aucun rapport télécom chargé" + an Upload CTA) for the no-dataset case.
 */
export default function Page() {
  redirect("/dashboard/telecom-report/overview");
}
