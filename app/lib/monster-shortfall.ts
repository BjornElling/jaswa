import type { Artifact } from './artifacts';
import type { ArtifactCategory } from './artifact-properties';
import { artifactProperty } from './artifact-properties';
import type { GameRecord } from './game-data';
import { monsterTargetFigures } from './monster-stats';
import type { PreferenceSource, ResolvedMonsterPreferences } from './monster-preference-resolution';
import { resolvedOptions } from './monster-preference-resolution';
import type { MonsterStatTargets } from './monster-preferences';
import type { Relic } from './relics';
import { runeSlotKeys } from './monster-defaults';
import type { RuneSlotKey } from './monster-defaults';
import { relicProperty, relicPropertyLabel } from './relic-properties';
import { roleTargetColumns } from './rune-roles';
import { runeSlotMainByEffect } from './rune-slot-mains';
import { runeStatNames } from './runes';
import { activeRuneSets } from './rune-sets';
import { brokenRuneBuildPart, runeBuild, runeBuildName } from './rune-set-pairs';

/**
 * Where an owned copy does not yet match what it is for.
 *
 * It measures against the *resolved* preference, so a copy whose owner has
 * never opened the overlay is still measured — against what the player base
 * does, which is the best available statement of what the monster is for. Every
 * shortfall therefore carries its `source`, and the overlay can keep "you asked
 * for this and have not got it" apart from "most players want this and you have
 * not got it". Those are different sentences and must not be shown as one.
 *
 * **Only a preferred wish produces a shortfall.** An acceptable one says what
 * still works when the box does not oblige, so reporting its absence would make
 * every monster fall short of nearly everything and the mark would stop meaning
 * anything.
 *
 * Nothing here scores or ranks. A shortfall is a statement of fact — this is
 * wanted, that is engraved — and the overlay shows the gap rather than grading
 * it.
 */

export type ShortfallKind =
  | 'rune-set'
  | 'rune-slot-main'
  | 'artifact-missing'
  | 'artifact-main'
  | 'artifact-sub'
  | 'relic-missing'
  | 'relic-main'
  | 'relic-unique'
  | 'stat';

export type Shortfall = {
  kind: ShortfallKind;
  /** Whose wish this is: the user's own statement, or the population standing in. */
  source: PreferenceSource;
  /** What was wanted, in the words the user reads it in. */
  wanted: string;
  /**
   * What is there instead. `undefined` means the slot is empty, which is a
   * different failure from the wrong thing being engraved and reads differently.
   */
  present?: string;
  /** For a stat: what was asked for and what is there. */
  target?: number;
  current?: number;
  /** A stat past the upper end of its range, rather than short of the lower. */
  over?: boolean;
  /** For a stat: `current` counts the copy's lead, so it is not the figure shown beside it. */
  withLead?: boolean;
  /** Which artifact category or rune slot this concerns, where one applies. */
  where?: string;
};

/* The eleven figures a target may name, in the words the user reads them in.
   `monsterTargetFigures` answers all eleven from one stat sheet, so the two
   vocabularies — a role's `criRate` against a stat sheet's `criticalRate` —
   are reconciled there rather than by a second mapping here. */
const statLabels: Partial<Record<keyof MonsterStatTargets, string>> = Object.fromEntries(
  roleTargetColumns.map((column) => [column.key, `${column.label}${column.unit ?? ''}`]),
);

const runeSlotNumbers: Record<RuneSlotKey, number> = { slot2: 2, slot4: 4, slot6: 6 };

const categoryLabels: Record<ArtifactCategory, string> = { attribute: 'Attribute', type: 'Type' };

/* Named from the vocabulary rather than from what happens to be engraved: a
   unique that is wanted and absent is exactly the case being reported, so
   looking it up among the engraved relics would print `Property 14` for the one
   name the reader most needs. */
function relicUniqueName(id: number): string {
  const definition = relicProperty(id);
  return definition ? relicPropertyLabel(definition) : `Property ${id}`;
}

function runeShortfalls(monster: GameRecord, resolved: ResolvedMonsterPreferences): Shortfall[] {
  const shortfalls: Shortfall[] = [];

  /* A build is met by the *completed* sets, not by owning pieces of them:
     `activeRuneSets` already counts only the sets whose piece requirement is
     met, which is the same arithmetic the stat sheet applies. A build names
     every set it wants, so it is met only when all of them are standing. */
  const active = activeRuneSets(monster);
  const completed = new Set(active.map((set) => set.name));
  const wantedBuilds = resolved.runes.sets;
  /* One shortfall for the whole group rather than one per build. A monster
     carries one build at a time, so a list of four is a list of alternatives, and
     reporting each as a failure would read as four problems where there is
     one. A build leaves its unnamed slots free, and whether those may be broken
     is the copy's own answer — so `Violent` engraved as `Violent/Broken` meets it only
     where broken sets are allowed. Where no build is named nothing is checked:
     the switch qualifies a wish, and without one there is no wish to fall short of. */
  const broken = completed.has(brokenRuneBuildPart) && !resolved.runes.allowBroken;
  /* Counted, not merely looked up: `Blade/Blade` asks for two Blade sets standing. */
  const standing = (name: string) => active.filter((set) => set.name === name).length;
  const met = (id: string) => {
    const sets = runeBuild(id)?.sets;
    return sets !== undefined && sets.every((name) => standing(name) >= sets.filter((other) => other === name).length);
  };
  if (wantedBuilds.chosen.length > 0 && (broken || !wantedBuilds.chosen.some(met))) {
    shortfalls.push({
      kind: 'rune-set',
      source: wantedBuilds.source,
      wanted: wantedBuilds.chosen.join(' or '),
      present: completed.size > 0 ? runeBuildName(active.map((set) => set.name)) : undefined,
    });
  }

  const runes = Array.isArray(monster.runes) ? monster.runes : [];
  for (const key of runeSlotKeys) {
    const wanted = resolved.runes.slots[key];
    if (wanted.chosen.length === 0) continue;
    const slot = runeSlotNumbers[key];
    const engraved = runes.find((rune) => {
      const record = rune as GameRecord | null;
      return typeof record?.slot_no === 'number' && record.slot_no === slot;
    }) as GameRecord | undefined;
    const mainId = typeof engraved?.pri_eff === 'object' && Array.isArray(engraved.pri_eff)
      ? Number(engraved.pri_eff[0]) : null;
    const present = mainId === null || !Number.isFinite(mainId) ? undefined : runeSlotMainByEffect(mainId);
    if (present !== undefined && wanted.chosen.some((stat) => stat === present)) continue;
    shortfalls.push({
      kind: 'rune-slot-main',
      source: wanted.source,
      wanted: wanted.chosen.join(' or '),
      /* A rune whose main the preference vocabulary cannot express is still
         reported by its own name, so the reader is told what is there rather
         than shown an empty slot that is not empty. */
      present: present ?? (mainId === null ? undefined : runeStatNames[mainId]),
      where: `Slot ${slot}`,
    });
  }

  return shortfalls;
}

function artifactShortfalls(
  resolved: ResolvedMonsterPreferences,
  engraved: Partial<Record<ArtifactCategory, Artifact>>,
): Shortfall[] {
  const shortfalls: Shortfall[] = [];

  for (const category of ['attribute', 'type'] as const) {
    const wishes = resolved.artifacts[category];
    if (!wishes.judged) continue;
    const artifact = engraved[category];
    const where = categoryLabels[category];

    const mains = resolvedOptions(wishes.main);
    if (!artifact) {
      shortfalls.push({
        kind: 'artifact-missing',
        source: wishes.main.source,
        wanted: mains.join(' or ') || 'an artifact',
        where,
      });
      continue;
    }

    /* Any one of the wanted mains answers the wish — the piece carries one — and
       an acceptable main answers it as well as a preferred one: accepting it is
       saying it will do. */
    if (mains.length > 0 && !mains.includes(artifact.mainProperty)) {
      shortfalls.push({
        kind: 'artifact-main',
        source: wishes.main.source,
        wanted: mains.join(' or '),
        present: artifact.mainProperty,
        where,
      });
    }

    const rolled = new Set(artifact.subProperties.map((property) => property.definition.id));
    for (const id of wishes.sub.preferred) {
      if (rolled.has(id)) continue;
      shortfalls.push({
        kind: 'artifact-sub', source: wishes.sub.source, wanted: artifactProperty(id)?.name ?? `Property ${id}`, where,
      });
    }
  }

  return shortfalls;
}

function relicShortfalls(resolved: ResolvedMonsterPreferences, engraved: readonly Relic[]): Shortfall[] {
  const shortfalls: Shortfall[] = [];
  const wishes = resolved.relics;
  if (!wishes.judged) return shortfalls;

  const mains = resolvedOptions(wishes.main);
  const uniques = resolvedOptions(wishes.unique);
  if (engraved.length === 0) {
    shortfalls.push({
      kind: 'relic-missing',
      source: wishes.main.source,
      wanted: mains.join(' or ') || 'a relic',
    });
    return shortfalls;
  }

  /* A monster has several relics engraved at once and any of them can answer the wish,
     so the question is whether *none* does — not whether each one does. As with
     an artifact's main, an acceptable answer answers it. */
  if (mains.length > 0 && !engraved.some((relic) => mains.includes(relic.mainProperty))) {
    shortfalls.push({
      kind: 'relic-main',
      source: wishes.main.source,
      wanted: mains.join(' or '),
      present: [...new Set(engraved.map((relic) => relic.mainProperty))].join(', '),
    });
  }

  if (uniques.length > 0) {
    const engravedUniques = new Set(engraved.map((relic) => relic.unique.definition.id));
    if (!uniques.some((id) => engravedUniques.has(id))) {
      shortfalls.push({
        kind: 'relic-unique',
        source: wishes.unique.source,
        wanted: uniques.map(relicUniqueName).join(' or '),
        present: [...new Set(engraved.map((relic) => relicPropertyLabel(relic.unique.definition)))].join(', '),
      });
    }
  }

  return shortfalls;
}

function statShortfalls(monster: GameRecord, resolved: ResolvedMonsterPreferences): Shortfall[] {
  const shortfalls: Shortfall[] = [];
  /* A range is judged with the copy's leads, never on the figure shown beside it;
     where the two differ the sentence says so. */
  const current = monsterTargetFigures(monster, resolved, 'counted');
  const shown = monsterTargetFigures(monster, resolved, 'shown');
  const withLead = (key: keyof MonsterStatTargets) => (current[key] !== shown[key] ? { withLead: true } : {});
  for (const [key, target] of Object.entries(resolved.statTargets)) {
    if (!target) continue;
    const statKey = key as keyof MonsterStatTargets;
    /* A copy that always crits has every crit its CRI Rate could buy. */
    if (statKey === 'criRate' && resolved.alwaysCrits) continue;
    const reached = current[statKey];
    /* A target of `0` is a stated target of nothing and is always met; an absent
       one never reaches this loop at all (`AGENTS.md` §3). */
    if (reached >= target.value) continue;
    shortfalls.push({
      kind: 'stat',
      source: 'user',
      wanted: statLabels[statKey] ?? statKey,
      target: target.value,
      current: reached,
      ...withLead(statKey),
    });
  }
  /* The upper end of a range, read the same way: a figure past it is as far from
     what the copy is for as one short of the lower end. */
  for (const [key, ceiling] of Object.entries(resolved.statCeilings)) {
    if (!ceiling) continue;
    const statKey = key as keyof MonsterStatTargets;
    if (statKey === 'criRate' && resolved.alwaysCrits) continue;
    const reached = current[statKey];
    if (reached <= ceiling.value) continue;
    shortfalls.push({
      kind: 'stat',
      source: 'user',
      wanted: statLabels[statKey] ?? statKey,
      target: ceiling.value,
      current: reached,
      over: true,
      ...withLead(statKey),
    });
  }
  return shortfalls;
}

/**
 * Every way this copy does not yet match what it is for. Its stats are read from
 * the one stat sheet, `monsterTargetFigures`, so the overlay and this check print
 * the same speed for one monster.
 *
 * An empty array means every preferred wish that *could* be checked is met —
 * which is not the same as there being nothing to check. Where neither the user
 * nor the dataset says anything, the resolved panel is unjudged and produces no
 * shortfall at all (§19.5), and the overlay has to tell those two apart.
 */
export function monsterShortfalls(
  monster: GameRecord,
  resolved: ResolvedMonsterPreferences,
  gear: { artifacts?: Partial<Record<ArtifactCategory, Artifact>>; relics?: readonly Relic[] } = {},
): Shortfall[] {
  return [
    ...runeShortfalls(monster, resolved),
    ...artifactShortfalls(resolved, gear.artifacts ?? {}),
    ...relicShortfalls(resolved, gear.relics ?? []),
    ...statShortfalls(monster, resolved),
  ];
}
