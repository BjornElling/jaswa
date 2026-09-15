import { useState } from 'react';
import { ChoiceMenu } from './choice-menu';
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
 * Revenge build. Every row here is a whole six-slot answer.
 *
 * The menu is two columns because the vocabulary is two questions deep and 96
 * finished rows is more than a single list can be read at. The left column
 * names the set the build leads with; hovering or focusing one opens its
 * completions on the right. A four-set has sixteen of them, one per two-set. A
 * two-set has no finished completions — three two-sets can be stacked in
 * C(16,3) = 560 ways, which is not a list — so it opens the other two-sets as
 * ticks instead, and the build is composed from what the user ticks.
 */

function setPieces(name: string): string {
  return `${runeSetPieceCount[name] ?? 2}-piece`;
}

export function RuneBuildMenu({ chosen, onChange }: {
  chosen: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const [leading, setLeading] = useState<string>(fourPieceRuneSets[0] ?? '');

  function toggle(id: string) {
    onChange(chosen.includes(id) ? chosen.filter((entry) => entry !== id) : [...chosen, id]);
  }

  /* The stack being composed under a two-set leader: the leader is always in
     it, and ticking the others adds or removes them. It is read out of the
     chosen builds rather than held as state of its own, so what the menu shows
     and what will be saved cannot drift apart. */
  const stackFor = (leader: string): string[] => {
    const existing = chosen
      .map((id) => id.split(runeSetPairSeparator))
      .find((sets) => sets[0] === leader);
    return existing ?? [leader];
  };

  function toggleStackMember(leader: string, name: string) {
    const stack = stackFor(leader);
    const next = stack.includes(name)
      ? stack.filter((entry) => entry !== name)
      : [...stack, name];
    const previous = makeRuneSetPair(stack)?.id;
    const rest = chosen.filter((id) => id !== previous);
    /* A stack of one is the leading set alone, which is a real answer: "two
       Will runes and I do not mind what else". */
    const composed = makeRuneSetPair(next);
    onChange(composed === undefined ? rest : [...rest, composed.id]);
  }

  const leaders = [...fourPieceRuneSets, ...twoPieceRuneSets];
  const leadingIsFour = runeSetPieceCount[leading] === 4;
  const stack = leadingIsFour ? [] : stackFor(leading);
  const summary = chosen.length === 0 ? '' : chosen.join('  ·  ');

  return <ChoiceMenu label="Desired rune builds" summary={summary}
    empty="Any build — nothing chosen">
    <div className="rune-build-menu">
      <ul className="rune-build-leaders">
        {leaders.map((name) => {
          const count = chosen.filter((id) => id.split(runeSetPairSeparator)[0] === name).length;
          return <li key={name}>
            <button type="button"
              className={name === leading ? 'rune-build-leader current' : 'rune-build-leader'}
              aria-current={name === leading ? 'true' : undefined}
              onMouseEnter={() => setLeading(name)}
              onFocus={() => setLeading(name)}
              onClick={() => setLeading(name)}>
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
              const selected = chosen.includes(pair.id);
              return <li key={pair.id}>
                <label className="choice-menu-option">
                  <input type="checkbox" checked={selected} onChange={() => toggle(pair.id)} />
                  <span className="choice-menu-option-label">{pair.id}</span>
                  {/* The slot split, not the set name again: the row already
                      says which sets, and repeating the second one told the
                      reader nothing they had not just read. */}
                  <span className="choice-menu-option-note">4 + 2</span>
                </label>
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
                const selected = stack.includes(name);
                /* Full at three: a fourth set has no slots left to sit in, so
                   the option is disabled rather than silently dropped on save. */
                const full = stack.length >= runeSetPairMaximumSets && !selected;
                return <li key={name}>
                  <label className={full ? 'choice-menu-option unavailable' : 'choice-menu-option'}>
                    <input type="checkbox" checked={selected} disabled={full}
                      onChange={() => toggleStackMember(leading, name)} />
                    <span className="choice-menu-option-label">{name}</span>
                    <span className="choice-menu-option-note">{full ? 'six slots full' : ''}</span>
                  </label>
                </li>;
              })}
            </ul>
            {/* What ticking has built so far, named in full. A stack of one is
                the leading set on its own, which is a real answer — "two Will
                runes and I do not mind what fills the rest" — so it says that
                rather than showing a bare set name that reads like a heading. */}
            <p className="rune-build-composed">
              {stack.length > 1
                ? `Build: ${makeRuneSetPair(stack)?.id ?? stack.join(runeSetPairSeparator)}`
                : `Build: ${leading} only`}
            </p>
          </>}
      </div>
    </div>
  </ChoiceMenu>;
}
