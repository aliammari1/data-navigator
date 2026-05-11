/**
 * Convert an xlsx/xls File to a pipe-delimited CSV string.
 * Uses ExcelJS — reads the first worksheet.
 * Each cell value is stringified and any embedded pipes are replaced with spaces.
 */
export async function xlsxToPipeCSV(file: File): Promise<string> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await wb.xlsx.load(buffer);

  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("Le fichier Excel ne contient aucune feuille.");

  const rows: string[] = [];

  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      let val = "";
      if (cell.value === null || cell.value === undefined) {
        val = "";
      } else if (typeof cell.value === "object" && "result" in cell.value) {
        // formula cell — use computed result
        val = String((cell.value as { result: unknown }).result ?? "");
      } else if (typeof cell.value === "object" && cell.value instanceof Date) {
        val = cell.value.toISOString().slice(0, 19).replace("T", " ");
      } else {
        val = String(cell.value);
      }
      // escape embedded pipe characters
      cells.push(val.replace(/\|/g, " "));
    });
    rows.push(cells.join("|"));
  });

  return rows.join("\n");
}

export function isExcelFile(file: File): boolean {
  // Check extension first — Windows reports .csv as application/vnd.ms-excel,
  // so a .csv extension must never be treated as Excel regardless of MIME type.
  if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) return false;
  return (
    file.name.endsWith(".xlsx") ||
    file.name.endsWith(".xls") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel"
  );
}
