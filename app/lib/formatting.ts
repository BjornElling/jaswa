import type { GeneralSettings } from './types';
import { dateLocale, formattingHour12, formattingTimeZone, numberLocale } from './regional-settings';

export function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/* The game's craft inventory groups identical gems and grindstones on one
   record. Its `amount` is therefore the inventory total a player sees, while
   the array length is only the number of different stacks. */
export function craftItemCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  let total = 0;
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const amount = (item as Record<string, unknown>).amount;
    if (typeof amount !== 'number' || !Number.isSafeInteger(amount) || amount < 0) continue;
    total += amount;
  }
  return total;
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

/** A day without its hour, guarded as `formatDateTime` is and for its reasons. */
export function formatDate(value: string | undefined, settings: GeneralSettings): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(dateLocale(settings), { dateStyle: 'medium', timeZone: formattingTimeZone(settings) }).format(parsed);
  } catch {
    try {
      return new Intl.DateTimeFormat(dateLocale(settings), { dateStyle: 'medium' }).format(parsed);
    } catch {
      return '—';
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

/**
 * A figure with a fixed number of decimals, in the user's own notation.
 *
 * Fixed rather than trimmed: a column of scores where `72.4` sits above `72`
 * changes width as the rows change, which is the movement rule 2 forbids of
 * anything that varies. The guards are `formatNumber`'s, for its reasons.
 */
export function formatDecimal(value: number | null, settings: GeneralSettings, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  try {
    return value.toLocaleString(numberLocale(settings), {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    });
  } catch {
    return value.toFixed(digits);
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
