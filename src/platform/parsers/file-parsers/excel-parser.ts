import ExcelJS from "exceljs";
import type { ParsedData } from "@/core/types/file";

export async function parseExcel(buffer: ArrayBuffer): Promise<ParsedData> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const firstSheet = workbook.worksheets[0];
  const rows: Record<string, unknown>[] = [];
  firstSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header row
    const rowData: Record<string, unknown> = {};
    row.eachCell((cell, colNumber) => {
      const header = firstSheet.getRow(1).getCell(colNumber).value as string;
      rowData[header] = cell.value;
    });
    rows.push(rowData);
  });
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return {
    id: crypto.randomUUID(),
    fileId: "",
    columns,
    rows,
  };
}
