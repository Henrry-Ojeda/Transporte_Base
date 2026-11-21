/**
 * Exportación a Excel con carga dinámica de XLSX para no inflar el bundle inicial.
 */
export async function exportToExcel<T extends Record<string, any>>(
  rows: T[],
  fileName: string,
  sheetName = 'Datos'
): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const cleanName = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(wb, cleanName);
}
