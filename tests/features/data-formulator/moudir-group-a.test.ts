import { describe, expect, it, vi } from "vitest";
import { useMoudirChatStore, type ActiveFilter, type ChatMessage } from "@/features/data-formulator/store/moudir-chat-store";
import { generateExecutivePresentation } from "@/features/data-formulator/core/presentation/deck-generator";

// Marp Core is used natively for presentation generation

describe("Group A: Active Visual Filter Breadcrumbs State", () => {
  it("initializes with empty activeFilters", () => {
    useMoudirChatStore.setState({ activeFilters: [] });
    expect(useMoudirChatStore.getState().activeFilters).toEqual([]);
  });

  it("adds filters and updates them by field", () => {
    useMoudirChatStore.setState({ activeFilters: [] });
    const { addFilter } = useMoudirChatStore.getState();

    addFilter({ field: "categorie", value: "Électronique" });
    expect(useMoudirChatStore.getState().activeFilters).toEqual([
      { field: "categorie", value: "Électronique" },
    ]);

    addFilter({ field: "mois", value: "Mars" });
    expect(useMoudirChatStore.getState().activeFilters).toHaveLength(2);

    // Updating existing field replaces value
    addFilter({ field: "categorie", value: "Informatique" });
    const filters = useMoudirChatStore.getState().activeFilters;
    expect(filters).toHaveLength(2);
    expect(filters.find((f) => f.field === "categorie")?.value).toBe("Informatique");
  });

  it("removes a filter by field", () => {
    useMoudirChatStore.setState({
      activeFilters: [
        { field: "cat", value: "A" },
        { field: "year", value: 2026 },
      ],
    });

    useMoudirChatStore.getState().removeFilter("cat");
    expect(useMoudirChatStore.getState().activeFilters).toEqual([{ field: "year", value: 2026 }]);
  });

  it("clears all filters", () => {
    useMoudirChatStore.setState({
      activeFilters: [
        { field: "a", value: 1 },
        { field: "b", value: 2 },
      ],
    });

    useMoudirChatStore.getState().clearFilters();
    expect(useMoudirChatStore.getState().activeFilters).toEqual([]);
  });
});

describe("Group A: Executive Presentation Deck Generator", () => {
  it("generates an executive deck with 16:9 widescreen layout and pyramid principle via Marp Core", async () => {
    const messages: ChatMessage[] = [
      {
        id: "msg-1",
        role: "user",
        content: "Donne-moi l'analyse des ventes 2026",
        parts: [],
        status: "done",
        createdAt: Date.now(),
      },
      {
        id: "msg-2",
        role: "assistant",
        content: "Le chiffre d'affaires s'élève à 1 250 000 € avec 3 400 commandes.",
        parts: [
          {
            kind: "chart",
            chartType: "bar",
            x: "mois",
            y: "montant",
            aggregate: "sum",
            title: "Évolution Mensuelle des Ventes",
            datasetId: "ds-1",
          },
        ],
        status: "done",
        createdAt: Date.now(),
      },
    ];

    const result = await generateExecutivePresentation(messages, {
      title: "Revue Stratégique Q1 2026",
      datasetName: "ventes_globales",
      rowCount: 45000,
      download: false,
    });

    // Verify Marp 16:9 layout directives
    expect(result.markdown).toContain("marp: true");
    expect(result.markdown).toContain("size: 16:9");

    // Verify Pyramid Principle slides (Cover, Summary, Chart Deep-dive, Recommendations)
    expect(result.markdown).toContain("Revue Stratégique Q1 2026");
    expect(result.markdown).toContain("SYNTHÈSE EXÉCUTIVE");
    expect(result.markdown).toContain("Évolution Mensuelle des Ventes");
    expect(result.markdown).toContain("PLAN D'ACTION & RECOMMANDATIONS");

    // Verify rendered output
    expect(result.html).toContain("marpit");
    expect(result.fileName).toContain("Revue_Stratégique_Q1_2026");
  });
});
