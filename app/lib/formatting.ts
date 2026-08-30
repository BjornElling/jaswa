import type { GeneralSettings } from './types';
import { formattingHour12, formattingLocale, formattingTimeZone } from './regional-settings';

export function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/* An unparseable timestamp makes Intl throw a RangeError. Stored import data
   is user-editable, so one bad date must degrade to one line of copy rather
   than take down the workspace. */
export function formatDateTime(value: string | undefined, settings: GeneralSettings): string {
  if (!value) return 'Never';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'an unknown time';
  return new Intl.DateTimeFormat(formattingLocale(settings), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: formattingTimeZone(settings),
    hour12: formattingHour12(settings),
  }).format(parsed);
}

export function formatNumber(value: number | null, settings: GeneralSettings): string {
  return value === null ? '—' : value.toLocaleString(formattingLocale(settings));
}

export function downloadJson(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
