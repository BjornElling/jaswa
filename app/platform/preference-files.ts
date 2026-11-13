import { isPreferencesDocument, readPreferences } from '../ingest/preferences';
import type { Preferences } from '../lib/types';

export async function fileToText(file: File): Promise<string> {
  return file.text();
}

export async function importPreferencesFile(file: File): Promise<Preferences> {
  const value = JSON.parse(await fileToText(file)) as unknown;
  if (!isPreferencesDocument(value)) throw new Error('Invalid JASWA preferences file');
  return { ...readPreferences(value, null), updatedAt: new Date().toISOString() };
}
