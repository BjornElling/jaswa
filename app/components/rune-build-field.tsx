import { useState } from 'react';
import { TokenChoiceLine } from './token-choice-field';
import {
  fourPieceRuneSets, makeRuneBuild, runeBuild, runeBuildContinuations, runeBuildKey, twoPieceRuneSets,
} from '../lib/rune-set-pairs';

/**
 * Where the user names the rune builds they will accept.
 *
 * **A build, not a set.** Choosing sets one at a time cannot say whether
 * `Despair` and `Revenge` together mean `Despair/Revenge` or
 * `Revenge/Revenge/Revenge`, and an optimizer given the looser statement has to
 * guess — which is how someone asking for Revenge ends up with a triple Revenge
 * build. Every pill here is one build: the sets it must hold, the slots it does
 * not name left to the copy's *Allow broken sets* answer.
 *
 * It answers on a token line, as the rune filters do: each build is a pill with
 * its own ✕, and the next one is added straight after the last. The menu under
 * the line cascades, one column per set in the build, because that is how a build
 * is said — Violent, then Will. The first column holds every set, four-piece and
 * two-piece side by side so neither has to scroll; pointing at one opens the sets
 * that can follow it, and pointing at one of those opens the third. A click at any
 * depth adds the build as far as it has been named, so `Violent` on its own is one
 * click and `Swift/Will/Blade` is three columns deep. Only what still fits in six
 * slots is offered, so nothing in the menu can be a build the game cannot equip.
 *
 * Each row is the set's name and nothing else: what is already chosen stays in
 * place, dimmed, rather than being counted or annotated, so a row reads the same
 * whatever has been picked around it.
 */

function SetRow({ name, open, chosen, onPoint, onChoose }: {
  name: string;
  /** This row's continuation is the column showing to the right. */
  open: boolean;
  /** The build this row would add is already on the line. */
  chosen: boolean;
  onPoint: () => void;
  onChoose: () => void;
}) {
  /* `aria-disabled` rather than `disabled`: a chosen `Violent` must still open its
     continuations under the pointer, and a disabled button hears no pointer. */
  return <li>
    <button type="button" className="rune-build-set" data-open={open ? 'true' : undefined}
      aria-disabled={chosen || undefined} aria-expanded={open || undefined}
      onMouseEnter={onPoint} onFocus={onPoint}
      onClick={() => { if (!chosen) onChoose(); }}>
      {name}
    </button>
  </li>;
}

function BuildMenu({ chosen, onAdd }: {
  chosen: readonly string[];
  onAdd: (id: string) => void;
}) {
  /* The sets pointed at so far, one per column. Local to one opening of the menu. */
  const [path, setPath] = useState<readonly string[]>([]);

  /* Compared by what fills the slots rather than by spelling, so a stack led by
     Will cannot be added again under Destroy. */
  const chosenKeys = new Set(chosen.map((id) => runeBuild(id)).filter((build) => build !== undefined).map(runeBuildKey));
  const isChosen = (sets: readonly string[]) => {
    const build = makeRuneBuild(sets);
    return build === undefined || chosenKeys.has(runeBuildKey(build));
  };

  function column(depth: number, names: readonly string[], label: string) {
    const before = path.slice(0, depth);
    return <ul className="rune-build-column" aria-label={label} key={`${depth}-${label}`}>
      {names.map((name) => <SetRow key={name} name={name}
        open={path[depth] === name && runeBuildContinuations([...before, name]).length > 0}
        chosen={isChosen([...before, name])}
        onPoint={() => setPath([...before, name])}
        onChoose={() => {
          const build = makeRuneBuild([...before, name]);
          if (build !== undefined) onAdd(build.id);
        }} />)}
    </ul>;
  }

  const second = path.length >= 1 ? runeBuildContinuations(path.slice(0, 1)) : [];
  const third = path.length >= 2 ? runeBuildContinuations(path.slice(0, 2)) : [];

  return <div className="rune-build-menu">
    <div className="rune-build-first">
      {column(0, fourPieceRuneSets, 'Four-piece sets')}
      {column(0, twoPieceRuneSets, 'Two-piece sets')}
    </div>
    {second.length > 0 && column(1, second, `After ${path[0]}`)}
    {third.length > 0 && column(2, third, `After ${path.slice(0, 2).join(' and ')}`)}
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
