/** The list with the entry at `from` taken out and put back at `to`; the same list when either is out of range. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const moved = [...list];
  const [entry] = moved.splice(from, 1);
  moved.splice(to, 0, entry);
  return moved;
}

/**
 * Moves an entry among the ones `belongs` picks out, by their positions among
 * themselves, and leaves every other entry where it was. A list that holds
 * several kinds — Speed Tuning's teams, one list for every dungeon and arena —
 * is reordered one kind at a time this way, so a kind's numbering is all that
 * changes.
 */
export function moveWithin<T>(list: readonly T[], belongs: (entry: T) => boolean, from: number, to: number): T[] {
  const reordered = moveItem(list.filter(belongs), from, to);
  let next = 0;
  return list.map((entry) => belongs(entry) ? reordered[next++] : entry);
}
