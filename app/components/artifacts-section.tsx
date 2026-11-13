import { WorkspacePage } from './workspace-page';
import { Disclosure, PageHeader } from './page-chrome';
import { CheckboxRow, OptionCard, RadioLine } from './form-controls';
import { ArtifactMaximumValues } from './artifact-maximum-values';
import { BestArtifactForMonster } from './best-artifact-for-monster';
import { BestMonsterForArtifact } from './best-monster-for-artifact';
import { artifactAcceptableWorthChoices, artifactInsignificantDifferenceRange } from '../ingest/preferences';
import type { ArtifactConversionStoneMode, ArtifactRecalculateMode, ArtifactSettings, GeneralSettings } from '../lib/types';
import type { GameRecord } from '../lib/game-data';
import type { MonsterProfiles } from '../lib/monster-preferences';
import { craftRollAssumptions } from '../lib/rune-craft-items';
import { engravedConversionStoneCounts } from '../lib/artifact-conversion-stones';
import { formatNumber } from '../lib/formatting';
import type { CraftRollAssumption } from '../lib/rune-craft-items';

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

/* Named for what the user does, not for what the program does: "On change" is
   the event they can point at, and "Manually" is the answer they are choosing
   between. The default sits second because it is the quieter of the two. */
const recalculateOptions: Array<{ value: ArtifactRecalculateMode; label: string }> = [
  { value: 'on-change', label: 'On change' },
  { value: 'manual', label: 'Manually' },
];

/* The library is deliberately separate from this workspace: it answers what
   the account owns, while this page will answer what to change. Keeping those
   questions apart leaves the optimizer room for a clear, decision-first draft. */

export function ArtifactsSection({ settings, data, monsters, scenarioProfiles, general, hardwareAcceleration, onUpdate }: {
  settings: ArtifactSettings;
  data: GameRecord | undefined;
  monsters: readonly GameRecord[];
  scenarioProfiles: MonsterProfiles;
  general: GeneralSettings;
  hardwareAcceleration: boolean;
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

  return <WorkspacePage
    header={<PageHeader
      title="Artifact Optimization"
      tagline="An intervention for artifacts in bad relationships." />}
  >
    {!data && <section className="empty-state">
      <h2>Compares artifact effects against the monsters that would gain most from them.</h2>
      <p className="next-step">Import your game data first. Your preferences can be prepared at any time.</p>
    </section>}

    <Disclosure title="Recommendations" sessionKey="artifacts.recommendations">
      {data ? <ArtifactMaximumValues data={data} monsters={monsters} scenarioProfiles={scenarioProfiles} settings={settings} general={general}
        hardwareAcceleration={hardwareAcceleration} /> : <p className="lead">Import your game data first, then ask every artifact where it can shine.</p>}
    </Disclosure>

    <Disclosure title="Best monster for this artifact" sessionKey="artifacts.best-monster">
      {data ? <BestMonsterForArtifact data={data} monsters={monsters} scenarioProfiles={scenarioProfiles} settings={settings} general={general}
        hardwareAcceleration={hardwareAcceleration} /> : <p className="lead">Import your game data first, then find the monster that can make an artifact shine.</p>}
    </Disclosure>

    <Disclosure title="Best artifact for this monster" sessionKey="artifacts.best-artifact">
      {data ? <BestArtifactForMonster data={data} monsters={monsters} scenarioProfiles={scenarioProfiles} settings={settings} general={general}
        hardwareAcceleration={hardwareAcceleration} /> : <p className="lead">Import your game data first, then compare artifacts against one monster at a time.</p>}
    </Disclosure>

    <Disclosure title="Settings" sessionKey="artifacts.settings">
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

        <div className="bar-divide" />

        {/* Last, and on its own: every setting above states what a score means,
            while this one only decides when the tables go and fetch it. */}
        <section className="artifact-scope-box" aria-labelledby="artifact-recalculate-title">
          <h3 id="artifact-recalculate-title">Results</h3>
          <RadioLine<ArtifactRecalculateMode>
            name="artifact-recalculate" legend="Re-calculate"
            options={recalculateOptions}
            current={settings.recalculate}
            onChange={(value) => void onUpdate({ recalculate: value })} />
          <p className="slider-note">
            {settings.recalculate === 'on-change'
              ? 'A calculated table re-runs itself whenever your settings or imported data change, so what you see is always current.'
              : 'A calculated table is kept as it was and marked out of date when something changes, until you ask for it again.'}
          </p>
        </section>
      </div>
    </Disclosure>
  </WorkspacePage>;
}
