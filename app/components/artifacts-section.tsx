'use client';

import { WorkspacePage } from './workspace-page';
import { Disclosure, PageHeader } from './page-chrome';

/* The workspace answers all three of decision 13's questions plus the library
   itself, and it answers them as four areas rather than one ranked view: they
   are four readings of the same table, so none of them leads. Each section is
   framed by the shared Disclosure (decision 14) rather than by its own chrome.

   Every section below is a heading and its stated purpose only. The judgement
   they present comes from steps 2, 4 and 5 of docs/ARTIFACT-SPRINT.md, and
   inventing an interim reading here would put a second answer beside the one
   those steps will produce. */

export function ArtifactsSection({ hasGame }: { hasGame: boolean }) {
  return <WorkspacePage
    header={<PageHeader
      title="Artifacts"
      tagline="That artifact is superb. Just not for the monster wearing it." />}
  >
    {!hasGame && <section className="empty-state">
      <h2>Compares artifact effects against the monsters that would gain most from them.</h2>
      <p className="next-step">Import your game data first. Your preferences can be prepared at any time.</p>
    </section>}

    <Disclosure title="Best monster for this artifact" defaultOpen={hasGame}>
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

    <Disclosure title="Recommended changelist">
      <p className="lead">
        The swaps worth making across the account, in order — where a monster is wearing
        one artifact while a better one for it sits unused.
      </p>
    </Disclosure>

    <Disclosure title="All artifacts">
      <p className="lead">
        Every artifact on the account, sortable and filterable. The list you look through
        when you want to see what you actually have.
      </p>
    </Disclosure>
  </WorkspacePage>;
}
