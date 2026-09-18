import type { Artifact } from './artifacts';
import type { ArtifactCategory } from './artifact-properties';
import { artifactProperty } from './artifact-properties';
import type { GameRecord } from './game-data';
import type { MonsterTotals } from './monster-stats';
import { monsterTargetFigures } from './monster-stats';
import type { PreferenceSource, ResolvedMonsterPreferences } from './monster-preference-resolution';
import type { MonsterStatTargets } from './monster-preferences';
import type { Relic } from './relics';
import { runeSlotKeys } from './monster-defaults';
import type { RuneSlotKey } from './monster-defaults';
import { relicProperty, relicPropertyLabel } from './relic-properties';
import { presetTargetColumns, runeMainStatByEffect } from './rune-potential-presets';
import { runeStatNames } from './runes';
import { activeRuneSets } from './rune-sets';
import { runeSetPair } from './rune-set-pairs';

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
 * wanted, that is equipped — and the overlay shows the gap rather than grading
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
   * different failure from the wrong thing being equipped and reads differently.
   */
  present?: string;
  /** For a stat or a substat floor: what was asked for and what is there. */
  target?: number;
  current?: number;
  /** Which artifact category or rune slot this concerns, where one applies. */
  where?: string;
};

/* The eleven figures a target may name, in the words the user reads them in.
   `monsterTargetFigures` answers all eleven from one stat sheet, so the two
   vocabularies — a preset's `criRate` against a stat sheet's `criticalRate` —
   are reconciled there rather than by a second mapping here. */
const statLabels: Partial<Record<keyof MonsterStatTargets, string>> = Object.fromEntries(
  presetTargetColumns.map((column) => [column.key, `${column.label}${column.unit ?? ''}`]),
);

const runeSlotNumbers: Record<RuneSlotKey, number> = { slot2: 2, slot4: 4, slot6: 6 };

const categoryLabels: Record<ArtifactCategory, string> = { attribute: 'Attribute', type: 'Type' };

/* Named from the vocabulary rather than from what happens to be engraved: a
   unique that is wanted and absent is exactly the case being reported, so
   looking it up among the worn relics would print `Property 14` for the one
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
  const completed = new Set(activeRuneSets(monster).map((set) => set.name));
  const wantedBuilds = resolved.runes.sets;
  /* One shortfall for the whole group rather than one per build. A monster
     wears one build at a time, so a list of four is a list of alternatives, and
     reporting each as a failure would read as four problems where there is
     one. */
  if (wantedBuilds.chosen.length > 0
    && !wantedBuilds.chosen.some((id) => runeSetPair(id)?.sets.every((name) => completed.has(name)) ?? false)) {
    shortfalls.push({
      kind: 'rune-set',
      source: wantedBuilds.source,
      wanted: wantedBuilds.chosen.join(' or '),
      present: completed.size > 0 ? [...completed].join(', ') : undefined,
    });
  }

  const runes = Array.isArray(monster.runes) ? monster.runes : [];
  for (const key of runeSlotKeys) {
    const wanted = resolved.runes.slots[key];
    if (wanted.chosen.length === 0) continue;
    const slot = runeSlotNumbers[key];
    const worn = runes.find((rune) => {
      const record = rune as GameRecord | null;
      return typeof record?.slot_no === 'number' && record.slot_no === slot;
    }) as GameRecord | undefined;
    const mainId = typeof worn?.pri_eff === 'object' && Array.isArray(worn.pri_eff)
      ? Number(worn.pri_eff[0]) : null;
    const present = mainId === null || !Number.isFinite(mainId) ? undefined : runeMainStatByEffect[mainId];
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
  worn: Partial<Record<ArtifactCategory, Artifact>>,
): Shortfall[] {
  const shortfalls: Shortfall[] = [];

  for (const category of ['attribute', 'type'] as const) {
    const wishes = resolved.artifacts[category];
    if (!wishes.judged) continue;
    const artifact = worn[category];
    const where = categoryLabels[category];

    if (!artifact) {
      shortfalls.push({
        kind: 'artifact-missing',
        source: wishes.main.source,
        wanted: wishes.main.chosen.join(' or ') || 'an artifact',
        where,
      });
      continue;
    }

    /* Any one of the wanted mains answers the wish — the piece carries one, and
       the user named every one they would accept. */
    if (wishes.main.chosen.length > 0 && !wishes.main.chosen.includes(artifact.mainProperty)) {
      shortfalls.push({
        kind: 'artifact-main',
        source: wishes.main.source,
        wanted: wishes.main.chosen.join(' or '),
        present: artifact.mainProperty,
        where,
      });
    }

    const rolled = new Map(artifact.subProperties.map((property) => [property.definition.id, property]));
    for (const [id, wish] of wishes.sub) {
      const line = rolled.get(id);
      const name = artifactProperty(id)?.name ?? `Property ${id}`;
      if (!line) {
        shortfalls.push({ kind: 'artifact-sub', source: wish.source, wanted: name, where });
        continue;
      }
      /* A floor the roll does not clear is a shortfall even though the property
         is present: "Damage Taken from Wind at 15 % or better" is one wish, not
         two, and a 6 % line answers only half of it. An absent floor means the
         property is wanted at any roll and a present line always satisfies it. */
      if (wish.minimumHundredths !== undefined && line.valueHundredths < wish.minimumHundredths) {
        shortfalls.push({
          kind: 'artifact-sub',
          source: wish.source,
          wanted: name,
          present: name,
          target: wish.minimumHundredths,
          current: line.valueHundredths,
          where,
        });
      }
    }
  }

  return shortfalls;
}

function relicShortfalls(resolved: ResolvedMonsterPreferences, worn: readonly Relic[]): Shortfall[] {
  const shortfalls: Shortfall[] = [];
  const wishes = resolved.relics;
  if (!wishes.judged) return shortfalls;

  if (worn.length === 0) {
    shortfalls.push({
      kind: 'relic-missing',
      source: wishes.main.source,
      wanted: wishes.main.chosen.join(' or ') || 'a relic',
    });
    return shortfalls;
  }

  /* A monster wears several relics at once and any of them can answer the wish,
     so the question is whether *none* does — not whether each one does. */
  if (wishes.main.chosen.length > 0 && !worn.some((relic) => wishes.main.chosen.includes(relic.mainProperty))) {
    shortfalls.push({
      kind: 'relic-main',
      source: wishes.main.source,
      wanted: wishes.main.chosen.join(' or '),
      present: [...new Set(worn.map((relic) => relic.mainProperty))].join(', '),
    });
  }

  if (wishes.unique.chosen.length > 0) {
    const engraved = new Set(worn.map((relic) => relic.unique.definition.id));
    if (!wishes.unique.chosen.some((id) => engraved.has(id))) {
      shortfalls.push({
        kind: 'relic-unique',
        source: wishes.unique.source,
        wanted: wishes.unique.chosen.map(relicUniqueName).join(' or '),
        present: [...new Set(worn.map((relic) => relicPropertyLabel(relic.unique.definition)))].join(', '),
      });
    }
  }

  return shortfalls;
}

function statShortfalls(resolved: ResolvedMonsterPreferences, totals: MonsterTotals): Shortfall[] {
  const shortfalls: Shortfall[] = [];
  const current = monsterTargetFigures(totals);
  for (const [key, target] of Object.entries(resolved.statTargets)) {
    if (!target) continue;
    const statKey = key as keyof MonsterStatTargets;
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
    });
  }
  return shortfalls;
}

/**
 * Every way this copy does not yet match what it is for.
 *
 * `totals` is passed in rather than computed here so the overlay and the roster
 * show one stat sheet: a second call site is a second chance to pass different
 * account modifiers and print two different speeds for one monster.
 *
 * An empty array means every preferred wish that *could* be checked is met —
 * which is not the same as there being nothing to check. Where neither the user
 * nor the dataset says anything, the resolved panel is unjudged and produces no
 * shortfall at all (§19.5), and the overlay has to tell those two apart.
 */
export function monsterShortfalls(
  monster: GameRecord,
  resolved: ResolvedMonsterPreferences,
  totals: MonsterTotals,
  gear: { artifacts?: Partial<Record<ArtifactCategory, Artifact>>; relics?: readonly Relic[] } = {},
): Shortfall[] {
  return [
    ...runeShortfalls(monster, resolved),
    ...artifactShortfalls(resolved, gear.artifacts ?? {}),
    ...relicShortfalls(resolved, gear.relics ?? []),
    ...statShortfalls(resolved, totals),
  ];
}
