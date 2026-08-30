'use client';

import { WorkspacePage } from './workspace-page';
import { Disclosure, PageHeader } from './page-chrome';
import { artifactAcceptableWorthChoices } from '../lib/file-imports';
import type { ArtifactSettings } from '../lib/types';

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

/* Four areas: the three questions of decision 13 and the one setting that
   weights all of them. Recommendations leads because it is the answer a user
   comes for; Settings sits last, being the thing you set once and then leave
   alone. No section opens by default — four folds all behaving alike, so the
   page never decides for the user which question they arrived with.

   Decision 30's fifth area, **All artifacts**, has left this page for its own
   Artifacts entry beside Monsters. The library is a plain list of what the
   account holds, where these three questions are judgements read against it,
   and a fold on a workspace page could not give a full-width sortable table the
   room it needs.

   Settings is the only section with content: decision 11 fixes what it holds.
   The other three are a heading and their stated purpose only, because the
   judgement they present comes from steps 4 and 5 of docs/ARTIFACT-SPRINT.md,
   and inventing an interim reading here would put a second answer beside the
   one those steps will produce. */

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
      <p className="lead">
        The swaps worth making across the account, in order — where a monster is wearing
        one artifact while a better one for it sits unused.
      </p>
    </Disclosure>

    <Disclosure title="Best monster for this artifact">
      <p className="lead">
        Takes one artifact and ranks the monsters that would gain most from it. A monster
        type with no property preferences is not ranked at all, rather than ranked last.
      </p>
    </Disclosure>

    <Disclosure title="Best artifact for this monster">
      <p className="lead">
        Takes one monster and ranks the artifacts worth putting on it, judged on how well
        each rolled on the properties you called preferred or acceptable for that monster
        type.
      </p>
    </Disclosure>

    <Disclosure title="Settings">
      <div className="slider-grid">
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
