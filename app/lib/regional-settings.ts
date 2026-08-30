import type { DateOrderChoice, GeneralSettings, HourCycleChoice, NumberFormatChoice, TimeZoneChoice } from './types';

/* Every regional choice offers "follow this computer" and defaults to it,
   because the browser already knows the answer the user gave their operating
   system and repeating that question is a worse default than reading it. */
export const numberFormatChoices: NumberFormatChoice[] = ['system', 'european', 'american'];
export const dateOrderChoices: DateOrderChoice[] = ['system', 'day-first', 'month-first'];
export const hourCycleChoices: HourCycleChoice[] = ['system', 'h23', 'h12'];
export const timeZoneChoices: TimeZoneChoice[] = ['system', 'manual'];

/* Locales stand in for the conventions rather than a hand-rolled table of
   separators and field orders, which would then have to be maintained for
   currencies, percentages, month names and every other Intl consumer. None of
   these is ever shown to the user; each is chosen only for the one convention
   it carries.

   Numbers and dates take separate locales because the two questions do not
   answer each other: de-DE writes the European number but an all-numeric date,
   and the two date orders below both spell the month out. Picking one locale
   for both would have made the number format silently decide the date order. */
const europeanNumberLocale = 'de-DE';
const americanNumberLocale = 'en-US';
const dayFirstDateLocale = 'en-GB';
const monthFirstDateLocale = 'en-US';

/**
 * The IANA zone this computer is set to. Every browser JASWA targets resolves
 * one, but a locked-down or misconfigured host can report an empty string, so
 * the caller gets UTC rather than a formatter that throws on every date.
 */
export function systemTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * How far a zone runs from GMT right now, as `GMT+02:00`.
 *
 * Read from the formatter rather than worked out from a date arithmetic:
 * offsets are not all whole hours — Kolkata is +05:30 and Kathmandu +05:45 —
 * and half of them move twice a year, so the only answer that stays true is
 * the one the zone database gives for the moment being asked about.
 */
function gmtOffset(zone: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(at).find((part) => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** Sorts `GMT-11:00` before `GMT+14:00` without parsing the string twice. */
function offsetMinutes(offset: string): number {
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match) return 0;
  const size = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -size : size;
}

export type TimeZoneOption = { zone: string; label: string };

/**
 * The complete IANA list for the manual picker, each entry carrying the offset
 * it currently runs at, ordered west to east. A bare list of 418 names says
 * nothing about how far away any of them is; ordering by offset also puts the
 * zones that keep the same time next to each other, which is how someone
 * looking for "an hour ahead" actually searches.
 *
 * The offsets are those in force when the list is built. A page left open
 * across a daylight-saving change shows the previous offset until it is
 * reloaded, which is the same staleness every clock in the app already has.
 *
 * `include` is a zone that must appear whatever the browser enumerates. The
 * lists differ between engines — one offers `Asia/Kolkata` and another the
 * older `Asia/Calcutta`, and some omit `UTC` — so a .sw file written on one
 * browser can name a perfectly valid zone this one does not list. Without it
 * the select would have no option matching its own value and would render
 * blank, hiding a setting the user did choose.
 */
export function availableTimeZones(at: Date = new Date(), include?: string): TimeZoneOption[] {
  const listed = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : [systemTimeZone()];
  const zones = include && isTimeZone(include) && !listed.includes(include)
    ? [...listed, include]
    : listed;
  return zones
    .map((zone) => {
      const offset = gmtOffset(zone, at);
      return { zone, offset, label: offset ? `${zone} (${offset})` : zone };
    })
    .sort((left, right) => offsetMinutes(left.offset) - offsetMinutes(right.offset)
      /* Ties keep alphabetical order so the list does not reshuffle between
         browsers that enumerate the zone database differently. */
      || left.zone.localeCompare(right.zone))
    .map(({ zone, label }) => ({ zone, label }));
}

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  /* The list is the wrong test: a zone this browser knows may be missing from
     an older browser's list and the other way round. Asking the formatter to
     use it is the only answer that matches what JASWA will actually do with
     it. */
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function blankGeneralSettings(): GeneralSettings {
  return {
    numberFormat: 'system',
    dateOrder: 'system',
    hourCycle: 'system',
    timeZone: 'system',
    manualTimeZone: systemTimeZone(),
  };
}

export function isGeneralSettings(value: unknown): value is GeneralSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return numberFormatChoices.includes(settings.numberFormat as NumberFormatChoice)
    && dateOrderChoices.includes(settings.dateOrder as DateOrderChoice)
    && hourCycleChoices.includes(settings.hourCycle as HourCycleChoice)
    && timeZoneChoices.includes(settings.timeZone as TimeZoneChoice)
    && isTimeZone(settings.manualTimeZone);
}

/**
 * The locale numbers are written with. `undefined` is what Intl wants for "use
 * this computer" — passing a resolved locale string instead would freeze the
 * setting at the value read when the page loaded.
 */
export function numberLocale(settings: GeneralSettings): string | undefined {
  if (settings.numberFormat === 'european') return europeanNumberLocale;
  if (settings.numberFormat === 'american') return americanNumberLocale;
  return undefined;
}

/** The locale dates are written with, on the same terms as `numberLocale`. */
export function dateLocale(settings: GeneralSettings): string | undefined {
  if (settings.dateOrder === 'day-first') return dayFirstDateLocale;
  if (settings.dateOrder === 'month-first') return monthFirstDateLocale;
  return undefined;
}

export function formattingTimeZone(settings: GeneralSettings): string | undefined {
  return settings.timeZone === 'manual' ? settings.manualTimeZone : undefined;
}

/* Intl reads `hour12: undefined` as "no preference" and falls back to the
   locale's own convention, which is exactly what the system choice means. */
export function formattingHour12(settings: GeneralSettings): boolean | undefined {
  if (settings.hourCycle === 'h12') return true;
  if (settings.hourCycle === 'h23') return false;
  return undefined;
}
