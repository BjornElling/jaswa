/**
 * A normal conversion reaches `ceil(maxRoll × 1.5)`, and its floor is a single
 * minimum roll (`ARTIFACT-CANONICAL.md` §10).
 *
 * The figures below are not derived — they are read off the game's own **Repeat
 * Convert** dialog, captured September 5, 2026, which states the lowest and
 * highest selectable threshold for every property a normal conversion may roll.
 * That makes them primary evidence under §14, outranking any published table,
 * and they are transcribed here so the rule cannot drift back to a guess.
 *
 * Two candidate rules die against this table and must stay dead:
 *   - `maxRoll × 2` overstates every property by about a third
 *   - `minRoll + maxRoll` agrees only where `minRoll` is half of `maxRoll`
 */
import assert from 'node:assert/strict';
import { createVerificationServer as createServer } from './verification-server.mjs';

/* [property id, UI minimum, UI maximum] — both categories of the dialog. */
const observed = [
  [206, 4, 9],   // SPD UP Effect
  [210, 2, 6],   // Bomb Damage
  [214, 2, 6],   // CRIT DMG Taken
  [215, 5, 12],  // Life Drain
  [218, 0.2, 0.5], // Additional Damage by HP — the one property shown in tenths
  [219, 2, 6],   // Additional Damage by ATK
  [220, 2, 6],   // Additional Damage by DEF
  [221, 25, 60], // Additional Damage by SPD
  [222, 4, 9],   // CRIT DMG as enemy HP is more
  [223, 8, 18],  // CRIT DMG as enemy HP is less
  [224, 2, 6],   // Own turn 1-target CRIT DMG
  [225, 2, 6],   // Counterattack/Co-op Attack DMG
  [226, 3, 8],   // ATK/DEF UP Effect
  [300, 3, 8], [301, 3, 8], [302, 3, 8], [303, 3, 8], [304, 3, 8],
  [305, 4, 9], [306, 4, 9], [307, 4, 9], [308, 4, 9], [309, 4, 9],
  [400, 4, 9],   // [Skill 1] CRIT DMG
  [401, 4, 9],   // [Skill 2] CRIT DMG
  [404, 4, 9], [405, 4, 9], [406, 4, 9],       // Recovery
  [407, 4, 9], [408, 4, 9], [409, 4, 9],       // Accuracy
  [410, 4, 9],   // [Skill 3/4] CRIT DMG
  [411, 4, 9],   // First Attack CRIT DMG
];

const server = await createServer({ configFile: false, server: { middlewareMode: true } });

try {
  const { artifactProperty, artifactNormalConversionMaximum } =
    await server.ssrLoadModule('/app/lib/artifact-properties.ts');

  /* Every property floors at the dialog's minimum, Bomb Damage included. Its
     pre-v6.2.0 lines at 1 once held its floor down while `minRoll` doubled as
     an import gate; no range gates an import any more, so the definition
     carries today's table. */
  for (const [id, uiMinimum, uiMaximum] of observed) {
    const property = artifactProperty(id);
    assert.ok(property, `property ${id} must be defined`);
    assert.equal(property.minRoll, uiMinimum,
      `property ${id} floors at one minimum roll, which the dialog puts at ${uiMinimum}`);
    assert.equal(artifactNormalConversionMaximum(property), uiMaximum,
      `property ${id} converts up to ${uiMaximum}, the dialog's highest threshold`);
  }

  /* The rejected models, stated as the failures they are rather than left
     implicit: if either ever returns the observed table again, it means the
     ceiling silently moved back. */
  const lifeDrain = artifactProperty(215);
  assert.equal(artifactNormalConversionMaximum(lifeDrain), 12, 'Life Drain converts to 12');
  assert.notEqual(lifeDrain.maxRoll * 2, 12, 'maxRoll × 2 (16) is not the normal-conversion ceiling');
  assert.notEqual(lifeDrain.minRoll + lifeDrain.maxRoll, 12, 'minRoll + maxRoll (13) is not it either');

  /* `[Skill 2] CRIT DMG` rolls 4–6 like every other skill line. Its lines above
     6 in the account all carry no power-up and are converted lines, which a
     conversion's 4–9 explains; widening the roll to 7 for them cost every
     Skill 2 line a seventh of its score. */
  const skillTwoCritDamage = artifactProperty(401);
  assert.equal(skillTwoCritDamage.maxRoll, 6, 'a Skill 2 CRIT DMG roll tops out at 6, as every skill line does');

  /* Engraved conversion stones share this ceiling rather than exceeding it: the
     stones' own tooltips, captured September 5, 2026, name a range whose maximum
     is exactly `ceil(maxRoll × 1.5)` on every grade sampled, while the grade
     raises only the floor (§15.12). A Legend stone is a *safer* conversion, not
     a stronger one, so no engraved line can explain a value above this. */
  const engravedStoneMaxima = [
    [215, 12], // Legend Life Drain            8~12
    [223, 18], // Legend CD+ as less enemy HP 12~18
    [210, 6],  // Legend Bomb DMG              4~6
    [406, 9],  // Legend [Skill 3] Recovery    7~9
    [410, 9],  // Legend [Skill 3/4] CRIT DMG  7~9
    [407, 9],  // Legend [Skill 1] Accuracy    7~9
    [219, 6],  // Rare   Add'l DMG by ATK      2~6
  ];
  for (const [id, stoneMaximum] of engravedStoneMaxima) {
    assert.equal(artifactNormalConversionMaximum(artifactProperty(id)), stoneMaximum,
      `property ${id}: an engraved stone tops out at the normal-conversion ceiling, not above it`);
  }

  /* Rounding lands on the property's display step, and the two properties whose
     1.5× falls off it are the proof that it rounds up rather than truncating. */
  assert.equal(artifactNormalConversionMaximum(artifactProperty(226)), 8, '3–5 rounds 7.5 up to 8');
  assert.equal(artifactNormalConversionMaximum(artifactProperty(218)), 0.5, '0.2–0.3 rounds 0.45 up to 0.5');

  console.log(`A normal conversion reaches ceil(maxRoll × 1.5) on all ${observed.length} properties the dialog names.`);
} finally {
  await server.close();
}
