import assert from 'node:assert/strict';
import { areaFacts } from '../app/lib/area-facts.ts';
import { combatThresholdsForMonster } from '../app/lib/rune-combat-thresholds.ts';
import { presetContents } from '../app/lib/preset-contents.ts';
import { fastestEnemySpeed, speedContent, dungeonIds } from '../app/lib/speed-contents.ts';
import { usefulAccuracy } from '../app/lib/accuracy-ceiling.ts';
import { hardestPveFloor, pveAreaOf, pveFloors, fastestEnemyOn, highestEnemyStatOn, highestEnemyStatInFinalWaveOn, highestResistanceOn } from '../app/lib/pve-stages.ts';

const necropolis = hardestPveFloor('necropolis');
assert.equal(necropolis?.name, 'Abyss Hard');

function row(masterId, stat) {
  const result = combatThresholdsForMonster(masterId, necropolis).find((entry) => entry.stat === stat);
  assert.ok(result, `${masterId} must have a ${stat} threshold row`);
  return result;
}

function values(masterId, stat) {
  return row(masterId, stat).points.map(({ value, relation }) => [value, relation]);
}

assert.deepEqual(values('11031', 'def'), [[2501, 'at-least'], [3301, 'at-least']]);
assert.deepEqual(values('34112', 'spd'), [[309, 'at-least']]);
assert.deepEqual(values('29711', 'spd'), [[169, 'greater-than'], [295, 'at-least']]);
assert.deepEqual(values('16513', 'def'), [[4359, 'at-least']]);
assert.deepEqual(values('16533', 'def'), [[4358, 'at-least']]);
assert.deepEqual(values('26113', 'atk'), [[3632, 'at-least']]);
assert.deepEqual(values('26113', 'spd'), [[219, 'at-least']]);
assert.deepEqual(values('23513', 'spd'), [[169, 'greater-than']]);
assert.deepEqual(values('20814', 'hp'), [[172921, 'at-least']]);
assert.deepEqual(combatThresholdsForMonster('11031', hardestPveFloor('dragons')).map(({ stat, points }) => [
  stat, points.map(({ value, relation }) => [value, relation]),
]), [['def', [[2501, 'at-least'], [3301, 'at-least']]]]);
assert.deepEqual(combatThresholdsForMonster('11031', undefined).map(({ stat, points }) => [
  stat, points.map(({ value, relation }) => [value, relation]),
]), [['def', [[2501, 'at-least'], [3301, 'at-least']]]]);
assert.deepEqual(combatThresholdsForMonster('11011', necropolis), []);
assert.deepEqual(combatThresholdsForMonster('10131', necropolis), []);

const general = { numberFormat: 'american', dateOrder: 'system', hourCycle: 'system', timeZone: 'system', manualTimeZone: '' };
// Exercise every content, including missing stage data, through both preset kinds.
for (const content of [null, ...presetContents]) {
  const area = pveAreaOf(content?.id);
  const floor = area === undefined ? undefined : hardestPveFloor(area);
  for (const kind of ['game', 'own']) {
    const preset = { kind, content };
    assert.deepEqual(areaFacts(preset, general, '11031').thresholds[0]?.points.map(({ value }) => value), [2501, 3301]);
    for (const masterId of ['34112', '29711', '16513', '26113', '20814', '30112']) {
      const expected = combatThresholdsForMonster(masterId, floor).map((row) => ({
        ...row, reference: `${content.name} (${floor.name})`,
      }));
      assert.deepEqual(areaFacts(preset, general, masterId).thresholds, expected, `${kind} ${content?.id} ${masterId}`);
    }
  }
  // Scenario never takes enemies from a content accidentally attached to it.
  assert.deepEqual(areaFacts({ kind: 'scenario', content }, general, '34112').thresholds, []);
  if (!area) continue;
  for (const ownFloor of pveFloors(area)) {
    const points = (id, stat) => combatThresholdsForMonster(id, ownFloor).find((row) => row.stat === stat)?.points.map(({ value }) => value);
    const speed = fastestEnemyOn(ownFloor);
    const bossSpeed = highestEnemyStatInFinalWaveOn(ownFloor, 'speed');
    const hp = highestEnemyStatOn(ownFloor, 'hp');
    const defense = highestEnemyStatOn(ownFloor, 'defense');
    const attack = highestEnemyStatOn(ownFloor, 'attack');
    assert.deepEqual(points('29711', 'spd'), speed === undefined ? undefined : [speed, Math.ceil(speed + 126)]);
    assert.deepEqual(points('34112', 'spd'), bossSpeed === undefined ? undefined : [Math.ceil(bossSpeed + 200)]);
    assert.deepEqual(points('20814', 'hp'), hp === undefined ? undefined : [Math.floor(hp) + 1]);
    assert.deepEqual(points('16513', 'def'), defense === undefined ? undefined : [Math.floor(defense * 2) + 1]);
    assert.deepEqual(points('30112', 'atk'), attack === undefined ? undefined : [Math.floor(attack) + 1]);
  }
}
assert.deepEqual(areaFacts(undefined, general, '34112').thresholds, []);
assert.deepEqual(areaFacts(undefined, general).thresholds, []);
assert.deepEqual(combatThresholdsForMonster('34112', undefined), []);
for (const id of dungeonIds) {
  const floor = hardestPveFloor(id);
  assert.equal(fastestEnemySpeed(id), fastestEnemyOn(floor));
  assert.equal(usefulAccuracy(id), Math.max(0, highestResistanceOn(floor) - 15));
  assert.equal(speedContent(id).floorName, floor.name);
  assert.deepEqual(speedContent(id).stages.map((stage) => stage.speeds), floor.waves.map((wave) => wave.map((enemy) => enemy.speed)));
}
console.log('Every preset uses its own PvE area; thresholds follow every documented floor, missing stats stay unknown, and intrinsic breakpoints survive without enemies.');
