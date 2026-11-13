/** Inclusive filter groups: no selection and the whole offered vocabulary both mean all. */
export function filterIsUnrestricted<T>(selected: readonly T[], options: readonly T[]): boolean {
  return selected.length === 0 || (options.length > 0 && options.every((option) => selected.includes(option)));
}

export function filterIncludes<T>(selected: readonly T[], value: T | null | undefined, options: readonly T[]): boolean {
  return filterIsUnrestricted(selected, options) || (value !== null && value !== undefined && selected.includes(value));
}

export function filterIncludesAny<T>(selected: readonly T[], values: readonly T[], options: readonly T[]): boolean {
  return filterIsUnrestricted(selected, options) || values.some((value) => selected.includes(value));
}

/** The same rule for a pair stored as independent booleans, without changing saved choices. */
export function filterPair(inFirst: boolean, firstSelected: boolean, secondSelected: boolean): boolean {
  return firstSelected === secondSelected || (inFirst ? firstSelected : secondSelected);
}
