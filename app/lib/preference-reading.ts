/**
 * Reading the user's stored choices back, one choice at a time.
 *
 * Preferences used to be accepted only as one complete document, so a single
 * field the stored copy did not carry — a setting added by the change just
 * made, a role gaining a property — rejected the whole of it and every page
 * fell back to its defaults. Every restart of the dev server after such a
 * change quietly erased the user's roles, the import mode and the Rune
 * Clean-up settings at once.
 *
 * The unit of rejection is therefore the smallest thing the user chose on its
 * own: a setting, a role, a monster's field, a team, a rule. A value that
 * fails its check is dropped and that one choice starts from its default;
 * nothing beside it is touched. Nothing is repaired into a shape it never had
 * either — an invalid value is never coerced, only replaced by the default.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type FieldChecks<T> = { [K in keyof T]-?: (value: unknown) => boolean };

/**
 * A settings block whose fields are independent choices: each stored field
 * that passes its own check is kept, each one that is missing or fails starts
 * from `fallback`, and keys the current contract does not name are left out.
 */
export function readSettings<T extends object>(value: unknown, fallback: T, checks: FieldChecks<T>): T {
  const stored = isRecord(value) ? value : {};
  const read = { ...fallback };
  for (const key of Object.keys(checks) as (keyof T & string)[]) {
    if (checks[key](stored[key])) read[key] = stored[key] as T[typeof key];
  }
  return read;
}

export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

export function isOneOf<T>(choices: readonly T[]) {
  return (value: unknown): value is T => choices.includes(value as T);
}

export function isWholeNumberIn(minimum: number, maximum: number) {
  return (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum;
}
