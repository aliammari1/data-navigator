import { describe, expect, it, vi } from "vitest";
import {
  type DeckExportOptions,
  generateExecutivePresentation,
} from "@/features/data-formulator/core/presentation/deck-generator";
import type { ChatMessage } from "@/features/data-formulator/store/moudir-chat-store";

function assistantMessage(content: string, parts: ChatMessage["parts"] = []): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    content,
    parts,
    status: "done",
    createdAt: Date.now(),
  };
}

const baseOptions: DeckExportOptions = {
  title: "Rapport Test",
  datasetName: "ventes",
  rowCount: 1200,
  download: false,
};

describe("generateExecutivePresentation", () => {
  it("extracts long bullets as takeaways instead of defaults", async () => {
    const content = [
      "- La croissance du chiffre d'affaires dépasse les objectifs du trimestre actuel",
      "- Le segment nord concentre la majorité des nouvelles souscriptions actives",
      "* La rétention des clients existants reste le principal levier de marge",
    ].join("\n");
    const deck = await generateExecutivePresentation([assistantMessage(content)], baseOptions);
    expect(deck.markdown).toContain("croissance du chiffre");
    expect(deck.markdown).not.toContain("Les volumes de données sont consolidés");
    expect(deck.fileName).toMatch(/^Rapport_Test_.*\.html$/);
  });

  it("falls back to default takeaways when too few bullets", async () => {
    const deck = await generateExecutivePresentation(
      [assistantMessage("Bonjour, voici un résumé court.")],
      baseOptions,
    );
    expect(deck.markdown).toContain("Les volumes de données sont consolidés");
  });

  it("renders a data table for charts with rows and no image", async () => {
    const deck = await generateExecutivePresentation(
      [
        assistantMessage("Voici le graphique.", [
          {
            kind: "chart",
            chartType: "bar",
            x: "region",
            y: "montant",
            aggregate: "sum",
            title: "Ventes par région",
            datasetId: null,
            rows: [
              { region: "Nord", montant: 1200 },
              { region: "Sud", montant: 800 },
            ],
          },
        ]),
      ],
      baseOptions,
    );
    expect(deck.markdown).toContain("Données clés extraites");
    expect(deck.markdown).toContain("Nord");
    expect(deck.html).toContain("Ventes par région");
  });

  it("renders a placeholder for charts with neither image nor rows", async () => {
    const deck = await generateExecutivePresentation(
      [
        assistantMessage("Graphique vide.", [
          {
            kind: "chart",
            chartType: "line",
            x: "mois",
            y: "total",
            aggregate: "sum",
            title: "Vide",
            datasetId: null,
          },
        ]),
      ],
      baseOptions,
    );
    expect(deck.markdown).toContain("GRAPHIQUE");
  });

  it("embeds provided chart images instead of data tables", async () => {
    const deck = await generateExecutivePresentation(
      [
        assistantMessage("Voici le graphique.", [
          {
            kind: "chart",
            chartType: "bar",
            x: "region",
            y: "montant",
            aggregate: "sum",
            title: "Ventes par région",
            datasetId: null,
            rows: [{ region: "Nord", montant: 5 }],
          },
        ]),
      ],
      {
        ...baseOptions,
        chartImages: new Map([["Ventes par région", "data:image/png;base64,AAA"]]),
      },
    );
    expect(deck.markdown).toContain("data:image/png;base64,AAA");
    expect(deck.markdown).not.toContain("Données clés extraites");
  });

  it("handles minimal options, untitled charts, and string cells", async () => {
    const deck = await generateExecutivePresentation(
      [
        {
          ...assistantMessage(
            "- ok\n- Short\n- La performance trimestrielle dépasse nettement les prévisions initiales",
            [
              {
                kind: "chart",
                chartType: "pie",
                x: "segment",
                y: "part",
                aggregate: "",
                title: "",
                datasetId: null,
                rows: [{ segment: "A", part: "beaucoup" }],
              },
            ],
          ),
        },
        {
          ...assistantMessage("outil", [
            {
              kind: "tool",
              name: "run_sql",
              sql: "SELECT 1",
            } as unknown as ChatMessage["parts"][number],
          ]),
        },
      ],
      {} as DeckExportOptions,
    );
    expect(deck.markdown).toContain("Distribution :");
    expect(deck.markdown).toContain("beaucoup");
    expect(deck.markdown).toContain("REQUÊTES DUCKDB");
    expect(deck.fileName).toMatch(/^Rapport_Executif_.*\.html$/);
  });

  it("attempts a browser download by default without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const createElement = vi.spyOn(document, "createElement");
    try {
      const deck = await generateExecutivePresentation([assistantMessage("Résumé.")], {
        title: "DL",
      });
      expect(deck.markdown).toContain("DL");
      expect(createElement).toHaveBeenCalledWith("a");

      // A DOM failure mid-dispatch is swallowed as a warning, never thrown.
      createElement.mockImplementationOnce(() => {
        throw new Error("no dom");
      });
      const retry = await generateExecutivePresentation([assistantMessage("Résumé.")], {
        title: "DL",
      });
      expect(retry.markdown).toContain("DL");
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("[deck-generator]"),
        expect.anything(),
      );
    } finally {
      warn.mockRestore();
      createElement.mockRestore();
    }
  });
});
