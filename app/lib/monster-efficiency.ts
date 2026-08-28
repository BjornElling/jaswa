import { calculateRuneEfficiency, type RuneEffect } from './rune-potential-metrics';

type RecordLike = Record<string, unknown>;

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Converts the export shape only after checking every value the efficiency
 * formula reads. A broken rune stays visible in the roster, but cannot make a
 * monster look as though its average were known.
 */
function runeEffect(value: unknown): RuneEffect | undefined {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const effectId = finiteNumber(value[0]);
  const effectValue = finiteNumber(value[1]);
  if (effectId === undefined || effectValue === undefined) return undefined;
  const gemMarker = value[2] === undefined ? undefined : finiteNumber(value[2]);
  const grindValue = value[3] === undefined ? undefined : finiteNumber(value[3]);
  if (value[2] !== undefined && gemMarker === undefined) return undefined;
  if (value[3] !== undefined && grindValue === undefined) return undefined;
  return [effectId, effectValue, gemMarker, grindValue];
}

function optionalRuneEffect(value: unknown): RuneEffect | null | undefined {
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return null;
  return runeEffect(value);
}

function runeEfficiency(rune: RecordLike): number | null {
  const runeClass = finiteNumber(rune.class);
  const priEff = runeEffect(rune.pri_eff);
  const secEff = Array.isArray(rune.sec_eff)
    ? rune.sec_eff.map(runeEffect)
    : undefined;
  const prefixEff = optionalRuneEffect(rune.prefix_eff);
  if (runeClass === undefined || priEff === undefined || !secEff?.every(Boolean) || prefixEff === undefined) return null;

  return calculateRuneEfficiency({
    class: runeClass,
    priEff,
    prefixEff,
    secEff: secEff as RuneEffect[],
  });
}

/** The roster shows the documented average of the six equipped runes. */
export function calculateMonsterEfficiency(monster: RecordLike): number | null {
  if (!Array.isArray(monster.runes) || monster.runes.length !== 6) return null;
  const values = monster.runes
    .filter((rune): rune is RecordLike => Boolean(rune) && typeof rune === 'object' && !Array.isArray(rune))
    .map(runeEfficiency);
  if (values.length !== 6 || values.some((value) => value === null)) return null;
  const validValues = values.filter((value): value is number => value !== null);
  return validValues.reduce((total, value) => total + value, 0) / validValues.length;
}
