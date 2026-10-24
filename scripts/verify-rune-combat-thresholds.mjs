import assert from 'node:assert/strict';
import { combatThresholdsForMonster } from '../app/lib/rune-combat-thresholds.ts';
import { hardestPveFloor } from '../app/lib/pve-stages.ts';

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
assert.deepEqual(combatThresholdsForMonster('11031', hardestPveFloor('dragons')), []);
assert.deepEqual(combatThresholdsForMonster('11011', necropolis), []);
assert.deepEqual(combatThresholdsForMonster('10131', necropolis), []);

console.log('Rune combat thresholds match the Necropolis Abyss Hard combat-stat breakpoints.');
