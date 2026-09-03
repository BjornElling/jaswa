import type { MonsterArchetype } from './monster-catalog';

export type ArtifactCategory = 'attribute' | 'type';
export type ArtifactMainProperty = 'HP' | 'ATK' | 'DEF';
export type ArtifactGrade = 'Normal' | 'Magic' | 'Rare' | 'Hero' | 'Legend';

/**
 * A sub property as the game names it, with the per-roll range needed to say
 * how well a line rolled.
 *
 * `minRoll`/`maxRoll` are `null` for a legacy property. `ARTIFACT-CANONICAL.md`
 * §12 forbids computing a maximum for one: an unknown range is not a zero, and
 * a placeholder would make every legacy line judge as a perfect or a hopeless
 * roll rather than as unjudgeable.
 */
export type ArtifactPropertyDefinition = {
  id: number;
  name: string;
  /** Reductions carry their sign with the value rather than hiding it in the label. */
  valueSign?: '−';
  availability: ArtifactCategory | 'both';
  status: 'current' | 'legacy';
  minRoll: number | null;
  maxRoll: number | null;
};

/* Grades carry the contribution count as data (`ARTIFACT-CANONICAL.md` §3), so
   a balance patch is a table edit. Normal is the stated exception: it grants no
   power-up rolls yet its finished lines still hold one roll each, so its count
   is 1 rather than the `initial + rolls` sum that yields a wrong zero. */
export const artifactGrades: Record<ArtifactGrade, { naturalRank: number; maxContributions: number }> = {
  Normal: { naturalRank: 1, maxContributions: 1 },
  Magic: { naturalRank: 2, maxContributions: 2 },
  Rare: { naturalRank: 3, maxContributions: 3 },
  Hero: { naturalRank: 4, maxContributions: 4 },
  Legend: { naturalRank: 5, maxContributions: 5 },
};

const gradesByRank = new Map<number, ArtifactGrade>(
  (Object.keys(artifactGrades) as ArtifactGrade[]).map((grade) => [artifactGrades[grade].naturalRank, grade]),
);

export function artifactGradeFromRank(rank: unknown): ArtifactGrade | null {
  return typeof rank === 'number' ? gradesByRank.get(rank) ?? null : null;
}

export const artifactGradeOrder: readonly ArtifactGrade[] = ['Normal', 'Magic', 'Rare', 'Hero', 'Legend'];

/* The export keys the main property numerically, and only these three pairs
   occur. `app/lib/monster-grid.ts` reads the same ids for the roster's
   Artifacts column; both were confirmed against the real export. */
export const artifactMainProperties: Record<number, ArtifactMainProperty> = { 100: 'HP', 101: 'ATK', 102: 'DEF' };

export const artifactMainPropertyOrder: readonly ArtifactMainProperty[] = ['HP', 'ATK', 'DEF'];

/* The categories as the export encodes them, and the classes each one must
   match on the monster wearing it (§1). */
export const artifactCategoryFromType: Record<number, ArtifactCategory> = { 1: 'attribute', 2: 'type' };
export const artifactCategoryLabels: Record<ArtifactCategory, string> = { attribute: 'Attribute', type: 'Type' };

export const artifactElements: Record<number, string> = { 1: 'Water', 2: 'Fire', 3: 'Wind', 4: 'Light', 5: 'Dark' };
export const artifactArchetypes: Record<number, MonsterArchetype> = { 1: 'Attack', 2: 'Defense', 3: 'HP', 4: 'Support' };

/**
 * The equip-class code the game uses for an **Intangible** artifact: one that
 * fills its category slot but matches *any* element or *any* monster type. The
 * game names it in the artifact panel — "Intangible Type Artifact".
 *
 * It is the same wildcard concept `RUNE-CANONICAL.md` §10 records for the
 * Intangible rune, applied to the equip restriction instead of the set.
 *
 * `ARTIFACT-CANONICAL.md` §15.1 recorded the code as pending; the user's own
 * account settles it. 31 of 1,862 records carry it — 25 on `attribute`, 6 on
 * `unit_style` — and in every other respect they are ordinary artifacts: the
 * same grades, sources, main properties and `rank`/`level` constants. Crucially
 * `type` is unchanged, and a `type: 1` Intangible still carries `3xx`
 * attribute-only properties while a `type: 2` one carries `4xx` type-only
 * properties, so the **category** restriction still binds and only the class
 * within it is open.
 */
export const artifactIntangibleEquipClass = 98;

/** What the interface calls the wildcard class, as the game names it. */
export const artifactIntangibleLabel = 'Intangible';

/**
 * The property vocabulary, derived from the user's own export rather than from
 * a guide: 1,864 artifacts supplied every id, its category, and its per-roll
 * range, and the game's engraving statistics separate current from legacy —
 * an id the statistics never mention is one the drop pool no longer produces.
 *
 * The ranges are the observed ones. Three of them (210, 219, 220) roll below
 * the figure `ARTIFACT-CANONICAL.md` §5 records, on current artifacts acquired
 * this month, so the export governs and §5's table is the narrower secondary
 * source.
 *
 * 206 and 226 were a fourth such case until the game's own artifact panel
 * showed the cause was a swapped pair of names rather than a wider range: §5.3
 * pairs "SPD UP Effect" with 4-6 and "ATK/DEF UP Effect" with 3-5, and the
 * export agrees once each name sits on the right id (§15.9).
 *
 * Legacy names come from the lines the export actually carries; legacy ranges
 * stay `null` under §12 rather than being inferred from the few examples owned.
 */
export const artifactProperties: readonly ArtifactPropertyDefinition[] = [
  /* Available on both categories. */
  /* The game's own artifact panel names these two, on rid 1215663871: its
     unpowered +6 line reads "SPD UP effect" and its unpowered +5 line reads
     "ATK/DEF UP Effect". That also settles the ranges the export observes —
     4-6 here and 3-5 on 226 — against §5.3, which had the pairing reversed. */
  { id: 206, name: 'SPD UP Effect', availability: 'both', status: 'current', minRoll: 4, maxRoll: 6 },
  { id: 210, name: 'Bomb Damage', availability: 'both', status: 'current', minRoll: 1, maxRoll: 4 },
  { id: 214, name: 'CRIT DMG Taken', valueSign: '−', availability: 'both', status: 'current', minRoll: 2, maxRoll: 4 },
  { id: 215, name: 'Life Drain', availability: 'both', status: 'current', minRoll: 5, maxRoll: 8 },
  { id: 218, name: 'Additional Damage by HP', availability: 'both', status: 'current', minRoll: 0.2, maxRoll: 0.3 },
  { id: 219, name: 'Additional Damage by ATK', availability: 'both', status: 'current', minRoll: 2, maxRoll: 4 },
  { id: 220, name: 'Additional Damage by DEF', availability: 'both', status: 'current', minRoll: 2, maxRoll: 4 },
  { id: 221, name: 'Additional Damage by SPD', availability: 'both', status: 'current', minRoll: 25, maxRoll: 40 },
  { id: 222, name: 'CRIT DMG as enemy HP is more', availability: 'both', status: 'current', minRoll: 4, maxRoll: 6 },
  { id: 223, name: 'CRIT DMG as enemy HP is less', availability: 'both', status: 'current', minRoll: 8, maxRoll: 12 },
  { id: 224, name: 'Own turn 1-target CRIT DMG', availability: 'both', status: 'current', minRoll: 2, maxRoll: 4 },
  { id: 225, name: 'Counterattack/Co-op Attack DMG', availability: 'both', status: 'current', minRoll: 2, maxRoll: 4 },
  { id: 226, name: 'ATK/DEF UP Effect', availability: 'both', status: 'current', minRoll: 3, maxRoll: 5 },

  /* Attribute artifacts only. It is the target's element that matters, not the
     wearer's (§5.2), so the names say "on" and "from" rather than naming the
     monster's own attribute. */
  { id: 300, name: 'Damage Dealt on Fire', availability: 'attribute', status: 'current', minRoll: 3, maxRoll: 5 },
  { id: 301, name: 'Damage Dealt on Water', availability: 'attribute', status: 'current', minRoll: 3, maxRoll: 5 },
  { id: 302, name: 'Damage Dealt on Wind', availability: 'attribute', status: 'current', minRoll: 3, maxRoll: 5 },
  { id: 303, name: 'Damage Dealt on Light', availability: 'attribute', status: 'current', minRoll: 3, maxRoll: 5 },
  { id: 304, name: 'Damage Dealt on Dark', availability: 'attribute', status: 'current', minRoll: 3, maxRoll: 5 },
  { id: 305, name: 'Damage Taken from Fire', valueSign: '−', availability: 'attribute', status: 'current', minRoll: 4, maxRoll: 6 },
  { id: 306, name: 'Damage Taken from Water', valueSign: '−', availability: 'attribute', status: 'current', minRoll: 4, maxRoll: 6 },
  { id: 307, name: 'Damage Taken from Wind', valueSign: '−', availability: 'attribute', status: 'current', minRoll: 4, maxRoll: 6 },
  { id: 308, name: 'Damage Taken from Light', valueSign: '−', availability: 'attribute', status: 'current', minRoll: 4, maxRoll: 6 },
  { id: 309, name: 'Damage Taken from Dark', valueSign: '−', availability: 'attribute', status: 'current', minRoll: 4, maxRoll: 6 },

  /* Type artifacts only. */
  { id: 400, name: '[Skill 1] CRIT DMG', availability: 'type', status: 'current', minRoll: 4, maxRoll: 6 },
  /* One line in the export rolled 7 where every other skill property tops out
     at 6. A single observation is thin evidence for a wider range, but the
     alternative is a ceiling a real artifact provably exceeds — and a roll
     fraction above 1 would make the benchmark meaningless. */
  { id: 401, name: '[Skill 2] CRIT DMG', availability: 'type', status: 'current', minRoll: 4, maxRoll: 7 },
  { id: 404, name: '[Skill 1] Recovery', availability: 'type', status: 'current', minRoll: 4, maxRoll: 6 },
  { id: 405, name: '[Skill 2] Recovery', availability: 'type', status: 'current', minRoll: 4, maxRoll: 6 },
  { id: 406, name: '[Skill 3] Recovery', availability: 'type', status: 'current', minRoll: 4, maxRoll: 6 },
  { id: 407, name: '[Skill 1] Accuracy', availability: 'type', status: 'current', minRoll: 4, maxRoll: 6 },
  { id: 408, name: '[Skill 2] Accuracy', availability: 'type', status: 'current', minRoll: 4, maxRoll: 6 },
  { id: 409, name: '[Skill 3] Accuracy', availability: 'type', status: 'current', minRoll: 4, maxRoll: 6 },
  { id: 410, name: '[Skill 3/4] CRIT DMG', availability: 'type', status: 'current', minRoll: 4, maxRoll: 6 },
  { id: 411, name: 'First Attack CRIT DMG', availability: 'type', status: 'current', minRoll: 4, maxRoll: 6 },

  /* Legacy. Kept because the game preserves them on artifacts that already
     carried them, and rejecting one would reject a legal artifact (§12).

     Every name here but one is anchored by an artifact the game itself
     displayed: 201, 205 and 217 on rid 319233427; 200 and 217 on rid 60850484;
     207, 208 and 213 on rid 60874386; 203 and 211 on rid 52204289; 208 and 209
     on rid 147366072. 402/403 come from the merge §5.1 records. Only 212 is
     unanchored — it is the one legacy id this account does not carry, so its
     name still rests on §12's list alone.

     Every id here does occur on this account once equipped artifacts are read
     as well: they cluster on the roster, not in the inventory, which is why
     §15.5 saw only three of them from `data.artifacts` by itself.

     `availability` stays 'both' even where the observed lines fall on one
     category only — 203 on three Type artifacts, 207 on a single Attribute
     one. Those samples are far too thin to narrow a field whose only effect is
     to reject a line on import, and §12's rule is that a legal artifact must
     never be refused.

     The ranges stay `null` even though the account now supplies them. Reading
     single unpowered lines from artifacts acquired after the v6.2.0 increase
     gives 200/201/202 = 9-14, 204 = 3-5, 205 = 2-4, 208/209 = 2-4, 216 = 4-6
     and 402 = 4-6, each agreeing with the published v8 merge table. They are
     recorded here rather than in the fields because `readSubProperty` treats a
     range as a rejection test: filling these in refuses 55 artifacts this
     account holds — the 28 that predate v6.2.0 and roll under the older, lower
     table, plus pre-v8 lines whose value is not a whole multiple of any
     per-roll figure because the old upgrade mechanic did not work that way.
     A range that would reject a legal artifact is worse than no range (§12). */
  { id: 200, name: 'ATK Increased Proportional to Lost HP', availability: 'both', status: 'legacy', minRoll: null, maxRoll: null },
  { id: 201, name: 'DEF Increased Proportional to Lost HP', availability: 'both', status: 'legacy', minRoll: null, maxRoll: null },
  { id: 202, name: 'SPD Increased Proportional to Lost HP', availability: 'both', status: 'legacy', minRoll: null, maxRoll: null },
  { id: 203, name: 'SPD Under Inability Effects', availability: 'both', status: 'legacy', minRoll: null, maxRoll: null },
  { id: 204, name: 'ATK Increasing Effect', availability: 'both', status: 'legacy', minRoll: null, maxRoll: null },
  { id: 205, name: 'DEF Increasing Effect', availability: 'both', status: 'legacy', minRoll: null, maxRoll: null },
  { id: 207, name: 'CRIT Rate Increasing Effect', availability: 'both', status: 'legacy', minRoll: null, maxRoll: null },
  /* 208 and 209 are the pre-v8 halves of what §5.1 records as a merge, both
     confirmed on artifact panels: "Counterattack DMG" and "Co-op attack DMG",
     which v8 combined into 225 "Counterattack/Co-op Attack DMG". Each half is
     named after the side of that survivor it became — the same shape, and the
     same reason they are legacy, as 402/403 → 410. */
  { id: 208, name: 'Counterattack DMG', availability: 'both', status: 'legacy', minRoll: null, maxRoll: null },
  { id: 209, name: 'Co-op Attack DMG', availability: 'both', status: 'legacy', minRoll: null, maxRoll: null },
  { id: 211, name: 'Damage Dealt by Reflect DMG', availability: 'both', status: 'legacy', minRoll: null, maxRoll: null },
  { id: 212, name: 'Crushing Hit DMG', availability: 'both', status: 'legacy', minRoll: null, maxRoll: null },
  { id: 213, name: 'Damage Received Under Inability Effects', valueSign: '−', availability: 'both', status: 'legacy', minRoll: null, maxRoll: null },
  { id: 216, name: 'HP when Revived', availability: 'both', status: 'legacy', minRoll: null, maxRoll: null },
  { id: 217, name: 'Attack Bar when Revived', availability: 'both', status: 'legacy', minRoll: null, maxRoll: null },
  { id: 402, name: '[Skill 3] CRIT DMG', availability: 'type', status: 'legacy', minRoll: null, maxRoll: null },
  { id: 403, name: '[Skill 4] CRIT DMG', availability: 'type', status: 'legacy', minRoll: null, maxRoll: null },
];

const propertiesById = new Map(artifactProperties.map((property) => [property.id, property]));

export function artifactProperty(id: unknown): ArtifactPropertyDefinition | null {
  return typeof id === 'number' ? propertiesById.get(id) ?? null : null;
}

/** The properties a category can carry, in the order the filter offers them. */
export function artifactPropertiesFor(category: ArtifactCategory): ArtifactPropertyDefinition[] {
  return artifactProperties.filter((property) => property.status === 'current'
    && (property.availability === 'both' || property.availability === category));
}

/**
 * The most this property could reach on this grade — the per-roll maximum times
 * the contributions one line can collect (§3). `null` where the range is
 * unknown, which is every legacy property, so a caller must decide what an
 * unjudgeable line means rather than receiving a number that looks answered.
 */
export function artifactPropertyMaximum(property: ArtifactPropertyDefinition, grade: ArtifactGrade): number | null {
  if (property.maxRoll === null) return null;
  return property.maxRoll * artifactGrades[grade].maxContributions;
}

/**
 * The contributions a converted line receives, whatever the artifact's grade.
 *
 * This is an observation, not a rule inherited from a guide. Across the 137
 * converted lines in the captured account every one carries zero power-ups,
 * 66 hold a value no single roll can produce, and **none** requires a third
 * contribution — so a conversion lands on exactly two. `ARTIFACT-CANONICAL.md`
 * §10 records the count and the evidence.
 *
 * It matters because it is the ceiling a conversion is judged against. A
 * Legend line collects five contributions, so scoring a conversion against
 * that ceiling claims a value the game cannot produce, and overstates the case
 * for converting precisely on the best artifacts.
 */
export const artifactConversionContributions = 2;

/**
 * The most a conversion to this property could reach. Independent of the
 * artifact's grade, because the conversion's own contribution count is.
 */
export function artifactConversionMaximum(property: ArtifactPropertyDefinition): number | null {
  if (property.maxRoll === null) return null;
  return property.maxRoll * artifactConversionContributions;
}
