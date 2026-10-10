import type { RuneSimulationResult } from './rune-simulator';

type KeeperRow = { name: string; slots: number[] };

/** Every keeper counts, including speed-protected runes no role can use. */
export function simulationKeeperCounts(result: RuneSimulationResult, roles: readonly { id: string; name: string }[]) {
  if (result.summary.kept === null) return null;
  const rows = new Map<string | null, KeeperRow>(
    roles.map((role) => [role.id, { name: role.name, slots: Array<number>(6).fill(0) }]));
  for (const { rune, verdict } of result.stages[15].entries) {
    if (verdict?.verdict !== 'keep') continue;
    const row = rows.get(verdict.roleId) ?? {
      name: verdict.roleName ?? verdict.roleId ?? 'No matching role',
      slots: Array<number>(6).fill(0),
    };
    row.slots[rune.slot - 1] += 1;
    rows.set(verdict.roleId, row);
  }
  const totals = Array.from({ length: 6 }, (_, at) => [...rows.values()].reduce((sum, row) => sum + row.slots[at], 0));
  return { rows: [...rows.entries()], totals };
}
