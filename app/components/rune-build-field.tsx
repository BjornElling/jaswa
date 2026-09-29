import { useState } from 'react';
import { Button } from './button';
import { TokenChoiceLine } from './token-choice-field';
import {
  fourPieceRuneSets, makeRuneBuild, runeBuild, runeBuildKey, runeBuildMaximumSets,
  runeBuildsLedBy, twoPieceRuneSets,
} from '../lib/rune-set-pairs';
import { runeSetPieceCount } from '../lib/rune-sets';

/**
 * Where the user names the exact rune builds they will accept.
 *
 * **A build, not a set.** Choosing sets one at a time cannot say whether
 * `Despair` and `Revenge` together mean `Despair/Revenge` or
 * `Revenge/Revenge/Revenge`, and an optimizer given the looser statement has to
 * guess — which is how someone asking for Revenge ends up with a triple Revenge
 * build. Every pill here is a whole six-slot answer, broken slots included.
 *
 * It answers on a token line, as the rune filters do: each build is a pill with
 * its own ✕, and the next one is added straight after the last. The menu under
 * the line is two columns because the vocabulary is two questions deep and a
 * hundred finished rows is more than a single list can be read at. The left
 * column names the set the build leads with; hovering or focusing one opens its
 * completions on the right. A four-set has seventeen of them — one per two-set,
 * and broken — and choosing one adds it and closes, like any token menu. A
 * two-set has no finished completions — the stacks run to hundreds, which is
 * not a list — so it opens the other two-sets as ticks, the slots nothing is
 * ticked for read as broken, and the build is added when the user says so.
 */

function setPieces(name: string): string {
  return `${runeSetPieceCount[name] ?? 2}-piece`;
}

const leaders = [...fourPieceRuneSets, ...twoPieceRuneSets];

function BuildMenu({ chosen, onAdd }: {
  chosen: readonly string[];
  onAdd: (id: string) => void;
}) {
  const [leading, setLeading] = useState<string>(fourPieceRuneSets[0] ?? '');
  /* The two-sets ticked under the current two-set leader. Local to one opening
     of the menu: nothing is an answer until it is added as a pill. */
  const [ticked, setTicked] = useState<readonly string[]>([]);

  function lead(name: string) {
    if (name === leading) return;
    setLeading(name);
    setTicked([]);
  }

  /* Compared by what fills the six slots rather than by spelling, so a stack
     led by Will cannot be added again under Destroy. */
  const chosenKeys = new Set(chosen.map((id) => runeBuild(id)).filter((build) => build !== undefined).map(runeBuildKey));

  const leadingIsFour = runeSetPieceCount[leading] === 4;
  /* The leader first, as the user reads it; the rest in the vocabulary's order,
     so one stack has one spelling. */
  const stack = [leading, ...twoPieceRuneSets.filter((name) => ticked.includes(name))];
  const composed = makeRuneBuild(stack, stack.length < runeBuildMaximumSets);
  const composedChosen = composed !== undefined && chosenKeys.has(runeBuildKey(composed));

  return <div className="rune-build-menu">
    <ul className="rune-build-leaders">
      {leaders.map((name) => {
        const count = chosen.filter((id) => runeBuild(id)?.leading === name).length;
        return <li key={name}>
          <button type="button"
            className={name === leading ? 'rune-build-leader current' : 'rune-build-leader'}
            aria-current={name === leading ? 'true' : undefined}
            onMouseEnter={() => lead(name)}
            onFocus={() => lead(name)}
            onClick={() => lead(name)}>
            <span className="rune-build-leader-name">{name}</span>
            <span className="rune-build-leader-pieces">{setPieces(name)}</span>
            {/* A fixed-width count that reads blank at zero, so a build being
                chosen cannot widen the row it sits in (`AGENTS.md` §2). */}
            <span className="rune-build-leader-count">{count > 0 ? count : ''}</span>
          </button>
        </li>;
      })}
    </ul>

    <div className="rune-build-completions">
      {leadingIsFour
        ? <ul className="choice-menu-list">
          {runeBuildsLedBy(leading).map((build) => {
            /* Kept in the list, dimmed, once chosen: seventeen rows that stay
               seventeen read faster than a list that closes up as it is used. */
            const added = chosenKeys.has(runeBuildKey(build));
            return <li key={build.id}>
              <button type="button" className={added ? 'choice-menu-option unavailable' : 'choice-menu-option'}
                disabled={added} onClick={() => onAdd(build.id)}>
                <span className="choice-menu-option-label">{build.id}</span>
                {/* The slot split, not the set name again: the row already
                    says which sets, and repeating the second one told the
                    reader nothing they had not just read. */}
                <span className="choice-menu-option-note">{added ? 'added' : '4 + 2'}</span>
              </button>
            </li>;
          })}
        </ul>
        : <>
          <p className="rune-build-note">
            {leading} takes two slots, so up to {runeBuildMaximumSets} sets share the six.
            Tick the ones that complete the build; slots left over are broken.
          </p>
          <ul className="choice-menu-list">
            {twoPieceRuneSets.filter((name) => name !== leading).map((name) => {
              const selected = ticked.includes(name);
              /* Full at three: a fourth set has no slots left to sit in, so
                 the option is disabled rather than silently dropped. */
              const full = stack.length >= runeBuildMaximumSets && !selected;
              return <li key={name}>
                <label className={full ? 'choice-menu-option unavailable' : 'choice-menu-option'}>
                  <input type="checkbox" checked={selected} disabled={full}
                    onChange={() => setTicked((current) => (selected
                      ? current.filter((entry) => entry !== name) : [...current, name]))} />
                  <span className="choice-menu-option-label">{name}</span>
                  <span className="choice-menu-option-note">{full ? 'six slots full' : ''}</span>
                </label>
              </li>;
            })}
          </ul>
          {/* What ticking has built so far, named in full, and the one move
              that makes it an answer. Nothing ticked is a real answer —
              `Will/Broken`, two Will runes and whatever fills the rest. */}
          <div className="rune-build-composed">
            <span className="rune-build-composed-name">{composed?.id ?? ''}</span>
            {/* One wording in every state, so the button cannot change width
                under the pointer; a build already on the line simply cannot be
                added again. */}
            <Button tone="primary" size="compact" disabled={composed === undefined || composedChosen}
              onClick={() => { if (composed !== undefined) onAdd(composed.id); }}>
              Add build
            </Button>
          </div>
        </>}
    </div>
  </div>;
}

export function RuneBuildField({ chosen, onChange }: {
  chosen: readonly string[];
  onChange: (next: string[]) => void;
}) {
  return <TokenChoiceLine name="Desired rune builds" description="Desired rune builds"
    className="rune-build-field" empty="Any build" menuRole="dialog"
    pills={chosen.map((id) => ({ value: id, label: id }))}
    onRemove={(id) => onChange(chosen.filter((entry) => entry !== id))}
    renderMenu={(close) => <BuildMenu chosen={chosen} onAdd={(id) => {
      onChange([...chosen, id]);
      close();
    }} />} />;
}
