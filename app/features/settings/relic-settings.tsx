import { useMemo } from 'react';
import { Disclosure } from '../../ui/page-chrome';
import { RelicSynergyMap } from './relic-synergy-map';
import { resolveRelicSynergy, relicSynergyBandLabels } from '../../domain/relics/relic-synergy';
import type { RelicSynergyChoices } from '../../domain/relics/relic-synergy';
import {
  isRelicInvestmentSelectivity, relicInvestmentSelectivityLabels, relicInvestmentSelectivityLevels,
  relicMinimumSynergyBands,
} from '../../domain/relics/relic-advice';
import type { RelicInvestmentSelectivity } from '../../domain/relics/relic-advice';

/**
 * What Relic Optimization judges by: how selective to be with power-up stones,
 * and the synergy table every verdict, column and filter there rests on.
 *
 * The threshold once sat among the library's filters, kept for the session
 * only. It never narrowed a row — it changes the verdicts — so it is a setting,
 * saved like the others, and it sits over the table whose bands it gates.
 */
export function RelicSettingsBar({ synergy, powerUpThreshold, onChangeSynergy, onChangePowerUpThreshold }: {
  synergy: RelicSynergyChoices;
  powerUpThreshold: RelicInvestmentSelectivity;
  onChangeSynergy: (choices: RelicSynergyChoices) => void;
  onChangePowerUpThreshold: (threshold: RelicInvestmentSelectivity) => void;
}) {
  const table = useMemo(() => resolveRelicSynergy(synergy), [synergy]);
  const thresholdText = (level: RelicInvestmentSelectivity) => `${relicInvestmentSelectivityLabels[level]} — `
    + `${relicSynergyBandLabels[relicMinimumSynergyBands[level]]} synergy or better`;

  return <Disclosure title="Relics" sessionKey="settings.relics">
    <div className="stack">
      <div className="slider-grid relic-settings-threshold">
        <div className="slider">
          <label className="slider-label" htmlFor="relic-power-up-threshold">Power-up threshold</label>
          <p className="slider-note">How picky should your power-up stones be?</p>
          <input id="relic-power-up-threshold" type="range"
            min={1} max={relicInvestmentSelectivityLevels.length} step={1}
            value={powerUpThreshold}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (isRelicInvestmentSelectivity(value)) onChangePowerUpThreshold(value);
            }}
            aria-valuetext={thresholdText(powerUpThreshold)}
            aria-describedby="relic-power-up-threshold-choice" />
          <p id="relic-power-up-threshold-choice" className="slider-choice" aria-live="polite">
            {thresholdText(powerUpThreshold)}
          </p>
        </div>
      </div>

      <div className="bar-divide" />

      <RelicSynergyMap synergy={table} onChange={onChangeSynergy} />
    </div>
  </Disclosure>;
}
