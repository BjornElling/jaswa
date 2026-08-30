import type { GeneralSettings, HourCycleChoice, NumberFormatChoice, TimeZoneChoice } from './types';

/* Every regional choice offers "follow this computer" and defaults to it,
   because the browser already knows the answer the user gave their operating
   system and repeating that question is a worse default than reading it. */
export const numberFormatChoices: NumberFormatChoice[] = ['system', 'european', 'american'];
export const hourCycleChoices: HourCycleChoice[] = ['system', 'h23', 'h12'];
export const timeZoneChoices: TimeZoneChoice[] = ['system', 'manual'];

/* One European and one American locale stand in for the two separator
   conventions. The locale is never shown to the user and carries nothing else:
   it is the standard way to ask Intl for "1.234.567,89" or "1,234,567.89"
   without hand-rolling a separator table that would then have to be maintained
   for currencies, percentages and every other Intl consumer. */
const europeanLocale = 'de-DE';
const americanLocale = 'en-US';

export function systemLocale(): string {
  return new Intl.DateTimeFormat().resolvedOptions().locale;
}

/**
 * The IANA zone this computer is set to. Every browser JASWA targets resolves
 * one, but a locked-down or misconfigured host can report an empty string, so
 * the caller gets UTC rather than a formatter that throws on every date.
 */
export function systemTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/**
 * Whether this computer writes times as 13:00 or 1:00 PM. `hourCycle` is only
 * populated when the format explicitly asks for an hour, so the probe requests
 * one; older engines answer through `hour12` instead and both are read.
 */
export function systemUsesTwelveHourClock(): boolean {
  const resolved = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
  if (resolved.hourCycle) return resolved.hourCycle === 'h11' || resolved.hourCycle === 'h12';
  return resolved.hour12 === true;
}

/** The complete IANA list for the manual picker, newest browsers first. */
export function availableTimeZones(): string[] {
  return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [systemTimeZone()];
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
    hourCycle: 'system',
    timeZone: 'system',
    manualTimeZone: systemTimeZone(),
  };
}

export function isGeneralSettings(value: unknown): value is GeneralSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const settings = value as Record<string, unknown>;
  return numberFormatChoices.includes(settings.numberFormat as NumberFormatChoice)
    && hourCycleChoices.includes(settings.hourCycle as HourCycleChoice)
    && timeZoneChoices.includes(settings.timeZone as TimeZoneChoice)
    && isTimeZone(settings.manualTimeZone);
}

/**
 * The locale JASWA formats with. `undefined` is what Intl wants for "use this
 * computer" — passing a resolved locale string instead would freeze the
 * setting at the value read when the page loaded.
 */
export function formattingLocale(settings: GeneralSettings): string | undefined {
  if (settings.numberFormat === 'european') return europeanLocale;
  if (settings.numberFormat === 'american') return americanLocale;
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
