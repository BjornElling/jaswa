import { Disclosure } from '../../ui/page-chrome';
import { CheckboxRow, OptionCard } from '../../ui/form-controls';
import { artifactAcceptableWorthChoices, artifactInsignificantDifferenceRange } from '../../domain/profiles/preference-defaults';
import type { ArtifactConversionStoneMode, ArtifactSettings, GeneralSettings } from '../../domain/model';
import type { GameRecord } from '../../domain/account/game-record';
import { craftRollAssumptions } from '../../domain/runes/craft/rune-craft-items';
import { engravedConversionStoneCounts } from '../../domain/artifacts/artifact-conversion-stones';
import { formatNumber } from '../../domain/shared/formatting';
import type { CraftRollAssumption } from '../../domain/runes/craft/rune-craft-items';

/* The slider's stops are the stored percentages themselves
   (`ARTIFACT-CANONICAL.md` §19.6), so
   the label a user reads and the factor the judgement multiplies by are one
   value. Indexed by position in `artifactAcceptableWorthChoices`. */
const acceptableWorthLabels = [
  'Preferred or nothing — 0 %',
  'A grudging nod — 25 %',
  'Half credit, fair’s fair — 50 %',
  'Nearly as good, honestly — 75 %',
  'Why did I even rank them — 100 %',
] as const;

/* The slider names what a *conversion roll* reaches, not what an artifact
   holds: a conversion is worth one and a half rolls whatever the grade granted
   (`ARTIFACT-CANONICAL.md` §10), so "maximum" is the best a conversion can
   produce rather than the best the artifact could ever have carried. */
const conversionRollLabels: Readonly<Record<CraftRollAssumption, string>> = {
  minimum: 'Minimum — the lowest a conversion can roll',
  'one-third': 'One third — 33 % of the conversion maximum',
  average: 'Average — the midpoint of its possible range',
  'two-thirds': 'Two thirds — 67 % of the conversion maximum',
  'three-quarters': 'Three quarters — 75 % of the conversion maximum',
  maximum: 'Maximum — the best a conversion can roll',
};

/**
 * How every artifact view judges: one settings object, read through
 * `scoringSettings()` by the recommendations, both best-for views, the
 * library's score and the monster overlay alike (AGENTS.md §6). It sits on
 * Settings because it reaches all of them, not only Artifact Optimization.
 */
export function ArtifactSettingsBar({ settings, data, general, onUpdate }: {
  settings: ArtifactSettings;
  data: GameRecord | undefined;
  general: GeneralSettings;
  onUpdate: (update: Partial<ArtifactSettings>) => void;
}) {
  const step = artifactAcceptableWorthChoices.indexOf(
    settings.acceptableWorth as typeof artifactAcceptableWorthChoices[number],
  );
  const conversionRollStep = craftRollAssumptions.indexOf(settings.conversionRoll);
  /* With no conversion assumed the roll value has nothing to describe, so the
     slider dims rather than inviting an answer that changes nothing. */
  const conversionsOff = settings.conversionStoneMode === 'none';
  /* Every stone the account owns is counted here, the ones naming a property
     v8.0.0 retired included: the game still lets them be used, so leaving them
     out would understate what the user holds, while valuing them would credit
     a conversion to a property no monster wants. */
  const stoneCounts = engravedConversionStoneCounts(data);

  return <Disclosure title="Artifacts" sessionKey="settings.artifacts">
    <div className="stack">
      <div className="artifact-general-layout">
        <div className="slider">
          <label className="slider-label" htmlFor="acceptable-worth">Acceptable stats ctr. preferred</label>
          <p className="slider-note">What is second choice worth against first choice?</p>
          <input id="acceptable-worth" type="range"
            min={1} max={artifactAcceptableWorthChoices.length} step={1}
            value={step + 1}
            onChange={(event) => void onUpdate({
              acceptableWorth: artifactAcceptableWorthChoices[Number(event.target.value) - 1],
            })}
            aria-describedby="acceptable-worth-choice" />
          <p id="acceptable-worth-choice" className="slider-choice" aria-live="polite">
            {acceptableWorthLabels[step]}
          </p>
        </div>

        <section className="artifact-scope-box" aria-labelledby="artifact-scope-title">
          <h3 id="artifact-scope-title">Monster</h3>
          <CheckboxRow label="Only factor in mons you own" checked={settings.onlyFactorInOwnedMonsters}
            onChange={(checked) => void onUpdate({ onlyFactorInOwnedMonsters: checked })} />
          <CheckboxRow label="Only factor in Lv. 40 mons" checked={settings.onlyLevel40Monsters}
            onChange={(checked) => void onUpdate({ onlyLevel40Monsters: checked })} />
          <h3 className="artifact-scope-subheading">Artifacts</h3>
          <CheckboxRow label="Include Intangible artifacts" checked={settings.includeIntangibleArtifacts}
            onChange={(checked) => void onUpdate({ includeIntangibleArtifacts: checked })} />
        </section>
      </div>

      <div className="bar-divide" />

      {/* One box, because these four controls answer one question: how much
          conversion to assume. Splitting the sources from the roll value read
          as two unrelated settings, and the slider only means anything once a
          source has been chosen. */}
      <section className="artifact-conversion-layout artifact-conversion-box" aria-labelledby="artifact-conversion-title">
        <h3 id="artifact-conversion-title" className="artifact-conversion-title">Conversions</h3>
        <p className="artifact-conversion-intro">
          How much credit an artifact gets for a conversion it has not had yet.
        </p>
        <div className="import-routes" role="radiogroup" aria-label="How to handle conversion stones">
          <OptionCard
            option="No conversion"
            name="Keep it real"
            namePlacement="body"
            radioName="artifact-conversion-stone-mode"
            value="none"
            current={settings.conversionStoneMode}
            onChoose={(value) => void onUpdate({ conversionStoneMode: value as ArtifactConversionStoneMode })}
          >
            <p className="lead">
              Do not factor in any conversion; use artifacts exactly as they appear today.
            </p>
          </OptionCard>

          <div className="settings-rule" role="presentation" />

          <OptionCard
            option="Conversion stones"
            name="Fixed range"
            namePlacement="body"
            radioName="artifact-conversion-stone-mode"
            value="theoretical"
            current={settings.conversionStoneMode}
            onChoose={(value) => void onUpdate({ conversionStoneMode: value as ArtifactConversionStoneMode })}
          >
            <p className="lead">
              Each conversion is assigned a calculated value from the fixed conversion range (unless a better value has already been rolled).
            </p>
          </OptionCard>

          <div className="settings-rule" role="presentation" />

          <OptionCard
            option="Engraved conversion stones"
            name="Use what you’ve got"
            namePlacement="body"
            radioName="artifact-conversion-stone-mode"
            value="owned"
            current={settings.conversionStoneMode}
            onChoose={(value) => void onUpdate({ conversionStoneMode: value as ArtifactConversionStoneMode })}
          >
            <p className="lead">
              Potential conversion gains are based on engraved conversion stones you own (unless a better value has already been rolled).
            </p>
            {stoneCounts && <p className="lead">
              {`You own ${formatNumber(stoneCounts.valued + stoneCounts.notValued, general)} engraved conversion stones.`}
              {stoneCounts.notValued > 0
                && ` ${formatNumber(stoneCounts.notValued, general)} of them name a retired property, so they are counted but not valued.`}
            </p>}
          </OptionCard>
        </div>

        <div className="slider-grid">
          <div className="slider" data-disabled={conversionsOff ? 'true' : undefined}>
            <label className="slider-label" htmlFor="conversion-stone-value">Conversion roll value</label>
            <p className="slider-note">
              How well should a conversion roll be assumed to land? Every choice is measured against
              that property’s own conversion maximum, whatever the artifact or stone grade.
            </p>
            <input id="conversion-stone-value" type="range" min={1} max={craftRollAssumptions.length} step={1}
              value={conversionRollStep + 1} disabled={conversionsOff}
              onChange={(event) => {
                const choice = craftRollAssumptions[Number(event.target.value) - 1];
                if (choice) void onUpdate({ conversionRoll: choice });
              }}
              aria-describedby="conversion-stone-value-choice" />
            <p id="conversion-stone-value-choice" className="slider-choice" aria-live="polite">
              {conversionsOff ? 'No conversion is being assumed.' : conversionRollLabels[settings.conversionRoll]}
            </p>
          </div>
        </div>
      </section>

      <div className="bar-divide" />

      <div className="artifact-general-layout">
        {/* The threshold slider keeps its track and its label in every state
            and only dims, so enabling the rule does not move the box beneath
            it. Its stored value survives the switch, so turning the rule off
            and on again returns the band the user chose. */}
        <div className="slider" data-disabled={settings.ignoreInsignificantDifferences ? undefined : 'true'}>
          <CheckboxRow label="Ignore differences smaller than" checked={settings.ignoreInsignificantDifferences}
            onChange={(checked) => void onUpdate({ ignoreInsignificantDifferences: checked })} />
          <p className="slider-note">
            Below this, two results count as the same and no move is recommended.
          </p>
          <input id="insignificant-difference" type="range"
            min={artifactInsignificantDifferenceRange.minimum} max={artifactInsignificantDifferenceRange.maximum} step={1}
            value={settings.insignificantDifference} disabled={!settings.ignoreInsignificantDifferences}
            aria-label="Smallest difference worth acting on, in percentage points"
            onChange={(event) => void onUpdate({ insignificantDifference: Number(event.target.value) })}
            aria-describedby="insignificant-difference-choice" />
          <p id="insignificant-difference-choice" className="slider-choice" aria-live="polite">
            {settings.ignoreInsignificantDifferences
              ? `${settings.insignificantDifference} percentage points`
              : 'Every difference counts.'}
          </p>
        </div>
      </div>
    </div>
  </Disclosure>;
}
