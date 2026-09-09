import type * as Types from "@/features/telecom/types";

export function buildKpiCsv(rows: Array<[string, string | number]>): string {
  const body = rows.map(([key, value]) => `"${key}","${value}"`).join("\n");
  return `"Métrique","Valeur"\n${body}`;
}

export function buildCanalCsv(canals: Types.CanalSummary[]): string {
  const header =
    "Canal,Total,Réussie,Échec,Instance,Annulation,Confirmé,TauxRéussite%,MontantTotal_TND,MontantMoyen_TND,Part%";
  const body = canals
    .map(
      (canal) =>
        `"${canal.label}",${canal.total},${canal.success},${canal.declined},${canal.instance},${canal.refund},${canal.submitted},${canal.successRate.toFixed(2)},${canal.amount.toFixed(3)},${canal.avgAmount.toFixed(3)},${canal.share.toFixed(2)}`,
    )
    .join("\n");
  return `${header}\n${body}`;
}
