import type { GeneralSettings } from './types';
import { dateLocale, formattingHour12, formattingTimeZone, numberLocale } from './regional-settings';

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
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: formattingHour12(settings),
  };
  const zone = formattingTimeZone(settings);
  try {
    return new Intl.DateTimeFormat(dateLocale(settings), { ...options, timeZone: zone }).format(parsed);
  } catch {
    /* The zone is the one part of this that a hand-edited .sw file can make
       unusable — a name valid in the browser that wrote the file need not
       exist in the one reading it. The time is still worth showing, so it is
       written in the computer's own zone rather than lost with the setting. */
    try {
      return new Intl.DateTimeFormat(dateLocale(settings), options).format(parsed);
    } catch {
      return 'an unknown time';
    }
  }
}

export function formatNumber(value: number | null, settings: GeneralSettings): string {
  /* NaN and Infinity read as "NaN" and "∞" on screen, which tell the user
     nothing and are the shape of a bug rather than of a figure. They mean the
     same thing to a reader as a value that was never set, so they are shown
     the same way. */
  if (value === null || !Number.isFinite(value)) return '—';
  /* Guarded for the same reason the date is: a formatter is being handed a
     locale, and nothing on the page is worth a blank workspace. */
  try {
    return value.toLocaleString(numberLocale(settings));
  } catch {
    return String(value);
  }
}

export function downloadJson(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
