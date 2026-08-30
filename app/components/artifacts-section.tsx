'use client';

import { WorkspacePage } from './workspace-page';
import { Disclosure, PageHeader } from './page-chrome';
import { artifactAcceptableWorthChoices, itemGrades } from '../lib/file-imports';
import type { ArtifactSettings, ItemGrade } from '../lib/types';

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

/* The library is deliberately separate from this workspace: it answers what
   the account owns, while this page will answer what to change. Keeping those
   questions apart leaves the optimizer room for a clear, decision-first draft. */

export function ArtifactsSection({ settings, hasGame, onUpdate }: {
  settings: ArtifactSettings;
  hasGame: boolean;
  onUpdate: (update: Partial<ArtifactSettings>) => void;
}) {
  const step = artifactAcceptableWorthChoices.indexOf(
    settings.acceptableWorth as typeof artifactAcceptableWorthChoices[number],
  );

  return <WorkspacePage
    header={<PageHeader
      title="Artifact Optimization"
      tagline="That artifact is superb. Just not for the monster wearing it." />}
  >
    {!hasGame && <section className="empty-state">
      <h2>Compares artifact effects against the monsters that would gain most from them.</h2>
      <p className="next-step">Import your game data first. Your preferences can be prepared at any time.</p>
    </section>}

    <Disclosure title="Recommendations">
      <div className="optimizer-draft">
        <p className="lead">
          The swaps worth making across the account, ordered by how much better the receiving monster fits the artifact.
        </p>
        <div className="optimizer-draft-columns" aria-label="Recommendation draft columns">
          <span>Current home</span>
          <span>Better candidate</span>
          <span>Gain</span>
        </div>
        <p className="optimizer-draft-note">
          Import a game file and set monster roles to turn this draft into a ranked move list.
        </p>
      </div>
    </Disclosure>

    <Disclosure title="Best monster for this artifact">
      <div className="optimizer-draft">
        <p className="lead">Choose one artifact, then see the monsters that would make the best use of its main and sub properties.</p>
        <p className="optimizer-draft-note">Monster types without property preferences stay out of the ranking instead of being treated as bad fits.</p>
      </div>
    </Disclosure>

    <Disclosure title="Best artifact for this monster">
      <div className="optimizer-draft">
        <p className="lead">Choose one monster, then compare the artifacts that suit its saved role — equipped and inventory candidates side by side.</p>
        <p className="optimizer-draft-note">Preferred properties lead; acceptable ones use the account-wide allowance below.</p>
      </div>
    </Disclosure>

    <Disclosure title="Settings">
      <div className="slider-grid">
        <div className="slider">
          <label className="slider-label" htmlFor="conversion-stone-grade">Conversion stone grade</label>
          <p className="slider-note">Which conversion stone should the draft assume is available?</p>
          <select id="conversion-stone-grade" value={settings.conversionStoneGrade}
            onChange={(event) => void onUpdate({ conversionStoneGrade: event.target.value as ItemGrade })}>
            {itemGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>
        </div>
        <div className="slider">
          <label className="slider-label" htmlFor="conversion-stone-max-value">Conversion stone value</label>
          <p className="slider-note">How much of that stone’s maximum value should count in the draft?</p>
          <input id="conversion-stone-max-value" type="range" min={1} max={100} step={1}
            value={settings.conversionStoneMaxValue}
            onChange={(event) => void onUpdate({ conversionStoneMaxValue: Number(event.target.value) })}
            aria-describedby="conversion-stone-max-value-choice" />
          <p id="conversion-stone-max-value-choice" className="slider-choice" aria-live="polite">
            {settings.conversionStoneMaxValue} % of maximum value
          </p>
        </div>
        <div className="slider">
          <label className="slider-label" htmlFor="acceptable-worth">Acceptable ctr. preferred</label>
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
      </div>
    </Disclosure>
  </WorkspacePage>;
}
