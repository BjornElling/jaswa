import type { DateOrderChoice, GeneralSettings, HourCycleChoice, NumberFormatChoice, TimeZoneChoice } from './types';

/* Every regional choice offers "follow this computer" and defaults to it,
   because the browser already knows the answer the user gave their operating
   system and repeating that question is a worse default than reading it. */
export const numberFormatChoices: NumberFormatChoice[] = ['system', 'european', 'american'];
export const dateOrderChoices: DateOrderChoice[] = ['system', 'european', 'american'];
export const hourCycleChoices: HourCycleChoice[] = ['system', 'h23', 'h12'];
export const timeZoneChoices: TimeZoneChoice[] = ['system', 'manual'];

/* A choice is a whole locale, not a separator or a field order picked out of
   one. `system` passes `undefined`, which is how Intl says "this computer",
   and the other two pin a locale that writes the convention they name.

   The alternative — keeping the user's own locale and reordering the parts it
   produces — was tried and rejected: Intl exposes no standard lever for it
   (`-u-rg-` is not honoured for date order), so it means assembling the date
   from its pieces by hand, which yields `aug. 30, 2026` in Danish and
   `08 30, 2026` in German. A convention taken whole is the only form that
   stays correct in every language.

   Numbers and dates keep separate locales even so, because the two questions
   do not answer each other: a user may want European numbers with American
   dates, and one shared locale would have let the first silently decide the
   second. The European ones differ for that reason — de-DE writes the
   European number but an all-numeric date, so dates take da-DK, which spells
   the month the way the rest of Europe reads it: 30. aug. 2026. */
const europeanNumberLocale = 'de-DE';
const americanNumberLocale = 'en-US';
const europeanDateLocale = 'da-DK';
const americanDateLocale = 'en-US';

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
 * Whether this computer writes 1.234.567,89 rather than 1,234,567.89.
 *
 * Only the decimal mark is read, and only for which of the two conventions it
 * names. The locale's own grouping is not carried over: fr-FR and sv-SE group
 * with spaces, de-CH with apostrophes, and en-IN by lakh as 12,34,567.89 —
 * none of which is either option JASWA offers.
 */
function systemWritesCommaDecimal(): boolean {
  const decimal = new Intl.NumberFormat(undefined).formatToParts(1.5)
    .find((part) => part.type === 'decimal')?.value;
  /* No decimal part means the format cannot be read for its convention; the
     European form is the wider of the two, so it is the safer fallback. */
  return decimal === undefined || decimal === ',';
}

/**
 * The locale numbers are written with. Like `dateLocale` this never returns
 * `undefined`: that would let a French user's own locale through, and its
 * 1 234 567,89 is neither of the two options on the line.
 */
export function numberLocale(settings: GeneralSettings): string {
  if (settings.numberFormat === 'european') return europeanNumberLocale;
  if (settings.numberFormat === 'american') return americanNumberLocale;
  return systemWritesCommaDecimal() ? europeanNumberLocale : americanNumberLocale;
}

/**
 * Whether this computer writes the day before the month.
 *
 * Only the order is read, never the locale's own spelling: de-DE puts the day
 * first and writes 30.08.2026, and an all-numeric date is the one form a
 * reader cannot decode without already knowing which convention produced it.
 * So the answer is a yes or no, and the date is then written in one of JASWA's
 * two locales.
 *
 * A locale that leads with the year — ja-JP, hu-HU — still has the month
 * before the day, and reads as American here. That is the right half of a
 * two-way split: those readers expect the month first.
 */
function systemWritesDayFirst(): boolean {
  const parts = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).formatToParts(new Date());
  const day = parts.findIndex((part) => part.type === 'day');
  const month = parts.findIndex((part) => part.type === 'month');
  /* A format missing either field cannot be read for order; the European form
     is the wider convention, so it is the safer of the two to fall back to. */
  if (day < 0 || month < 0) return true;
  return day < month;
}

/**
 * The locale dates are written with. Unlike `numberLocale` this never returns
 * `undefined`: letting Intl fall back to the computer's own locale is what
 * produced 30.08.2026 for a German user, so `system` resolves to whichever of
 * the two JASWA locales matches the order that computer keeps.
 */
export function dateLocale(settings: GeneralSettings): string {
  if (settings.dateOrder === 'european') return europeanDateLocale;
  if (settings.dateOrder === 'american') return americanDateLocale;
  return systemWritesDayFirst() ? europeanDateLocale : americanDateLocale;
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

/* One number and one instant, wide enough that every separator and field is
   doing visible work. The date is the last of a month so day and month cannot
   be mistaken for each other. */
const sampleNumber = 1234567.89;
const sampleInstant = new Date('2026-08-30T15:04:00Z');

/**
 * What a given choice actually writes.
 *
 * The options label themselves with these rather than with a fixed string, so
 * an option can never promise a format the app does not then produce — the bug
 * that came of labelling a locale by the convention it was picked for instead
 * of by what it prints. `system` is included: it renders through the same path
 * with no locale, so its label is this computer's own answer.
 */
export function numberSample(choice: NumberFormatChoice): string {
  return sampleNumber.toLocaleString(numberLocale({ ...blankNumberOnly(), numberFormat: choice }));
}

export function dateSample(choice: DateOrderChoice, at: Date = sampleInstant): string {
  return new Intl.DateTimeFormat(dateLocale({ ...blankNumberOnly(), dateOrder: choice }), { dateStyle: 'medium' }).format(at);
}

/**
 * What a clock choice writes, in the date convention currently chosen: the
 * hour is the question, but the separator between hour and minute belongs to
 * the locale, so the sample has to be taken in it to be honest.
 */
export function clockSample(choice: HourCycleChoice, settings: GeneralSettings, at: Date = sampleInstant): string {
  return new Intl.DateTimeFormat(dateLocale(settings), {
    timeStyle: 'short',
    timeZone: formattingTimeZone(settings),
    hour12: formattingHour12({ ...settings, hourCycle: choice }),
  }).format(at);
}

/* The samples vary one field at a time, so they need a settings object that is
   otherwise inert rather than the user's own — a number sample must not change
   because a time zone was chosen. */
function blankNumberOnly(): GeneralSettings {
  return { numberFormat: 'system', dateOrder: 'system', hourCycle: 'system', timeZone: 'system', manualTimeZone: 'UTC' };
}
