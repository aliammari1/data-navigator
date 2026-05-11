import { mean, standardDeviation, zScore } from "simple-statistics";
import { fmtAmount, fmtN, fmtPct } from "@/features/telecom/lib/format";
import type {
  AIInsight,
  CanalSummary,
  HourlyRow,
  KPISummary,
  StatusRow,
} from "@/features/telecom/types";

// ─── Hourly anomaly detection ─────────────────────────────────────────────────

/** Z-score anomaly detection on hourly volumes. Returns hours flagged as anomalous. */
export function detectHourlyAnomalies(
  hourly: HourlyRow[],
): Array<{ hour: number; zScore: number; type: "spike" | "drop" }> {
  if (hourly.length < 4) return [];
  const vals = hourly.map((r) => r.total);
  const mu = mean(vals);
  const sigma = standardDeviation(vals);
  if (sigma === 0) return [];
  return hourly
    .map((r) => ({
      hour: r.hour,
      zScore: zScore(r.total, mu, sigma),
      type: r.total > mu ? "spike" : ("drop" as "spike" | "drop"),
    }))
    .filter((r) => Math.abs(r.zScore) > 1.8)
    .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
    .slice(0, 5);
}

// ─── Canal risk score ─────────────────────────────────────────────────────────

/** Composite risk score 0–100 per canal. Higher = more risk. */
export function computeCanalRiskScore(c: CanalSummary): number {
  const failPenalty = (100 - c.successRate) * 0.5; // up to 50 pts
  const revPenalty = Math.min((c.refund / Math.max(c.total, 1)) * 100 * 2, 20); // up to 20 pts
  const pendPenalty = Math.min(
    (c.instance / Math.max(c.total, 1)) * 100 * 1.5,
    15,
  ); // up to 15
  const concentrationBonus = c.share > 40 ? (c.share - 40) * 0.3 : 0; // up to 15 pts extra
  return Math.min(
    Math.round(failPenalty + revPenalty + pendPenalty + concentrationBonus),
    100,
  );
}

// ─── Linear regression ────────────────────────────────────────────────────────

/** Simple linear regression — returns slope & intercept for array of (x, y) pairs. */
export function linearRegression(pts: Array<[number, number]>): {
  slope: number;
  intercept: number;
} {
  const n = pts.length;
  if (n < 2) return { slope: 0, intercept: pts[0]?.[1] ?? 0 };
  const sumX = pts.reduce((s, [x]) => s + x, 0);
  const sumY = pts.reduce((s, [, y]) => s + y, 0);
  const sumXY = pts.reduce((s, [x, y]) => s + x * y, 0);
  const sumXX = pts.reduce((s, [x]) => s + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

// ─── Executive narrative ──────────────────────────────────────────────────────

/** Generate an executive narrative paragraph from KPI + canal data. */
export function generateNarrative(
  kpi: KPISummary,
  canals: CanalSummary[],
  hourly: HourlyRow[],
  reportDate: string,
): string {
  const date = reportDate || "today";
  const best = [...canals].sort((a, b) => b.successRate - a.successRate)[0];
  const worst = [...canals]
    .filter((c) => c.total > 50)
    .sort((a, b) => a.successRate - b.successRate)[0];
  const peakH = [...hourly].sort((a, b) => b.total - a.total)[0];
  const topRev = [...canals].sort((a, b) => b.amount - a.amount)[0];

  const healthWord =
    kpi.successRate >= 97
      ? "excellente"
      : kpi.successRate >= 90
        ? "bonne"
        : kpi.successRate >= 80
          ? "modérée"
          : "mauvaise";

  const lines: string[] = [];

  lines.push(
    `Le ${date}, la plateforme a traité ${fmtN(kpi.totalTransactions)} transactions avec une santé ${healthWord} (${fmtPct(kpi.successRate)} taux de réussite, ${fmtAmount(kpi.totalAmount)} TND volume total).`,
  );

  if (best && worst && best.key !== worst.key) {
    lines.push(
      `${best.label} a mené la performance à ${fmtPct(best.successRate)} de réussite, tandis que ${worst.label} était le plus faible à ${fmtPct(worst.successRate)} et nécessite une attention particulière.`,
    );
  }

  if (peakH) {
    lines.push(
      `L'activité maximale a eu lieu à ${peakH.hour.toString().padStart(2, "0")}:00 avec ${fmtN(peakH.total)} transactions (${fmtPct((peakH.total / kpi.totalTransactions) * 100)} du volume journalier).`,
    );
  }

  if (topRev) {
    lines.push(
      `Le revenu a été mené par ${topRev.label} contribuant ${fmtAmount(topRev.amount)} TND (${fmtPct(topRev.share)} du total).`,
    );
  }

  if (kpi.declinedCount > 0) {
    lines.push(
      `${fmtN(kpi.declinedCount)} transactions refusées${kpi.topErrorCode && kpi.topErrorCode !== "N/A" ? `, le plus souvent en raison du code d'erreur "${kpi.topErrorCode}"` : ""}.`,
    );
  }

  if (kpi.instanceCount > 0) {
    lines.push(
      `${fmtN(kpi.instanceCount)} transactions restent en état d'instance et pourraient nécessiter un suivi.`,
    );
  }

  return lines.join(" ");
}

// ─── AI Insights Engine ───────────────────────────────────────────────────────
// Pure deterministic function — no LLM, instant results from already-computed data.

export function computeAIInsights(
  kpi: KPISummary,
  canals: CanalSummary[],
  hourly: HourlyRow[],
  statusData: StatusRow[],
): AIInsight[] {
  const list: AIInsight[] = [];
  const t = kpi.totalTransactions;
  if (t === 0) return [];

  const statusTotal = statusData.reduce((sum, s) => sum + s.count, 0);
  const statusGap = Math.abs(statusTotal - t);
  if (statusGap > Math.max(5, t * 0.005)) {
    list.push({
      id: "status_sync_gap",
      severity: "critical",
      title: "Désynchronisation Détectée entre KPIs et Statuts",
      body: `Les statuts totalisent ${fmtN(statusTotal)} transactions alors que le KPI global affiche ${fmtN(t)}. Vérifiez le mapping des codes statut avant d'exporter ou de partager ce rapport.`,
      metric: `${fmtN(statusGap)} tx d'écart`,
    });
  }

  const classifiedSuccess = canals.reduce((sum, c) => sum + c.success, 0);
  const unclassifiedSuccess = Math.max(0, kpi.successCount - classifiedSuccess);
  if (kpi.successCount > 0 && classifiedSuccess === 0) {
    list.push({
      id: "no_spec_channel_match",
      severity: "critical",
      title:
        "Aucune transaction réussie classée dans les canaux du cahier des charges",
      body: `${fmtN(kpi.successCount)} transactions sont en statut Réussie, mais aucune ne correspond aux règles Brand_D, ACCOUNT_LAYER_ID, ACCOUNT_GROUP_ID ou ACCOUNT_MSISDN. Vérifiez le fichier chargé et le mappage des colonnes avant toute analyse canal.`,
      metric: "0 canal actif",
    });
  } else if (unclassifiedSuccess > Math.max(20, kpi.successCount * 0.02)) {
    list.push({
      id: "unclassified_success",
      severity: "warning",
      title: "Transactions réussies hors règles de canaux",
      body: `${fmtN(unclassifiedSuccess)} transactions réussies ne sont pas couvertes par les canaux définis dans le document. Cela peut indiquer un nouveau Brand_D, un canal oublié ou une colonne mal importée.`,
      metric: `${fmtPct((unclassifiedSuccess / kpi.successCount) * 100)} non classé`,
    });
  }

  // 1 — Overall health
  if (kpi.successRate >= 97) {
    list.push({
      id: "health_ok",
      severity: "positive",
      title: "Santé Système Exceptionnelle",
      body: `${fmtPct(kpi.successRate)} taux de réussite sur ${fmtN(t)} transactions. Seulement ${fmtN(kpi.declinedCount)} échecs enregistrés — le système fonctionne à pleine capacité.`,
      metric: fmtPct(kpi.successRate),
    });
  } else if (kpi.successRate < 80) {
    list.push({
      id: "health_crit",
      severity: "critical",
      title: "Taux d'Échec Critique — Action Immédiate Requise",
      body: `${fmtPct(100 - kpi.successRate)} de toutes les transactions ont échoué aujourd'hui. ${fmtN(kpi.declinedCount)} sur ${fmtN(t)} transactions nécessitent une investigation. Ceci dépasse largement le seuil d'alerte de 10%.`,
      metric: `${fmtPct(100 - kpi.successRate)} taux d'échec`,
    });
  } else if (kpi.successRate < 90) {
    list.push({
      id: "health_warn",
      severity: "warning",
      title: "Taux de Réussite Inférieur à l'Objectif de 90%",
      body: `Le taux actuel est de ${fmtPct(kpi.successRate)} contre un seuil de 90%. ${fmtN(kpi.declinedCount)} transactions échouées réduisent la fiabilité de la plateforme.`,
      metric: fmtPct(kpi.successRate),
    });
  }

  // 2 — Canal performance outlier (worst)
  const significantCanals = canals.filter((c) => c.total > 100);
  if (significantCanals.length > 0) {
    const worst = significantCanals.reduce((b, c) =>
      c.successRate < b.successRate ? c : b,
    );
    const gap = kpi.successRate - worst.successRate;
    if (gap > 8 || worst.successRate < 90) {
      list.push({
        id: "canal_worst",
        severity: worst.successRate < 80 ? "critical" : "warning",
        title: `${worst.label} Sous-Performant — ${gap.toFixed(1)}pp Sous la Moyenne`,
        body: `${fmtPct(worst.successRate)} taux de réussite vs. ${fmtPct(kpi.successRate)} global. ${fmtN(worst.declined)} échecs sur ${fmtN(worst.total)} transactions tirent les métriques du système vers le bas.`,
        metric: fmtPct(worst.successRate),
      });
    }

    if (kpi.declinedCount > 0) {
      const failLeader = [...significantCanals].sort(
        (a, b) => b.declined - a.declined,
      )[0];
      if (failLeader && failLeader.declined > 0) {
        const failShare = (failLeader.declined / kpi.declinedCount) * 100;
        const failRate =
          failLeader.total > 0
            ? (failLeader.declined / failLeader.total) * 100
            : 0;
        if (failShare > 35 && failLeader.declined >= 50) {
          list.push({
            id: "failure_concentration",
            severity: failShare > 60 ? "critical" : "warning",
            title: `${failLeader.label} concentre ${fmtPct(failShare)} des échecs`,
            body: `${fmtN(failLeader.declined)} échecs proviennent de ce canal, avec ${fmtPct(failRate)} d'échec interne. Traitez ce canal en priorité avant d'élargir l'investigation au reste de la plateforme.`,
            metric: `${fmtPct(failShare)} des échecs`,
          });
        }
      }
    }
  }

  // 4 — Peak hour traffic concentration
  const sortedByTotal = [...hourly].sort((a, b) => b.total - a.total);
  const peak = sortedByTotal[0];
  if (peak && peak.total > 0) {
    const share = (peak.total / t) * 100;
    const peakFailRate =
      peak.total > 0 ? (peak.declined / peak.total) * 100 : 0;
    if (share > 15) {
      list.push({
        id: "peak_hour",
        severity: peakFailRate > 10 ? "warning" : "info",
        title: `Risque de Goulot de Trafic à ${peak.hour.toString().padStart(2, "0")}:00`,
        body: `${fmtPct(share)} du trafic journalier total (${fmtN(peak.total)} tx) concentré en une heure. Taux d'échec au pic : ${fmtPct(peakFailRate)}. Revue de planification de capacité recommandée.`,
        metric: `${peak.hour.toString().padStart(2, "0")}:00 — ${fmtPct(share)} du trafic`,
      });
    }
  }

  // 7 — Reversal anomaly
  if (kpi.refundCount > 0) {
    const revShare = (kpi.refundCount / t) * 100;
    if (revShare > 2) {
      list.push({
        id: "reversal",
        severity: "warning",
        title: "Taux de Remboursement Supérieur au Seuil de 2%",
        body: `${fmtN(kpi.refundCount)} transactions remboursées aujourd'hui (${fmtPct(revShare)}). Un taux de remboursement élevé indique souvent des problèmes de règlement en aval ou des litiges clients.`,
        metric: fmtPct(revShare),
      });
    }
  }

  // 8 — Instance backlog
  if (kpi.instanceCount > 0) {
    const pendShare = (kpi.instanceCount / t) * 100;
    if (pendShare > 5) {
      list.push({
        id: "instance",
        severity: "warning",
        title: "Retard Significatif de Transactions en Instance Détecté",
        body: `${fmtN(kpi.instanceCount)} transactions (${fmtPct(pendShare)}) restent en état INSTANCE. Si elles ne sont pas résolues, elles pourraient se transformer en échecs ou nécessiter une intervention manuelle.`,
        metric: fmtN(kpi.instanceCount),
      });
    }
  }

  // 10 — Status coverage (unmapped codes normalized into OTHER)
  const otherStatus = statusData.find((s) => s.status === "OTHER");
  if (otherStatus && otherStatus.count > 0) {
    const otherShare = (otherStatus.count / t) * 100;
    list.push({
      id: "status_diversity",
      severity: otherShare > 2 ? "warning" : "info",
      title: "Codes Statut Non Mappés Regroupés en OTHER",
      body: `${fmtN(otherStatus.count)} transactions (${fmtPct(otherShare)}) ne correspondent pas encore à une catégorie métier. Ouvrez Config. Statuts pour les classer et synchroniser tous les graphiques.`,
      metric: `${fmtPct(otherShare)} OTHER`,
    });
  }

  const unresolved = kpi.instanceCount + kpi.submittedCount;
  if (unresolved > 0) {
    const unresolvedShare = (unresolved / t) * 100;
    if (unresolvedShare > 8) {
      list.push({
        id: "unresolved_backlog",
        severity: unresolvedShare > 15 ? "critical" : "warning",
        title: "Backlog Opérationnel à Suivre",
        body: `${fmtN(unresolved)} transactions sont encore en Instance ou Confirmé (${fmtPct(unresolvedShare)} du volume). Priorisez les files de règlement avant qu'elles ne deviennent des échecs définitifs.`,
        metric: `${fmtPct(unresolvedShare)} non finalisé`,
      });
    }
  }

  const anomalies = detectHourlyAnomalies(hourly).filter(
    (a) => Math.abs(a.zScore) >= 2,
  );
  if (anomalies.length > 0) {
    const strongest = anomalies.sort(
      (a, b) => Math.abs(b.zScore) - Math.abs(a.zScore),
    )[0];
    list.push({
      id: "hourly_anomaly",
      severity: Math.abs(strongest.zScore) >= 3 ? "warning" : "info",
      title: `Anomalie Horaire ${strongest.type === "spike" ? "de Pic" : "de Chute"} à ${String(strongest.hour).padStart(2, "0")}:00`,
      body: `Le trafic s'écarte de ${strongest.zScore.toFixed(1)} écarts-types du profil journalier. Comparez cette heure avec les erreurs, canaux et opérateurs dominants avant de conclure à une saisonnalité normale.`,
      metric: `z=${strongest.zScore.toFixed(1)}`,
    });
  }

  // Sort: critical → warning → info → positive
  const severityWeight = { critical: 0, warning: 1, info: 2, positive: 3 };
  return list
    .sort((a, b) => severityWeight[a.severity] - severityWeight[b.severity])
    .slice(0, 8);
}
