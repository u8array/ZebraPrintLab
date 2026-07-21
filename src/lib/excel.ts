import type { DatasetInput } from '@zplab/core/types/DataSource';
import type { DbRows } from './db';

export async function excelListSheets(path: string): Promise<string[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string[]>('excel_list_sheets', { path });
}

/** Fetch a worksheet as the store's dataset shape, stamping the excel source. */
export async function excelFetchDataset(
  path: string,
  filename: string,
  sheet: string,
): Promise<DatasetInput> {
  const { invoke } = await import('@tauri-apps/api/core');
  const result = await invoke<DbRows>('excel_fetch', { path, sheet });
  return {
    headers: result.headers,
    rows: result.rows,
    source: {
      kind: 'excel',
      filename,
      sheet,
      importedAt: new Date().toISOString(),
      rowCount: result.rows.length,
      truncated: result.truncated,
    },
  };
}
