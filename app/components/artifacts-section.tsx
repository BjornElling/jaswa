'use client';

import { WorkspacePage } from './workspace-page';
import { Disclosure, PageHeader } from './page-chrome';
import { CheckboxRow, OptionCard } from './form-controls';
import { ArtifactMaximumValues } from './artifact-maximum-values';
import { BestArtifactForMonster } from './best-artifact-for-monster';
import { artifactAcceptableWorthChoices } from '../lib/file-imports';
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

const conversionStoneValueLabels = [
  'None — takes each artifact as it stands today',
  'Average — an ordinary roll, nothing special',
  'Three quarters — a good roll, short of perfect',
  'Maximum — the best the grade allows',
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

  return <WorkspacePage
    header={<PageHeader
      title="Artifact Optimization"
      tagline="That artifact is superb. Just not for the monster wearing it." />}
  >
    {!data && <section className="empty-state">
      <h2>Compares artifact effects against the monsters that would gain most from them.</h2>
      <p className="next-step">Import your game data first. Your preferences can be prepared at any time.</p>
    </section>}

    <Disclosure title="Recommendations" sessionKey="artifacts.recommendations">
      {data ? <ArtifactMaximumValues data={data} monsters={monsters} settings={settings} general={general}
        hardwareAcceleration={hardwareAcceleration} /> : <p className="lead">Import your game data first, then ask every artifact where it can shine.</p>}
    </Disclosure>

    <Disclosure title="Best monster for this artifact" sessionKey="artifacts.best-monster">
      <div className="optimizer-draft">
        <p className="lead">Choose one artifact, then see the monsters that would make the best use of its main and sub properties.</p>
        <p className="optimizer-draft-note">Monster types without property preferences stay out of the ranking instead of being treated as bad fits.</p>
      </div>
    </Disclosure>

    <Disclosure title="Best artifact for this monster" sessionKey="artifacts.best-artifact">
      {data ? <BestArtifactForMonster data={data} monsters={monsters} settings={settings} general={general}
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

        <div className="artifact-conversion-layout">
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
            <div className="slider">
              <label className="slider-label" htmlFor="conversion-stone-value">Roll value</label>
              <p className="slider-note">How much of the maximum possible roll value should be factored into calculated conversions?</p>
              <input id="conversion-stone-value" type="range" min={1} max={conversionStoneValueLabels.length} step={1}
                value={settings.conversionStoneValue}
                onChange={(event) => void onUpdate({ conversionStoneValue: Number(event.target.value) })}
                aria-describedby="conversion-stone-value-choice" />
              <p id="conversion-stone-value-choice" className="slider-choice" aria-live="polite">
                {conversionStoneValueLabels[conversionStoneValueStep]}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Disclosure>
  </WorkspacePage>;
}
