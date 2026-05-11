import type { VersionEntry } from "./types";

// ─── Demo data generator ───────────────────────────────────────────────────

export function generateVersionHistory(): VersionEntry[] {
  const authors = [
    { name: "Alice Chen", email: "alice@corp.com" },
    { name: "Bob Kim", email: "bob@corp.com" },
    { name: "Carol Singh", email: "carol@corp.com" },
    { name: "Dave Lopez", email: "dave@corp.com" },
  ];
  const messages = [
    ["Initial data import from ERP", "create"],
    ["Add null value imputation for revenue column", "update"],
    ["Schema change: add profit_margin column", "schema"],
    [
      "Filter out test accounts (is_premium=false, status='inactive')",
      "transform",
    ],
    ["Merge with Q3 customer segment data", "merge"],
    ["Fix encoding issues in email column", "update"],
    ["Remove duplicate rows (dedup on order_id)", "transform"],
    ["Add country normalization lookup", "update"],
    ["Restore to v1.4 — Q4 data was corrupted", "restore"],
    ["Schema change: rename 'amt' → 'revenue'", "schema"],
    ["Update: refresh from latest ERP export", "update"],
    ["Transform: derive revenue_tier column", "transform"],
    ["Merge upstream fix for department mapping", "merge"],
    ["Add satisfaction_score from survey API", "schema"],
    ["Current version — production snapshot", "update"],
  ] as const;

  const now = Date.now();
  let rowCount = 5000;
  let colCount = 8;

  return messages
    .map((msg, i): VersionEntry => {
      const [message, type] = msg;
      const a = authors[i % authors.length];
      const daysAgo =
        (messages.length - i - 1) * 3 + Math.floor(Math.random() * 2);
      const ts = new Date(
        now - daysAgo * 86400000 - Math.floor(Math.random() * 3600000),
      );

      const added =
        type === "create" ? rowCount : Math.floor(Math.random() * 500);
      const modified = type === "create" ? 0 : Math.floor(Math.random() * 200);
      const deleted = Math.floor(Math.random() * 50);
      const schemaDelta =
        type === "schema" ? Math.floor(Math.random() * 3) + 1 : 0;

      if (type === "create") rowCount = 5000;
      else if (type !== "restore")
        rowCount = Math.max(100, rowCount + added - deleted);
      if (type === "schema") colCount = Math.min(20, colCount + schemaDelta);
      if (type === "restore") {
        rowCount = 4800;
        colCount = 10;
      }

      const isCurrent = i === messages.length - 1;
      const major = Math.floor(i / 5) + 1;
      const minor = i % 5;

      return {
        id: `v${i + 1}`,
        version: `${major}.${minor}`,
        timestamp: ts,
        author: a.name,
        email: a.email,
        message,
        type: type as VersionEntry["type"],
        changes: { added, modified, deleted, schema: schemaDelta },
        rowCount,
        colCount,
        fileSize: rowCount * colCount * 12 + Math.floor(Math.random() * 50000),
        tags: isCurrent
          ? ["production", "latest"]
          : i === 8
            ? ["checkpoint"]
            : [],
        isCurrent,
        parentId: i > 0 ? `v${i}` : undefined,
        branch: i >= 8 && i < 11 ? "hotfix/q4-fix" : "main",
        hash: Math.random().toString(36).substring(2, 10),
        stats: {
          avgRevenue: 250 + Math.random() * 150,
          totalRevenue: rowCount * (250 + Math.random() * 150),
          rowsWithNulls: Math.floor(rowCount * Math.random() * 0.05),
        },
      };
    })
    .reverse();
}
