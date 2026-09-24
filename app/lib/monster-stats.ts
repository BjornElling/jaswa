import { calculateRunePotentialMetrics, displayRunePotentialMetric } from './rune-potential-metrics';

type RecordLike = Record<string, unknown>;

export type MonsterTotals = {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  criticalRate: number;
  criticalDamage: number;
  resistance: number;
  accuracy: number;
};

type RuneEffects = {
  hpPercent: number;
  hpFlat: number;
  atkPercent: number;
  atkFlat: number;
  defPercent: number;
  defFlat: number;
  spdPercent: number;
  spdFlat: number;
  criticalRate: number;
  criticalDamage: number;
  resistance: number;
  accuracy: number;
};

type AccountStatModifiers = Partial<Pick<RuneEffects, 'hpPercent' | 'atkPercent' | 'defPercent' | 'spdPercent'>>;

// These are the permanent, personal-stat bonuses granted by completed rune sets.
// Effects which only matter during a battle are deliberately not included in the
// overview's always-visible stats.
const setBonuses: Record<number, { pieces: number; effect: keyof RuneEffects; value: number }> = {
  1: { pieces: 2, effect: 'hpPercent', value: 15 }, // Energy
  2: { pieces: 2, effect: 'defPercent', value: 15 }, // Guard
  3: { pieces: 4, effect: 'spdPercent', value: 25 }, // Swift
  4: { pieces: 2, effect: 'criticalRate', value: 12 }, // Blade
  5: { pieces: 4, effect: 'criticalDamage', value: 40 }, // Rage
  6: { pieces: 2, effect: 'accuracy', value: 20 }, // Focus
  7: { pieces: 2, effect: 'resistance', value: 20 }, // Endure
  8: { pieces: 4, effect: 'atkPercent', value: 35 }, // Fatal
};

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function freshEffects(modifiers: AccountStatModifiers): RuneEffects {
  return {
    hpPercent: numberValue(modifiers.hpPercent), hpFlat: 0,
    atkPercent: numberValue(modifiers.atkPercent), atkFlat: 0,
    defPercent: numberValue(modifiers.defPercent), defFlat: 0,
    spdPercent: numberValue(modifiers.spdPercent), spdFlat: 0,
    criticalRate: 0, criticalDamage: 0, resistance: 0, accuracy: 0,
  };
}

function addEffect(effect: unknown, totals: RuneEffects): void {
  if (!Array.isArray(effect) || effect.length < 2) return;
  const stat = numberValue(effect[0]);
  const value = numberValue(effect[1]);
  // For a rune substat, the fourth value is the grindstone amount. It is a
  // separate addition to the visible stat, not a possible future roll.
  // Main and innate effects do not carry this value, so they remain unchanged.
  const grindstone = numberValue(effect[3]);
  const effectKey: Partial<Record<number, keyof RuneEffects>> = {
    1: 'hpFlat', 2: 'hpPercent', 3: 'atkFlat', 4: 'atkPercent',
    5: 'defFlat', 6: 'defPercent', 8: 'spdFlat', 9: 'criticalRate',
    10: 'criticalDamage', 11: 'resistance', 12: 'accuracy',
  };
  const key = effectKey[stat];
  if (key) totals[key] += value + grindstone;
}

function equippedRunes(monster: RecordLike): RecordLike[] {
  return Array.isArray(monster.runes)
    ? monster.runes.filter((rune): rune is RecordLike => Boolean(rune) && typeof rune === 'object' && !Array.isArray(rune))
    : [];
}

function equippedArtifacts(monster: RecordLike): RecordLike[] {
  return Array.isArray(monster.artifacts)
    ? monster.artifacts.filter((artifact): artifact is RecordLike => Boolean(artifact) && typeof artifact === 'object' && !Array.isArray(artifact))
    : [];
}

function addArtifactMainEffect(artifact: RecordLike, totals: RuneEffects): void {
  const effect = artifact.pri_effect;
  if (!Array.isArray(effect) || effect.length < 2) return;
  const value = numberValue(effect[1]);
  switch (numberValue(effect[0])) {
    case 100: totals.hpFlat += value; break;
    case 101: totals.atkFlat += value; break;
    case 102: totals.defFlat += value; break;
    default: break;
  }
}

/**
 * Calculates the current personal stat sheet from the imported monster and its
 * equipped runes. The optional modifiers are reserved for account-wide bonuses
 * once their full import rules have been established; they default to zero so
 * imported game data is never silently guessed or invented.
 */
export function calculateMonsterTotals(monster: RecordLike, accountModifiers: AccountStatModifiers = {}): MonsterTotals {
  const effects = freshEffects(accountModifiers);
  const runeSetCounts: Record<number, number> = {};

  for (const rune of equippedRunes(monster)) {
    const setId = numberValue(rune.set_id);
    if (setId) runeSetCounts[setId] = (runeSetCounts[setId] ?? 0) + 1;
    addEffect(rune.pri_eff, effects);
    addEffect(rune.prefix_eff, effects);
    if (Array.isArray(rune.sec_eff)) rune.sec_eff.forEach((effect) => addEffect(effect, effects));
  }

  // Artifact main effects are fixed HP, ATK, or DEF additions. Their secondary
  // effects are situational battle effects and therefore do not alter the
  // always-visible monster stat sheet.
  equippedArtifacts(monster).forEach((artifact) => addArtifactMainEffect(artifact, effects));

  Object.entries(runeSetCounts).forEach(([rawSetId, count]) => {
    const bonus = setBonuses[Number(rawSetId)];
    if (bonus) effects[bonus.effect] += Math.floor(count / bonus.pieces) * bonus.value;
  });

  const hpBase = numberValue(monster.con) * 15;
  const atkBase = numberValue(monster.atk);
  const defBase = numberValue(monster.def);
  const spdBase = numberValue(monster.spd);
  return {
    hp: Math.ceil(hpBase * (100 + effects.hpPercent) / 100) + effects.hpFlat,
    atk: Math.ceil(atkBase * (100 + effects.atkPercent) / 100) + effects.atkFlat,
    def: Math.ceil(defBase * (100 + effects.defPercent) / 100) + effects.defFlat,
    spd: Math.ceil(spdBase * (100 + effects.spdPercent) / 100) + effects.spdFlat,
    criticalRate: numberValue(monster.critical_rate) + effects.criticalRate,
    criticalDamage: numberValue(monster.critical_damage) + effects.criticalDamage,
    resistance: numberValue(monster.resist) + effects.resistance,
    accuracy: numberValue(monster.accuracy) + effects.accuracy,
  };
}

/**
 * What a copy's display speed is made of, for Speed Tuning: the base speed, and
 * whether a four-piece Swift set is worn. The display speed itself is the stat
 * sheet's own figure, so it can never disagree with the Monsters page.
 */
export function monsterSpeedParts(monster: RecordLike): { baseSpeed: number; swift: boolean; displaySpeed: number } {
  const swiftPieces = equippedRunes(monster).filter((rune) => numberValue(rune.set_id) === 3).length;
  return {
    baseSpeed: numberValue(monster.spd),
    swift: swiftPieces >= setBonuses[3].pieces,
    displaySpeed: calculateMonsterTotals(monster).spd,
  };
}

/**
 * The eleven figures a copy can be measured against: its eight stats under the
 * names a target is stated in, plus the three composites derived from them.
 *
 * It exists so that the overlay's reference column and the shortfall check read
 * one answer. Two call sites deriving DMG separately is how one screen comes to
 * say a target is met while the other says it is not — and the composites are
 * derived here rather than stored precisely so that cannot happen
 * (`AGENTS.md` §6). The truncation is `RUNE-PRESET-METRICS.md`'s display rule,
 * so a figure compared here is the figure the user was shown.
 */
export function monsterTargetFigures(totals: MonsterTotals): {
  hp: number; atk: number; def: number; spd: number;
  criRate: number; criDmg: number; res: number; acc: number;
  dmg: number; ehp: number; ehpD: number;
} {
  const metrics = calculateRunePotentialMetrics({
    atk: totals.atk,
    hp: totals.hp,
    def: totals.def,
    criticalRate: totals.criticalRate,
    criticalDamage: totals.criticalDamage,
  });
  return {
    hp: totals.hp,
    atk: totals.atk,
    def: totals.def,
    spd: totals.spd,
    criRate: totals.criticalRate,
    criDmg: totals.criticalDamage,
    res: totals.resistance,
    acc: totals.accuracy,
    dmg: displayRunePotentialMetric(metrics.dmg),
    ehp: displayRunePotentialMetric(metrics.ehp),
    ehpD: displayRunePotentialMetric(metrics.ehpD),
  };
}
