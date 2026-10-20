import type { MonsterArchetype } from './monster-catalog';
import { qualityTiers } from './quality-tiers';
import type { QualityTier } from './quality-tiers';
import type { CraftRollAssumption } from './rune-craft-items';

export type ArtifactCategory = 'attribute' | 'type';
export type ArtifactMainProperty = 'HP' | 'ATK' | 'DEF';
/**
 * An artifact's grade. This is the artifact-side name for the game's five
 * quality tiers, which runes share — `QualityTier` is the same five values, and
 * aliasing rather than restating them is what keeps one list from drifting from
 * the other. `app/lib/quality-tiers.ts` owns the vocabulary.
 */
export type ArtifactGrade = QualityTier;

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

/**
 * The contributions the game's best line can collect — Legend's five (§3). It
 * is the ceiling **every** line is measured against, whatever grade carries it,
 * because the optimizer asks how much an artifact contributes and a Normal line
 * holding one roll genuinely contributes a fifth of what a full Legend line
 * does.
 *
 * Measuring each line against its own grade instead makes the score reward low
 * grades: the contributions a finished artifact holds are `maxContributions + 3`
 * — 4 on Normal up to 8 on Legend — so dividing by the grade's own ceiling caps
 * `Σ fractions` at `(M + 3) / M`, which *falls* from 4 on Normal to 1.6 on
 * Legend. A max-rolled Normal artifact then outscores a perfect Legend by 2.5×
 * while delivering half the stat.
 */
export const bestArtifactLineContributions = artifactGrades.Legend.maxContributions;

/**
 * The contributions a finished artifact of this grade holds across all four
 * lines: the lines it starts with plus the four power-up milestones, every one
 * of which either creates a missing line or upgrades an existing one (§3).
 *
 * This is the budget the scoring benchmark has to respect. Four lines that each
 * reached the per-line ceiling would need `4 × 5 = 20` contributions, and no
 * artifact has ever held more than eight.
 */
export function artifactTotalContributions(grade: ArtifactGrade): number {
  return artifactGrades[grade].maxContributions + 3;
}

const gradesByRank = new Map<number, ArtifactGrade>(
  (Object.keys(artifactGrades) as ArtifactGrade[]).map((grade) => [artifactGrades[grade].naturalRank, grade]),
);

export function artifactGradeFromRank(rank: unknown): ArtifactGrade | null {
  return typeof rank === 'number' ? gradesByRank.get(rank) ?? null : null;
}

/* Weakest first, which is the game's own tier order — taken from the shared
   vocabulary rather than restated, so a filter row and a colour table can never
   list the grades differently. */
export const artifactGradeOrder: readonly ArtifactGrade[] = qualityTiers;

/* The export keys the main property numerically, and only these three pairs
   occur. `app/lib/monster-grid.ts` reads the same ids for the roster's
   Artifacts column; both were confirmed against the real export. */
export const artifactMainProperties: Record<number, ArtifactMainProperty> = { 100: 'HP', 101: 'ATK', 102: 'DEF' };

export const artifactMainPropertyOrder: readonly ArtifactMainProperty[] = ['HP', 'ATK', 'DEF'];

/**
 * What a finished artifact's main property is worth, in flat points
 * (`docs/ARTIFACT-CANONICAL.md` §2).
 *
 * The document's table, confirmed against a real account: all 262 artifacts in it
 * carry exactly these three values at every natural grade, with no spread at all. The
 * main property is deterministic in the same way a rune's is.
 *
 * `AGENTS.md` §5 keeps this out of every artifact *view*: an artifact's main stat is
 * named and never quantified, `Artifact` carries no main value, and the import reads
 * the magnitude only to reject a malformed record. That rule is about judging an
 * artifact, where the number adds nothing to the comparison. This table exists for
 * the opposite direction — `rune-substat-weights.ts` needs to know what a monster's
 * two artifacts already bring before it can say what is left for the runes to find —
 * and it must not leak back into an artifact column.
 */
export const artifactMainValue: Readonly<Record<ArtifactMainProperty, number>> = { HP: 1500, ATK: 100, DEF: 100 };

/** A monster carries exactly two artifacts, one of each category (§2). */
export const artifactsPerMonster = 2;

/* The categories as the export encodes them, and the classes each one must
   match on the monster it is engraved on (§1). */
export const artifactCategoryFromType: Record<number, ArtifactCategory> = { 1: 'attribute', 2: 'type' };
export const artifactCategoryLabels: Record<ArtifactCategory, string> = { attribute: 'Attribute', type: 'Type' };
/** SPD UP Effect: the one artifact line the stat sheet reads, for the speed buff its holder receives. */
export const spdUpEffectPropertyId = 206;

export const artifactElements: Record<number, string> = { 1: 'Water', 2: 'Fire', 3: 'Wind', 4: 'Light', 5: 'Dark' };
export const artifactArchetypes: Record<number, MonsterArchetype> = { 1: 'Attack', 2: 'Defense', 3: 'HP', 4: 'Support' };

/**
 * The engrave-class code the game uses for an **Intangible** artifact: one that
 * fills its category slot but matches *any* element or *any* monster type. The
 * game names it in the artifact panel — "Intangible Type Artifact".
 *
 * It is the same wildcard concept `RUNE-CANONICAL.md` §10 records for the
 * Intangible rune, applied to the engrave restriction instead of the set.
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
export const artifactIntangibleEngraveClass = 98;

/** What the interface calls the wildcard class, as the game names it. */
export const artifactIntangibleLabel = 'Intangible';

/**
 * The property vocabulary, derived from the user's own export rather than from
 * a guide: 1,864 artifacts supplied every id, its category, and its per-roll
 * range, and the game's engraving statistics separate current from legacy —
 * an id the statistics never mention is one the drop pool no longer produces.
 *
 * The ranges are today's roll table, which the game's own Repeat Convert dialog
 * confirms: its lowest threshold is `minRoll` and its highest `ceil(maxRoll ×
 * 1.5)` on every property it names. Lines below a floor exist — Bomb Damage at
 * 1, SPD UP Effect at 3 — but only on artifacts that predate v6.2.0's raised
 * values, and a range here is a planning figure rather than an import gate
 * (`readSubProperty` checks no range), so those old lines are read as they are
 * without widening the table every current artifact is measured against.
 *
 * 206 and 226 were a fourth such case until the game's own artifact panel
 * showed the cause was a swapped pair of names rather than a wider range: §5.3
 * pairs "SPD UP Effect" with 4-6 and "ATK/DEF UP Effect" with 3-5, and the
 * export agrees once each name sits on the right id (§5.3).
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
  { id: 210, name: 'Bomb Damage', availability: 'both', status: 'current', minRoll: 2, maxRoll: 4 },
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
     monster's (§5.2), so the names say "on" and "from" rather than naming the
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
  /* 4–6 like every other skill line, which the Repeat Convert dialog's 4–9
     implies. The lines above 6 that once argued for a wider range are all
     converted lines with no power-up — a conversion reaches 9 — so a 7 is a
     conversion, not a roll; widening the range cost every Skill 2 CRIT DMG line
     a seventh of its score. */
  { id: 401, name: '[Skill 2] CRIT DMG', availability: 'type', status: 'current', minRoll: 4, maxRoll: 6 },
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

     Every id here does occur on this account once engraved artifacts are read
     as well: they cluster on the roster, not in the inventory, which is why
     §15.5 saw only three of them from `data.artifacts` by itself.

     `availability` stays 'both' even where the observed lines fall on one
     category only — 203 on three Type artifacts, 207 on a single Attribute
     one. Those samples are far too thin to narrow the field, and §12's rule is
     that a legal artifact must never be refused.

     The ranges stay `null` even though the account supplies some of them —
     single unpowered lines from artifacts acquired after the v6.2.0 increase
     give 200/201/202 = 9-14, 204 = 3-5, 205 = 2-4, 208/209 = 2-4, 216 = 4-6
     and 402 = 4-6. No range is needed: the drop pool no longer produces these
     properties, so no monster's statistics or stated answers can want one, and
     a legacy line weighs zero in every score whatever it rolled. A ceiling here
     could only ever have refused to judge an artifact, never improved a score. */
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
 * The most this property could reach on any artifact — the per-roll maximum
 * times the contributions the game's best line can collect (§3). `null` where
 * the range is unknown, which is every legacy property, so a caller must decide
 * what an unjudgeable line means rather than receiving a number that looks
 * answered.
 *
 * Deliberately independent of the artifact's grade, so that one scale measures
 * every line and a lower grade scores as the smaller contribution it is. Pre-v8
 * artifacts are measured on the same scale: their current properties roll on
 * today's table, and their legacy ones have no ceiling at all.
 */
export function artifactPropertyMaximum(property: ArtifactPropertyDefinition): number | null {
  if (property.maxRoll === null) return null;
  return property.maxRoll * bestArtifactLineContributions;
}

/** The highest level an artifact reaches; a pre-v8 one below it is unrefined. */
export const artifactMaxLevel = 15;

/**
 * The contributions a normal conversion is actually worth, as a share of one
 * roll: the Repeat Convert dialog puts its ceiling at `maxRoll × 1.5`, so a
 * conversion buys one and a half rolls where a power-up buys one.
 *
 * Used to place a conversion on the same scale as a full line, which the
 * benchmark gives five contributions (§3). The rounding that makes the
 * per-property ceiling land on the game's display step is deliberately not
 * folded in here: this is the underlying rate, not one property's figure.
 */
export const artifactNormalConversionContributions = 1.5;

/**
 * The most a *normal* conversion to this property can reach.
 *
 * **Settled September 5, 2026** against the game's own Repeat Convert dialog,
 * which states the selectable threshold range for every property it may roll.
 * Across 25 properties on both categories the minimum is exactly `minRoll` and
 * the maximum is exactly `maxRoll × 1.5`, rounded up to the property's display
 * step. A conversion is therefore worth one and a half rolls, not two:
 *
 * ```text
 * Life Drain        5–8   → 5–12   (not 13, and not 16)
 * Addl DMG by SPD  25–40  → 25–60  (not 65, and not 80)
 * ATK/DEF UP        3–5   → 3–8    where ceil() rounds 7.5 up
 * ```
 *
 * The two candidate rules this replaces both fail the dialog: `maxRoll × 2`
 * overstates every property by about a third, and `minRoll + maxRoll` happens
 * to agree only where `minRoll` is half of `maxRoll`. §10 records the table.
 *
 * This is the figure to score a *proposed* conversion against. A captured line
 * is never judged against it: the game is the authority on a value it issued,
 * so no range is an import gate.
 */
export function artifactNormalConversionMaximum(property: ArtifactPropertyDefinition): number | null {
  if (property.minRoll === null || property.maxRoll === null) return null;
  /* The display step is the property's own granularity: `Additional Damage by
     HP` is the one current property the game shows in tenths, and it is also
     the one whose 1.5× lands off the step (0.45 → 0.5). */
  const step = property.minRoll < 1 ? 0.1 : 1;
  const raw = property.maxRoll * 1.5;
  return Math.round(Math.ceil(Math.round(raw / step * 1e6) / 1e6) * step * 100) / 100;
}

/**
 * The share of a conversion's own maximum which one roll-value choice assumes.
 *
 * The fractions are of the conversion's own ceiling, so 1 is the best a
 * conversion can produce rather than the best the line could ever hold. The
 * floor is `minRoll` — the Repeat Convert dialog's lowest selectable threshold
 * on all 25 properties — and *not* a multiple of it: a conversion re-rolls the
 * line from nothing, so the one and a half rolls it buys are what it may reach,
 * never a floor it must clear (§10). "One third", "two thirds" and "three quarters" are
 * deliberately those shares of that ceiling: they are the values the control
 * names, rather than nearby hand-picked estimates. The stops are the ones a Gem
 * or a Grindstone offers (`craftRollAssumptions`).
 */
export function artifactConversionRollFraction(
  property: ArtifactPropertyDefinition,
  choice: CraftRollAssumption,
): number | null {
  const ceiling = artifactNormalConversionMaximum(property);
  if (property.minRoll === null || ceiling === null || ceiling <= 0) return null;
  const floor = property.minRoll / ceiling;
  const average = (floor + 1) / 2;
  /* Where the floor or the midpoint already passes a stop's share, that stop
     reads as the floor or the midpoint, so the slider never assumes less further
     right. */
  const fractions: Record<CraftRollAssumption, number> = {
    minimum: floor,
    'one-third': Math.max(floor, 1 / 3),
    average,
    'two-thirds': Math.max(average, 2 / 3),
    'three-quarters': Math.max(average, 0.75),
    maximum: 1,
  };
  return fractions[choice];
}
