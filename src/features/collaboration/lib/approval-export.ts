import type { ApprovalRecord } from "@/platform/collab";

export function downloadApprovalRecord(record: ApprovalRecord): void {
  const safeId = record.reportId.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "report";
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeId}-approval.json`;
  try {
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
