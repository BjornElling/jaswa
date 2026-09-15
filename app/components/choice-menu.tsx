import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

/**
 * A field that opens a list of options and closes again — the compact way to
 * ask a question with more answers than there is room to show at once.
 *
 * It replaces a row of chips per question. A chip row states its whole
 * vocabulary on screen at all times, which is right for a short list that is
 * read as often as it is changed, and wrong for twenty-three rune builds or
 * sixteen relic uniques: the monster overlay asks eight such questions, and
 * eight chip rows filled the panel with options nobody was looking at. A closed
 * field says what was chosen; the vocabulary appears only while it is being
 * answered.
 *
 * **The field's own box never changes size.** What was chosen is rendered on
 * one line that ellipsises, and the summary keeps its height whether it names
 * nothing or five things (`AGENTS.md` §2). The menu is absolutely positioned,
 * so opening it moves nothing behind it.
 */

export type ChoiceMenuOption<T> = {
  value: T;
  label: string;
  /** What the population does, shown as reference beside the option. */
  note?: string;
};

function Chevron() {
  return <svg className="choice-menu-chevron" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

/**
 * The shared shell: a summary button, and a panel that closes on Escape or on a
 * click outside it.
 *
 * Closing is handled in one place because every way out has to put focus back
 * on the summary — a menu that closed and left focus on a removed option
 * strands a keyboard reader at the top of the document.
 */
export function ChoiceMenu({ label, summary, empty, children, disabled }: {
  /** What the field asks, for its accessible name. */
  label: string;
  /** What is currently chosen, in the words the user reads it in. */
  summary: string;
  /** What the field says when nothing is chosen. */
  empty: string;
  /* The panel's content. These menus take several answers at once, so ticking
     one option deliberately does *not* close the menu — the user is mid-answer.
     Closing is the reader's own move: Escape, a click outside, or focus
     leaving, all handled here so every menu leaves the same way. */
  children: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event: MouseEvent) {
      if (field.current && !field.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      /* Stopped here rather than allowed to bubble: the overlay closes on
         Escape too, and a reader dismissing a menu does not expect to lose the
         whole panel behind it. */
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener('mousedown', onPointerDown);
    /* Capture, so this runs before the overlay's own Escape handler. */
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const chosen = summary.length > 0;
  /* Closed by a pointer outside, by Escape, and by focus genuinely leaving —
     never by a plain `blur`. Clicking a checkbox inside the panel blurs the
     trigger, and a handler that closed on it swallowed the very click it was
     reacting to. Worse, ticking an option re-renders the list, so the element
     focus moved to is replaced in the same tick: every containment test — on
     the event's `relatedTarget`, or on `document.activeElement` a frame later —
     then reports the answer as having come from outside the menu it was given
     inside. The pointer handler above already closes on a click outside, and
     Escape closes from the keyboard, so there is nothing left for a blur rule
     to catch that is worth losing a half-finished answer to. */
  return <div className="choice-menu" ref={field}>
    <button type="button" ref={trigger} className="choice-menu-field" disabled={disabled}
      aria-expanded={open} aria-haspopup="true" aria-controls={open ? menuId : undefined}
      aria-label={`${label}: ${chosen ? summary : empty}`}
      onClick={() => setOpen((current) => !current)}>
      <span className={chosen ? 'choice-menu-summary' : 'choice-menu-summary empty'}>
        {chosen ? summary : empty}
      </span>
      <Chevron />
    </button>
    {open && <div className="choice-menu-panel" id={menuId} role="group" aria-label={label}>
      {children}
    </div>}
  </div>;
}

/**
 * A field that takes any number of answers.
 *
 * Every option is a checkbox rather than a radio, because these questions are
 * all "which of these will you take" — several mains, several substats, several
 * uniques. Choosing nothing is a real answer and is kept as an empty list, not
 * as silence: see `MonsterCopyPreferences`.
 */
export function MultiChoiceMenu<T extends string | number>({
  label, options, chosen, empty, onChange, describe,
}: {
  label: string;
  options: readonly ChoiceMenuOption<T>[];
  chosen: readonly T[];
  empty: string;
  onChange: (next: T[]) => void;
  /** How the closed field reads. Defaults to the chosen labels, comma-separated. */
  describe?: (labels: readonly string[]) => string;
}) {
  const labelOf = new Map(options.map((option) => [option.value, option.label]));
  /* Read back in the vocabulary's own order rather than the order they were
     ticked, so the summary of one monster's choices is comparable with
     another's. */
  const names = options.filter((option) => chosen.includes(option.value)).map((option) => option.label);
  const unknown = chosen.filter((value) => !labelOf.has(value)).map(String);
  const summary = (describe ?? ((entries: readonly string[]) => entries.join(', ')))([...names, ...unknown]);

  return <ChoiceMenu label={label} summary={summary} empty={empty}>
    <ul className="choice-menu-list">
      {options.map((option) => {
        const selected = chosen.includes(option.value);
        return <li key={String(option.value)}>
          <label className="choice-menu-option">
            <input type="checkbox" checked={selected}
              onChange={() => onChange(selected
                ? chosen.filter((value) => value !== option.value)
                : [...chosen, option.value])} />
            <span className="choice-menu-option-label">{option.label}</span>
            {/* Always rendered, so a row without a statistic keeps the height of
                one that has it and the list cannot re-space as it is read. */}
            <span className="choice-menu-option-note">{option.note ?? ''}</span>
          </label>
        </li>;
      })}
      {options.length === 0 && <li className="choice-menu-empty">Nothing to choose from.</li>}
    </ul>
  </ChoiceMenu>;
}
