"use client";

import {
  Copy,
  FileDown,
  FileSpreadsheet,
  FileUp,
  FolderOpen,
  ListPlus,
  Network,
  Play,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  TableProperties,
  X,
} from "lucide-react";
import type { AppMenuBuilder } from "@/features/desktop/core/menu/types";

/**
 * App-specific menus for the "transform" app ("Transformations").
 *
 * The screen is a SQL transform-pipeline builder with five tabs (Configurer,
 * Aperçu, Profil, SQL, Analytique) registered as pages, plus run/reset/export,
 * step-add, source-profiling, recipe save/load and copy-SQL actions. Menu items
 * reach those handlers through the app-command bus (ctx.command → useAppCommands)
 * and page switching through ctx.setActivePage. Universal Édition / Affichage /
 * Fenêtre / Aide menus are merged in by the registry.
 */
export const buildMenu: AppMenuBuilder = (ctx) => [
  {
    id: "file",
    label: "Fichier",
    items: [
      {
        id: "new-window",
        label: "Nouvelle fenêtre",
        icon: Plus,
        run: () => ctx.openApp("transform", { forceNew: true }),
      },
      { kind: "separator", id: "sep-import" },
      {
        id: "import-data",
        label: "Importer des données…",
        icon: FileUp,
        run: () => ctx.openApp("upload"),
      },
      { kind: "separator", id: "sep-recipe" },
      {
        id: "save-recipe",
        label: "Enregistrer la recette",
        icon: Save,
        run: () => ctx.command("save-recipe"),
      },
      {
        id: "recipes",
        label: "Recettes enregistrées",
        icon: FolderOpen,
        run: () => ctx.command("recipes"),
      },
      { kind: "separator", id: "sep-export" },
      {
        id: "export-csv",
        label: "Exporter le résultat en CSV",
        icon: FileDown,
        run: () => ctx.command("export-csv"),
      },
      {
        id: "export-xlsx",
        label: "Exporter le résultat en Excel",
        icon: FileSpreadsheet,
        run: () => ctx.command("export-xlsx"),
      },
      { kind: "separator", id: "sep-close" },
      {
        id: "close",
        label: "Fermer",
        icon: X,
        danger: true,
        run: () => ctx.closeWindow(),
      },
    ],
  },
  {
    id: "pipeline",
    label: "Pipeline",
    items: [
      {
        id: "run",
        label: "Exécuter le pipeline",
        icon: Play,
        run: () => ctx.command("run"),
      },
      {
        id: "reset",
        label: "Réinitialiser l'exécution",
        icon: RotateCcw,
        run: () => ctx.command("reset"),
      },
      { kind: "separator", id: "sep-steps" },
      {
        id: "add-step",
        label: "Ajouter une étape",
        icon: ListPlus,
        run: () => ctx.command("add-step"),
      },
      {
        id: "profile-source",
        label: "Profiler la source",
        icon: TableProperties,
        run: () => ctx.command("profile"),
      },
      {
        id: "copy-sql",
        label: "Copier le SQL généré",
        icon: Copy,
        run: () => ctx.command("copy-sql"),
      },
      { kind: "separator", id: "sep-related" },
      {
        id: "open-lineage",
        label: "Voir la traçabilité",
        icon: Network,
        run: () => ctx.openApp("lineage"),
      },
      {
        id: "ask-moudir",
        label: "Demander à Moudir une transformation",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            "Propose un pipeline de transformation SQL (filtres, agrégations, dérivations) adapté au jeu de données courant et explique chaque étape.",
          ),
      },
    ],
  },
  {
    id: "help",
    label: "Aide",
    items: [
      {
        id: "explain-transform",
        label: "Comprendre les transformations",
        icon: Sparkles,
        run: () =>
          ctx.askMoudir(
            "Explique en termes simples comment construire un pipeline de transformation de données : étapes (filtre, sélection, dérivation, agrégation, jointure, pivot), aperçu, profil des colonnes et export du résultat.",
          ),
      },
    ],
  },
];
