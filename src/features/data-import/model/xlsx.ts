import ExcelJS from "exceljs";

export async function parseXLSXRows(
  buffer: ArrayBuffer,
): Promise<Record<string, unknown>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  const data: Record<string, unknown>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rowData: Record<string, unknown> = {};
    row.eachCell((cell, colNumber) => {
      const header = worksheet.getRow(1).getCell(colNumber).value as string;
      rowData[header] = cell.value;
    });
    data.push(rowData);
  });
  return data;
}
