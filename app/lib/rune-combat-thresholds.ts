import { fastestEnemyOn, highestEnemyStatInFinalWaveOn, highestEnemyStatOn } from './pve-stages';
import type { PveFloor } from './pve-stages';
import type { StatKey } from './stat-labels';

export type CombatThresholdPoint = {
  value: number;
  relation: 'at-least' | 'greater-than';
  effect: string;
};

export type CombatThreshold = {
  masterId: string;
  stat: Extract<StatKey, 'hp' | 'atk' | 'def' | 'spd'>;
  points: readonly CombatThresholdPoint[];
  reference?: string;
};

type ThresholdRow = Omit<CombatThreshold, 'masterId'>;
type ThresholdReader = (floor: PveFloor) => readonly ThresholdRow[];

const exact = (stat: CombatThreshold['stat'], value: number, effect: string): ThresholdRow => ({
  stat, points: [{ value, relation: 'at-least', effect }],
});

const aboveEnemyStat = (floor: PveFloor, enemyStat: 'hp' | 'attack' | 'defense', stat: CombatThreshold['stat'], effect: string): ThresholdRow[] => {
  const highest = highestEnemyStatOn(floor, enemyStat);
  return highest === undefined ? [] : [exact(stat, Math.floor(highest) + 1, effect)];
};

const aboveEnemySpeed = (floor: PveFloor, effect: string): ThresholdRow[] => {
  const fastest = fastestEnemyOn(floor);
  return fastest === undefined ? [] : [{
    stat: 'spd', points: [{ value: fastest, relation: 'greater-than', effect }],
  }];
};

const atSpeedGap = (floor: PveFloor, gap: number, effect: string, finalWave = false): ThresholdRow[] => {
  const enemySpeed = finalWave
    ? highestEnemyStatInFinalWaveOn(floor, 'speed')
    : fastestEnemyOn(floor);
  return enemySpeed === undefined ? [] : [exact('spd', Math.ceil(enemySpeed + gap), effect)];
};

const atDefenseRatio = (floor: PveFloor, ratio: number, effect: string): ThresholdRow[] => {
  const highest = highestEnemyStatOn(floor, 'defense');
  return highest === undefined ? [] : [exact('def', Math.ceil(highest / ratio), effect)];
};

const aboveHalfEnemyDefense = (floor: PveFloor, effect: string): ThresholdRow[] => {
  const highest = highestEnemyStatOn(floor, 'defense');
  return highest === undefined ? [] : [exact('def', Math.floor(highest * 2) + 1, effect)];
};

const atAttackRatio = (floor: PveFloor, ratio: number, effect: string): ThresholdRow[] => {
  const highest = highestEnemyStatOn(floor, 'defense');
  return highest === undefined ? [] : [exact('atk', Math.ceil(highest / ratio), effect)];
};

const readers = new Map<string, ThresholdReader>();
const intrinsicThresholds = new Map<string, readonly ThresholdRow[]>();
function register(ids: readonly string[], read: ThresholdReader) {
  for (const id of ids) readers.set(id, read);
}

intrinsicThresholds.set('11031', [{
  stat: 'def',
  points: [
    { value: 2501, relation: 'at-least', effect: 'Skill 2 can include 2 allies in the team-up.' },
    { value: 3301, relation: 'at-least', effect: 'Skill 2 can include 3 allies, its maximum team-up.' },
  ],
}]);

register(['14401', '14411'], (floor) => atDefenseRatio(floor, 0.5,
  'Skill 3 cannot glance when the enemy DEF is at most half your combat DEF. This clears the floor\'s highest enemy DEF.'));
register(['14505', '14515'], (floor) => aboveEnemyStat(floor, 'defense', 'atk',
  'The passive guarantees a critical hit when your combat ATK is greater than the enemy DEF. This clears the floor\'s highest enemy DEF.'));
register(['14601', '14611', '14603', '14613', '14604', '14614'], (floor) => aboveEnemySpeed(floor,
  'Skill 2 always crits when your combat SPD is greater than the target\'s, and damage rises with the speed gap. This clears the floor\'s fastest enemy.'));
register(['16513'], (floor) => aboveHalfEnemyDefense(floor,
  'Skill 3 ignores DEF when target DEF is lower than half your combat DEF. This clears the floor\'s highest enemy DEF.'));
register(['16533'], (floor) => {
  const highest = highestEnemyStatOn(floor, 'defense');
  return highest === undefined ? [] : [exact('def', Math.ceil(highest * 2),
    'Second Awakening Skill 3 ignores DEF when target DEF is half or less than your combat DEF. This clears the floor\'s highest enemy DEF.')];
});
register(['20804', '20814'], (floor) => aboveEnemyStat(floor, 'hp', 'hp',
  'Skill 3 adds 2 attacks when target MAX HP is lower than your combat HP and the target has a harmful effect. This clears the floor\'s highest enemy HP.'));
register(['23513'], (floor) => [
  ...aboveEnemyStat(floor, 'defense', 'atk',
    'Skill 3 applies Defense Break when target DEF is lower than your combat ATK. This clears the floor\'s highest enemy DEF.'),
  ...aboveEnemySpeed(floor,
    'Skill 3 decreases Attack Bar by 75% when target combat SPD is lower than yours. This clears the floor\'s fastest enemy.'),
]);
register(['18504', '18514'], (floor) => aboveEnemySpeed(floor,
  'Skill 3 damage increases with the combat SPD gap over the target. This clears the floor\'s fastest enemy.'));
register(['23501', '23502', '23503', '23504', '23505', '23511', '23512', '23514', '23515',
  '23601', '23602', '23603', '23604', '23605', '23611', '23612', '23613', '23614', '23615'], (floor) => aboveEnemySpeed(floor,
  'Skill 2 damage increases with the combat SPD gap over the target. This clears the floor\'s fastest enemy.'));
register(['32201', '32203', '32205', '32211', '32213', '32215',
  '32901', '32903', '32905', '32911', '32913', '32915'], (floor) => aboveEnemySpeed(floor,
  'Skill 2 damage increases with the combat SPD gap over the target. This clears the floor\'s fastest enemy.'));
register(['24012', '24512'], (floor) => aboveEnemyStat(floor, 'attack', 'atk',
  'The passive\'s Glancing Hit chance starts increasing when enemy ATK falls below your combat ATK; the chance scales with the difference. This clears the floor\'s highest enemy ATK.'));
register(['24414', '24914'], (floor) => atSpeedGap(floor, 150,
  'The passive reaches its full damage bonus at +150 combat SPD over the target. This clears the floor\'s fastest enemy.'));
register(['26102', '26112', '26103', '26105', '26115'], (floor) => atAttackRatio(floor, 0.6,
  'Skill 2 ignores DEF when target DEF is 60% or less of your combat ATK. This clears the floor\'s highest enemy DEF.'));
register(['26113'], (floor) => [
  ...atAttackRatio(floor, 0.6,
    'Skill 2 ignores DEF when target DEF is 60% or less of your combat ATK. This clears the floor\'s highest enemy DEF.'),
  ...atSpeedGap(floor, 50,
    'The passive reaches its full damage and Glancing Hit bonuses at +50 combat SPD over the target. This clears the floor\'s fastest enemy.'),
]);
register(['30102', '30112'], (floor) => [
  ...aboveEnemyStat(floor, 'attack', 'atk',
    'Skill 3 cannot be resisted when enemy ATK is lower than your combat ATK. This clears the floor\'s highest enemy ATK.'),
  ...aboveEnemyStat(floor, 'defense', 'def',
    'Skill 3 cannot glance when enemy DEF is lower than your combat DEF. This clears the floor\'s highest enemy DEF.'),
]);
register(['30303', '30313', '30903', '30913'], (floor) => atDefenseRatio(floor, 0.4,
  'Skill 3 adds 1 turn of Provoke when target DEF is 40% or less of your combat DEF. This clears the floor\'s highest enemy DEF.'));
register(['33103', '33113', '33603', '33613'], (floor) => aboveEnemyStat(floor, 'attack', 'atk',
  'Skill 3 adds damage when your combat ATK is higher than target ATK. This clears the floor\'s highest enemy ATK.'));
register(['34112'], (floor) => atSpeedGap(floor, 200,
  'In boss battles, the passive reaches full DEF ignore at +200 combat SPD over the final-wave boss.', true));
register(['34115'], (floor) => aboveEnemySpeed(floor,
  'Skill 3 damage increases with the combat SPD gap over the target. This clears the floor\'s fastest enemy.'));
register(['29711'], (floor) => [
  ...aboveEnemySpeed(floor,
    'The passive guarantees a critical hit when your combat SPD is greater than the target\'s. This clears the floor\'s fastest enemy.'),
  ...atSpeedGap(floor, 126,
    'Skill 2 reaches full DEF ignore at +126 combat SPD over the target. This clears the floor\'s fastest enemy.'),
]);
register(['29713', '29714'], (floor) => atSpeedGap(floor, 126,
  'Skill 2 reaches full DEF ignore at +126 combat SPD over the target. This clears the floor\'s fastest enemy.'));

/**
 * Numeric breakpoints that can be stated exactly for this floor. Continuous
 * scaling and skill text without a verified numeric breakpoint stay out rather
 * than implying a cap the game has not established.
 */
export function combatThresholdsForMonster(masterId: string | undefined, floor: PveFloor | undefined): readonly CombatThreshold[] {
  if (!masterId) return [];
  const rows = [
    ...(intrinsicThresholds.get(masterId) ?? []),
    ...(floor?.area === 'necropolis' && floor.name === 'Abyss Hard'
      ? (readers.get(masterId)?.(floor) ?? []).map((row) => ({ ...row, reference: 'Necropolis (Abyss Hard)' }))
      : []),
  ];
  const grouped = new Map<CombatThreshold['stat'], ThresholdRow>();
  for (const row of rows) {
    const current = grouped.get(row.stat);
    if (!current) {
      grouped.set(row.stat, row);
      continue;
    }
    const points = [...current.points];
    for (const point of row.points) {
      const same = points.findIndex((entry) => entry.value === point.value && entry.relation === point.relation);
      if (same < 0) points.push(point);
      else points[same] = { ...points[same], effect: `${points[same].effect} ${point.effect}` };
    }
    grouped.set(row.stat, { ...current, points });
  }
  return [...grouped.values()]
    .sort((left, right) => ['hp', 'atk', 'def', 'spd'].indexOf(left.stat) - ['hp', 'atk', 'def', 'spd'].indexOf(right.stat))
    .map((row) => ({ ...row, masterId }));
}
