import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

/**
 * A filter that answers on one line: the chosen values as removable pills, and
 * the rest of the line as the control that adds another.
 *
 * It replaces a group's whole vocabulary laid out as chips. A chip row is right
 * for a short list read as often as it is changed — six slots, four verdicts —
 * and wrong as soon as the vocabulary is long: twenty-two rune sets and a dozen
 * main properties filled half the rune strip with options nobody was looking at,
 * and the answer — usually none of them, sometimes two — was the part that took
 * the least room. Here only the answer is on screen; the vocabulary appears
 * while it is being given.
 *
 * Each value is its own pill with its own ✕, and the menu offers only what has
 * not been chosen yet, so a value goes on and comes off again in one move. The
 * monster overlay answers every one of its questions on this line too — builds,
 * slot mains and each band of a gear answer — so one control reads alike there
 * and in the filter strips.
 *
 * **The line's box never changes size** (`AGENTS.md` §2). It is one row high
 * whether it names nothing or everything: pills past the edge collapse into a
 * counted pill rather than wrapping the group taller, and the menu is absolutely
 * positioned, so opening it moves nothing behind it.
 */

export type TokenChoiceOption<T> = {
  value: T;
  label: string;
};

/** Room kept at the end of the line for the control that opens the menu. */
const addWidth = 26;
/** Room kept for the counted pill when not everything fits. */
const moreWidth = 44;
const gap = 4;

function Chevron() {
  return <svg className="token-choice-chevron" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function Cross() {
  return <svg className="token-choice-cross" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" />
  </svg>;
}

function Pill({ label, remove, describe }: { label: string; remove: () => void; describe: string }) {
  return <span className="token-choice-pill">
    <span className="token-choice-pill-label">{label}</span>
    <button type="button" className="token-choice-remove" aria-label={describe}
      onClick={remove}><Cross /></button>
  </span>;
}

/**
 * How many pills fit before the line has to start counting them.
 *
 * Measured off a copy of the row that is laid out but not shown, rather than off
 * the row on screen: the row on screen holds the answer to this question, so
 * reading widths from it would mean measuring the very thing being decided, and
 * a pill dropped for want of room takes its own width out of the reading that
 * dropped it. The copy always holds every pill, so the widths it reports are the
 * same ones whatever the line is currently showing.
 */
function useVisibleCount(signature: string, chosenCount: number,
  line: React.RefObject<HTMLDivElement | null>, ruler: React.RefObject<HTMLDivElement | null>) {
  const [visible, setVisible] = useState(chosenCount);

  /* Driven entirely by the observer rather than re-measured in an effect body.
     Both things the answer depends on — how wide the column is, and how wide the
     pills are — are changes the browser reports, so this subscribes to them and
     answers when told, instead of setting state on every render and hoping the
     layout underneath it had settled. The pills are observed one by one as well
     as together, because two different answers can add up to the same total
     width and still break at a different pill. */
  useLayoutEffect(() => {
    const row = line.current;
    const widths = ruler.current;
    if (!row || !widths || typeof ResizeObserver === 'undefined') return undefined;

    function measure() {
      if (!row || !widths) return;
      const available = row.clientWidth - addWidth;
      const pills = [...widths.children].map((pill) => (pill as HTMLElement).offsetWidth);

      const fitting = (reserve: number) => {
        let used = 0;
        let count = 0;
        for (const width of pills) {
          const next = used + (count === 0 ? 0 : gap) + width;
          if (next + reserve > available) break;
          used = next;
          count += 1;
        }
        return count;
      };

      const all = fitting(0);
      if (all === pills.length) return setVisible(pills.length);
      /* Not everything fits, so the counted pill needs room of its own — and
         taking that room can push out a pill that had just fitted. One pill
         always shows however narrow the column, because a line reading only
         "+3" names nothing the user chose; that one ellipsises instead. */
      setVisible(Math.max(1, fitting(gap + moreWidth)));
    }

    const observer = new ResizeObserver(measure);
    observer.observe(row);
    observer.observe(widths);
    for (const pill of [...widths.children]) observer.observe(pill);
    return () => observer.disconnect();
  }, [signature, line, ruler]);

  return visible;
}

export function TokenChoiceField<T extends string | number>({
  label, description, options, chosen, empty, className, onChange,
}: {
  /** What the group is called, shown above the line. */
  label: string;
  /** What the group asks, for the accessible name of the line and the menu. */
  description: string;
  options: readonly TokenChoiceOption<T>[];
  chosen: readonly T[];
  /** What the line says when nothing is chosen — a filter's "no restriction". */
  empty: string;
  /** The strip's own placement class, so a filter keeps its grid area. */
  className?: string;
  onChange: (next: T[]) => void;
}) {
  const labelOf = new Map(options.map((option) => [option.value, option.label]));
  /* Read back in the vocabulary's own order rather than the order they were
     ticked, so the line reads the same whichever way round the two were chosen
     and a pill does not jump position when its neighbour is removed. */
  const picked = options.filter((option) => chosen.includes(option.value));
  /* A value the vocabulary no longer covers — a preset renamed since the filter
     was stored — still shows, so the user can see what is narrowing the table
     and take it off. Silently dropping it would leave rows missing with nothing
     on screen saying why. */
  const orphans = chosen.filter((value) => !labelOf.has(value))
    .map((value) => ({ value, label: String(value) }));
  const offered = options.filter((option) => !chosen.includes(option.value));

  return <div className={['filter-group', 'token-choice-group', className].filter(Boolean).join(' ')}
    role="group" aria-label={description}>
    <span className="filter-label">{label}</span>
    <div className="filter-group-controls">
      <TokenChoiceLine name={label} description={description} empty={empty}
        pills={[...picked, ...orphans]}
        onRemove={(value) => onChange(chosen.filter((entry) => entry !== value))}
        renderMenu={(close) => <ul className="token-choice-list">
          {offered.map((option) => <li key={String(option.value)}>
            {/* Chosen and closed in one move: the user asked one question,
                and the next answer starts from the line again, beside the
                pill this just added. */}
            <button type="button" role="menuitem" className="token-choice-option"
              onClick={() => {
                onChange([...chosen, option.value]);
                close();
              }}>{option.label}</button>
          </li>)}
          {offered.length === 0 && <li className="token-choice-note">
            {options.length === 0 ? 'Nothing to choose from.' : 'Everything is chosen.'}
          </li>}
        </ul>} />
    </div>
  </div>;
}

/**
 * The line itself — pills, the counted pill, and the run that opens the menu —
 * without the label above it or a vocabulary of its own.
 *
 * Split out because not every vocabulary is one flat list. A rune build is two
 * questions deep, so its menu is two columns; it still answers on this line, in
 * pills, exactly as a filter does, and so it borrows the line rather than
 * growing a second copy of the measuring and the ways out.
 */
export function TokenChoiceLine<T extends string | number>({
  name, description, pills, empty, className, menuRole = 'menu', onRemove, renderMenu,
}: {
  /** What the answer is called, for each pill's remove button. */
  name: string;
  /** What the line asks, for the accessible name of the line and the menu. */
  description: string;
  /** The answer, in the order it reads. */
  pills: readonly TokenChoiceOption<T>[];
  empty: string;
  className?: string;
  /** `dialog` where the menu holds more than a list of choices. */
  menuRole?: 'menu' | 'dialog';
  onRemove: (value: T) => void;
  /** The menu's content. `close` ends the question and returns to the line. */
  renderMenu: (close: () => void) => ReactNode;
}) {
  /* `add` offers what is left to choose; `overflow` shows the pills the line had
     no room for. One panel in two modes, because every way out of it — Escape, a
     click outside, focus returning to the control — has to behave the same. */
  const [panel, setPanel] = useState<'add' | 'overflow' | null>(null);
  const field = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLSpanElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const panelId = useId();

  /* What the measurement has to be redone for: a different answer means
     different pill elements, so the observer has to be pointed at the new ones.
     `'\0'` rather than a comma, because a label may hold one. */
  const signature = pills.map((pill) => pill.label).join('\0');
  const visible = useVisibleCount(signature, pills.length, line, ruler);
  const hidden = pills.slice(visible);

  useEffect(() => {
    if (panel === null) return undefined;
    function onPointerDown(event: MouseEvent) {
      if (field.current && !field.current.contains(event.target as Node)) setPanel(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      /* Stopped rather than allowed to bubble: an overlay behind this closes on
         Escape too, and a reader dismissing a menu does not expect to lose the
         panel it was working in. */
      event.stopPropagation();
      event.preventDefault();
      setPanel(null);
      trigger.current?.focus();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [panel]);

  /* The menu hangs from the gap after the last pill, which is where the pill it
     adds will land, so it is placed at the empty run's own offset rather than at
     the field's left edge. Near the right edge of the window that would put it
     partly off screen, so it is then pulled back by however much it overruns —
     the whole menu moves, rather than opening from somewhere nobody clicked. */
  /* A menu that grows while open — a cascade opening its next column — states the
     width it may grow to in `--menu-reach`, and is placed against that once. Placing
     it again as it grew would slide the column under the pointer sideways the moment
     the next one opened. */
  useLayoutEffect(() => {
    const element = menu.current;
    const from = panel === 'overflow' ? more.current : slot.current;
    if (!element || !from) return;
    element.style.left = `${from.offsetLeft}px`;
    const box = element.getBoundingClientRect();
    const reach = Number.parseFloat(getComputedStyle(element).getPropertyValue('--menu-reach'));
    const right = box.left + Math.max(box.width, Number.isFinite(reach) ? reach : 0);
    const overrun = right - (window.innerWidth - 8);
    if (overrun > 0) element.style.left = `${from.offsetLeft - overrun}px`;
  }, [panel, visible]);

  /* Focus goes back to the line once the menu has closed, from an effect
     rather than from `close` itself: `close` is handed to the menu's content
     during render, and so must not carry a ref with it. */
  const [returns, setReturns] = useState(0);
  useEffect(() => { if (returns > 0) trigger.current?.focus(); }, [returns]);
  function close() {
    setPanel(null);
    setReturns((count) => count + 1);
  }

  function keyOnTrigger(event: React.KeyboardEvent) {
    /* Backspace on the line takes the last pill off, the way it does in every
       other field that holds a row of removable values. */
    if (event.key !== 'Backspace' || panel !== null || pills.length === 0) return;
    event.preventDefault();
    onRemove(pills[pills.length - 1].value);
  }

  const summary = pills.length === 0 ? empty : pills.map((pill) => pill.label).join(', ');

  return <div className={['token-choice', className].filter(Boolean).join(' ')} ref={field}>
    <div className="token-choice-line" ref={line}>
      {pills.slice(0, visible).map((pill) => <Pill key={String(pill.value)} label={pill.label}
        describe={`Remove ${pill.label} from ${name}`} remove={() => onRemove(pill.value)} />)}
      {hidden.length > 0 && <button type="button" ref={more}
        className={panel === 'overflow' ? 'token-choice-more open' : 'token-choice-more'}
        aria-expanded={panel === 'overflow'} aria-haspopup="menu"
        aria-controls={panel === 'overflow' ? panelId : undefined}
        aria-label={`Show ${hidden.length} more chosen in ${name}`}
        onClick={() => setPanel((current) => (current === 'overflow' ? null : 'overflow'))}
      >+{hidden.length}</button>}
      {/* The rest of the line is the control that adds one, so clicking
          beside the last pill — anywhere in the empty run — opens the menu
          where the new pill will appear. */}
      <span className="token-choice-slot" ref={slot}>
        <button type="button" ref={trigger} className="token-choice-add"
          aria-expanded={panel === 'add'} aria-haspopup={menuRole}
          aria-controls={panel === 'add' ? panelId : undefined}
          aria-label={`${description}: ${summary}`}
          onKeyDown={keyOnTrigger}
          onClick={() => setPanel((current) => (current === 'add' ? null : 'add'))}>
          {pills.length === 0 && <span className="token-choice-empty">{empty}</span>}
          <Chevron />
        </button>
      </span>
    </div>
    {/* Outside the line, because the line clips what overruns it — that is
        how the counted pill replaces a wrapped row — and a menu hung inside
        it was clipped to nothing. It is placed against the slot instead, so
        it still opens where the pill it adds will land. */}
    {panel !== null && <div className="token-choice-panel" id={panelId} ref={menu}
      role={panel === 'add' ? menuRole : 'menu'} aria-label={panel === 'add' ? description : `${name}: the rest`}>
      {panel === 'add'
        ? renderMenu(close)
        : <div className="token-choice-overflow">
          {hidden.map((pill) => <Pill key={String(pill.value)} label={pill.label}
            describe={`Remove ${pill.label} from ${name}`} remove={() => onRemove(pill.value)} />)}
        </div>}
    </div>}
    {/* Laid out but not shown, and never reachable: this is the copy the
        line is measured against. `aria-hidden` alone would leave its ✕
        buttons in the tab order, so every pill in it is inert. */}
    <div className="token-choice-ruler" ref={ruler} aria-hidden="true" inert>
      {pills.map((pill) => <Pill key={String(pill.value)} label={pill.label}
        describe="" remove={() => undefined} />)}
    </div>
  </div>;
}
