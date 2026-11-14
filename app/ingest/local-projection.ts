import type { GameRecord } from '../domain/account/game-record';
import type { LocalAccountChanges, LocalPreset } from '../domain/account/local-account-changes';
import { isRecord } from '../domain/profiles/preference-reading';

const records = (value: unknown): GameRecord[] => Array.isArray(value) ? value.filter(isRecord) : [];
const owner = (rune: GameRecord) => rune.occupied_type === 1 ? String(rune.occupied_id) : null;
const defenses = { 'arena-defense': 'defense_deck_info', 'interserver-defense': 'server_arena_defense_deck_info' } as const;
function decks(data: GameRecord): Map<string, GameRecord> {
  return new Map([
    ...records(data.deck_list).map((deck) => [`deck-${deck.deck_type}-${deck.deck_seq}`, deck] as const),
    ...Object.entries(defenses).flatMap(([id, field]) => isRecord(data[field]) ? [[id, data[field]] as const] : []),
  ]);
}
function localPreset(deck: GameRecord): LocalPreset {
  return {
    positions: (deck.unit_id_list as unknown[]).map((position) => isRecord(position)
      ? { unitId: position.unit_id as number, positionId: position.pos_id as number }
      : { unitId: position as number }),
    leaderUnitId: typeof deck.leader_unit_id === 'number' ? deck.leader_unit_id : null,
    gear: Array.isArray(deck.equip) ? records(deck.equip).map((entry) => ({ unitId: entry.unit_id as number,
      runeIds: entry.rune_id_list as number[], artifactIds: entry.artifact_id_list as number[] })) : null,
  };
}

/** Store only departures from observed placements and deck choices, never another account. */
export function captureLocalProjection(observation: GameRecord, effective: GameRecord, changes?: LocalAccountChanges): LocalAccountChanges | undefined {
  const next = { ...changes };
  delete next.scenarioRuneOwners;
  delete next.gamePresets;
  const observedOwners = new Map(records(observation.runes).map((rune) => [String(rune.rune_id), owner(rune)]));
  const owners = Object.fromEntries(records(effective.runes).filter((rune) => observedOwners.get(String(rune.rune_id)) !== owner(rune))
    .map((rune) => [String(rune.rune_id), owner(rune)]));
  if (Object.keys(owners).length) next.scenarioRuneOwners = owners;
  const observedDecks = decks(observation);
  const currentDecks = decks(effective);
  const presets: Record<string, LocalPreset | null> = {};
  for (const [id, deck] of observedDecks) {
    const current = currentDecks.get(id);
    if (!current) presets[id] = null;
    else if (JSON.stringify(localPreset(deck)) !== JSON.stringify(localPreset(current))) presets[id] = localPreset(current);
  }
  if (Object.keys(presets).length) next.gamePresets = presets;
  return Object.keys(next).length ? next : undefined;
}

/** A refused local context returns to its observed arrangement, retaining every other context. */
export function applyLocalProjection(observation: GameRecord, changes: LocalAccountChanges | undefined,
  valid: (data: GameRecord) => boolean): GameRecord {
  let data = observation;
  if (changes?.scenarioRuneOwners) {
    const runes = records(data.runes).map((rune) => {
      const id = String(rune.rune_id);
      if (!Object.hasOwn(changes.scenarioRuneOwners!, id)) return rune;
      const to = changes.scenarioRuneOwners![id];
      return { ...rune, occupied_type: to === null ? 2 : 1, occupied_id: to === null ? 0 : Number(to) };
    });
    const candidate = { ...data, runes, unit_list: records(data.unit_list).map((unit) => ({ ...unit,
      runes: runes.filter((rune) => owner(rune) === String(unit.unit_id)),
    })) };
    if (valid(candidate)) data = candidate;
  }
  for (const [id, preset] of Object.entries(changes?.gamePresets ?? {})) {
    const original = decks(data).get(id);
    if (!original) continue;
    const rewritten: GameRecord | null = preset === null ? null : {
      ...original,
      unit_id_list: preset.positions.map((position) => position.positionId === undefined ? position.unitId
        : { pos_id: position.positionId, unit_id: position.unitId }),
      ...(id.startsWith('deck-') ? { leader_unit_id: preset.leaderUnitId ?? 0 } : {}),
    };
    if (rewritten) {
      if (preset!.gear === null) {
        if (Object.hasOwn(original, 'equip')) rewritten.equip = null;
        else delete rewritten.equip;
      }
      else rewritten.equip = preset!.gear.map((entry) => ({ unit_id: entry.unitId,
        rune_id_list: entry.runeIds, artifact_id_list: entry.artifactIds }));
    }
    const field = defenses[id as keyof typeof defenses];
    const candidate = { ...data };
    if (field) {
      if (rewritten) candidate[field] = rewritten;
      else delete candidate[field];
    } else candidate.deck_list = records(data.deck_list).flatMap((deck) => deck === original ? rewritten ? [rewritten] : [] : [deck]);
    if (valid(candidate)) data = candidate;
  }
  return data;
}
