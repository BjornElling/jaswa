/* Local file reads and downloads. Nothing here leaves the computer. */
import { isPreferencesDocument, readPreferences } from '../ingest/preferences';
import type { Preferences } from '../domain/model';

export async function fileToText(file: File): Promise<string> {
  return file.text();
}

export async function importPreferencesFile(file: File): Promise<Preferences> {
  const value = JSON.parse(await fileToText(file)) as unknown;
  if (!isPreferencesDocument(value)) throw new Error('Invalid JASWA preferences file');
  return { ...readPreferences(value, null), updatedAt: new Date().toISOString() };
}

export function downloadJson(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
