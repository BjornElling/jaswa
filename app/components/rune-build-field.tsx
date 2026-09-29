import { useState } from 'react';
import { Button } from './button';
import { TokenChoiceLine } from './token-choice-field';
import {
  fourPieceRuneSets, makeRuneSetPair, runeSetPairMaximumSets,
  runeSetPairsLedBy, runeSetPairSeparator, twoPieceRuneSets,
} from '../lib/rune-set-pairs';
import { runeSetPieceCount } from '../lib/rune-sets';

/**
 * Where the user names the exact rune builds they will accept.
 *
 * **A build, not a set.** Choosing sets one at a time cannot say whether
 * `Despair` and `Revenge` together mean `Despair / Revenge` or
 * `Revenge / Revenge / Revenge`, and an optimizer given the looser statement
 * has to guess — which is how someone asking for Revenge ends up with a triple
 * Revenge build. Every pill here is a whole six-slot answer.
 *
 * It answers on a token line, as the rune filters do: each build is a pill with
 * its own ✕, and the next one is added straight after the last. The menu under
 * the line is two columns because the vocabulary is two questions deep and 96
 * finished rows is more than a single list can be read at. The left column
 * names the set the build leads with; hovering or focusing one opens its
 * completions on the right. A four-set has sixteen of them, one per two-set,
 * and choosing one adds it and closes, like any token menu. A two-set has no
 * finished completions — three two-sets can be stacked in C(16,3) = 560 ways,
 * which is not a list — so it opens the other two-sets as ticks, and the build
 * they compose is added when the user says so.
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

  const leadingIsFour = runeSetPieceCount[leading] === 4;
  /* In the vocabulary's order rather than the order ticked, so one stack has
     one name and cannot be added twice under two spellings. */
  const stack = [leading, ...twoPieceRuneSets.filter((name) => ticked.includes(name))];
  const composed = makeRuneSetPair(stack)?.id;
  const composedChosen = composed !== undefined && chosen.includes(composed);

  return <div className="rune-build-menu">
    <ul className="rune-build-leaders">
      {leaders.map((name) => {
        const count = chosen.filter((id) => id.split(runeSetPairSeparator)[0] === name).length;
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
          {runeSetPairsLedBy(leading).map((pair) => {
            /* Kept in the list, dimmed, once chosen: sixteen rows that stay
               sixteen read faster than a list that closes up as it is used. */
            const added = chosen.includes(pair.id);
            return <li key={pair.id}>
              <button type="button" className={added ? 'choice-menu-option unavailable' : 'choice-menu-option'}
                disabled={added} onClick={() => onAdd(pair.id)}>
                <span className="choice-menu-option-label">{pair.id}</span>
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
            {leading} takes two slots, so up to {runeSetPairMaximumSets} sets share the six.
            Tick the ones that complete the build.
          </p>
          <ul className="choice-menu-list">
            {twoPieceRuneSets.filter((name) => name !== leading).map((name) => {
              const selected = ticked.includes(name);
              /* Full at three: a fourth set has no slots left to sit in, so
                 the option is disabled rather than silently dropped. */
              const full = stack.length >= runeSetPairMaximumSets && !selected;
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
              that makes it an answer. A stack of one is the leading set on its
              own, which is a real answer — "two Will runes and I do not mind
              what fills the rest". */}
          <div className="rune-build-composed">
            <span className="rune-build-composed-name">{composed ?? leading}{stack.length === 1 ? ' only' : ''}</span>
            {/* One wording in every state, so the button cannot change width
                under the pointer; a build already on the line simply cannot be
                added again. */}
            <Button tone="primary" size="compact" disabled={composed === undefined || composedChosen}
              onClick={() => { if (composed !== undefined) onAdd(composed); }}>
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
