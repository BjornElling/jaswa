'use client';

import { WorkspacePage } from './workspace-page';
import { Disclosure, PageHeader } from './page-chrome';
import { CheckboxRow, OptionCard } from './form-controls';
import { ArtifactMaximumValues } from './artifact-maximum-values';
import { BestArtifactForMonster } from './best-artifact-for-monster';
import { BestMonsterForArtifact } from './best-monster-for-artifact';
import { artifactAcceptableWorthChoices, artifactInsignificantDifferenceRange } from '../lib/file-imports';
import type { ArtifactConversionStoneMode, ArtifactSettings, GeneralSettings } from '../lib/types';
import type { GameRecord } from '../lib/game-data';

/* The slider's stops are the stored percentages themselves (decision 11), so
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
   holds: a conversion collects two contributions whatever the grade granted
   (`ARTIFACT-CANONICAL.md` §10), so "maximum" is the best a conversion can
   produce rather than the best the artifact could ever have carried. */
const conversionStoneValueLabels = [
  'Minimum — the conversion’s two-roll floor',
  'Average — the midpoint of its possible range',
  'Three quarters — 75 % of the conversion maximum',
  'Maximum — the best a conversion can roll',
] as const;

/* The library is deliberately separate from this workspace: it answers what
   the account owns, while this page will answer what to change. Keeping those
   questions apart leaves the optimizer room for a clear, decision-first draft. */

export function ArtifactsSection({ settings, data, monsters, general, hardwareAcceleration, onUpdate }: {
  settings: ArtifactSettings;
  data: GameRecord | undefined;
  monsters: readonly GameRecord[];
  general: GeneralSettings;
  hardwareAcceleration: boolean;
  onUpdate: (update: Partial<ArtifactSettings>) => void;
}) {
  const step = artifactAcceptableWorthChoices.indexOf(
    settings.acceptableWorth as typeof artifactAcceptableWorthChoices[number],
  );
  const conversionStoneValueStep = settings.conversionStoneValue - 1;
  /* With no conversion assumed the roll value has nothing to describe, so the
     slider dims rather than inviting an answer that changes nothing. */
  const conversionsOff = settings.conversionStoneMode === 'none';

  return <WorkspacePage
    header={<PageHeader
      title="Artifact Optimization"
      tagline="That artifact is superb. Just not for the monster wearing it." />}
  >
    {!data && <section className="empty-state">
      <h2>Compares artifact effects against the monsters that would gain most from them.</h2>
      <p className="next-step">Import your game data first. Your preferences can be prepared at any time.</p>
    </section>}

    <Disclosure title="Recommendations" storageKey="artifacts.recommendations">
      {data ? <ArtifactMaximumValues data={data} monsters={monsters} settings={settings} general={general}
        hardwareAcceleration={hardwareAcceleration} /> : <p className="lead">Import your game data first, then ask every artifact where it can shine.</p>}
    </Disclosure>

    <Disclosure title="Best monster for this artifact" storageKey="artifacts.best-monster">
      {data ? <BestMonsterForArtifact data={data} monsters={monsters} settings={settings} general={general}
        hardwareAcceleration={hardwareAcceleration} /> : <p className="lead">Import your game data first, then find the monster that can make an artifact shine.</p>}
    </Disclosure>

    <Disclosure title="Best artifact for this monster" storageKey="artifacts.best-artifact">
      {data ? <BestArtifactForMonster data={data} monsters={monsters} settings={settings} general={general}
        hardwareAcceleration={hardwareAcceleration} /> : <p className="lead">Import your game data first, then compare artifacts against one monster at a time.</p>}
    </Disclosure>

    <Disclosure title="Settings" storageKey="artifacts.settings">
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
            <h3 id="artifact-scope-title">Monster scope</h3>
            <CheckboxRow label="Only factor in mons you own" checked={settings.onlyFactorInOwnedMonsters}
              onChange={(checked) => void onUpdate({ onlyFactorInOwnedMonsters: checked })} />
            <p className="artifact-scope-note">
              {settings.onlyFactorInOwnedMonsters
                ? 'Only mons in your inventory or storage are included in recommendations.'
                : 'Calculations are based on all mons in the game.'}
            </p>
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
            </OptionCard>
          </div>

          <div className="slider-grid">
            <div className="slider" data-disabled={conversionsOff ? 'true' : undefined}>
              <label className="slider-label" htmlFor="conversion-stone-value">Conversion roll value</label>
              <p className="slider-note">
                How well should a conversion roll be assumed to land? Every choice is measured against
                that property’s own two-roll maximum, whatever the artifact or stone grade.
              </p>
              <input id="conversion-stone-value" type="range" min={1} max={conversionStoneValueLabels.length} step={1}
                value={settings.conversionStoneValue} disabled={conversionsOff}
                onChange={(event) => void onUpdate({ conversionStoneValue: Number(event.target.value) })}
                aria-describedby="conversion-stone-value-choice" />
              <p id="conversion-stone-value-choice" className="slider-choice" aria-live="polite">
                {conversionsOff ? 'No conversion is being assumed.' : conversionStoneValueLabels[conversionStoneValueStep]}
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

          <section className="artifact-scope-box" aria-labelledby="artifact-intangible-title">
            <h3 id="artifact-intangible-title">Intangible artifacts</h3>
            <CheckboxRow label="Include Intangible artifacts" checked={settings.includeIntangibleArtifacts}
              onChange={(checked) => void onUpdate({ includeIntangibleArtifacts: checked })} />
            <p className="artifact-scope-note">
              {settings.includeIntangibleArtifacts
                ? 'Intangible artifacts are judged alongside the class-bound ones everywhere.'
                : 'Intangible artifacts are left out of every recommendation.'}
            </p>
          </section>
        </div>
      </div>
    </Disclosure>
  </WorkspacePage>;
}
