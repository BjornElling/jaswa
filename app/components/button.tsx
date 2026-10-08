import type { ComponentPropsWithRef, ReactNode } from 'react';

/* `ComponentPropsWithRef` rather than `ButtonHTMLAttributes`, so a caller that
   has to reach the element itself — the dialogs move focus to their safe
   action on open — can pass a ref straight through. */
type NativeButtonProps = ComponentPropsWithRef<'button'>;

/**
 * A control whose wording changes while it is on screen: a calculate button
 * that says "Calculating…" once pressed, a disclosure that says "Show fewer"
 * once open.
 *
 * Every wording is mounted at once and stacked in one grid cell; the ones not
 * showing are hidden with `visibility`, so they keep contributing their width.
 * The box is therefore as wide as its widest wording in every state, and the
 * control cannot resize under the very click that changed it (AGENTS.md §2).
 *
 * Rendering only the current wording is what this replaces. It gives the box
 * the width of whichever wording happens to be showing, so "Calculate
 * artifacts" shrank to "Calculating…" the moment it was pressed and grew back
 * when the work finished — a control flinching under the pointer.
 */
export function LabelSwap({ faces, showing }: {
  /** Keyed by what each wording means, so a caller names states rather than
      counting positions. */
  faces: Record<string, ReactNode>;
  showing: string;
}) {
  return <span className="label-swap">
    {/* The wordings not showing are hidden twice over, and both halves are
        needed. `visibility` (in the stylesheet) keeps them measured but unseen;
        `aria-hidden` keeps them out of the control's accessible name, which
        would otherwise read "Calculate artifacts Calculating…" — every wording
        at once, to anyone listening rather than looking. */}
    {Object.entries(faces).map(([face, label]) => <span key={face} className="label-swap-face"
      data-showing={face === showing ? 'true' : 'false'}
      aria-hidden={face === showing ? undefined : true}>{label}</span>)}
  </span>;
}

/** What the button is *for*. The look follows from that, not the other way
    round: `important` is the conclusion of a panel, `primary` the confirming
    answer in a dialog, `danger` the one that destroys something. */
export type ButtonTone = 'quiet' | 'primary' | 'danger' | 'important';

/** How much room the action is given. `regular` is the page's standard
    control; `compact` is for a line of settings, where the button is part of
    the sentence rather than a call to action; `prominent` is for the action a
    whole panel builds up to. */
export type ButtonSize = 'compact' | 'regular' | 'prominent';

const toneClass: Record<ButtonTone, string> = {
  quiet: '',
  primary: 'primary',
  danger: 'danger',
  important: 'important-action',
};

const sizeClass: Record<ButtonSize, string> = {
  compact: 'compact',
  regular: '',
  prominent: 'prominent',
};

/**
 * Every button in JASWA. Tone and size are the only two axes, so a button
 * cannot acquire a height or a disabled look of its own at one call site and
 * quietly disagree with the same button elsewhere. What this replaced had done
 * exactly that: five per-instance height rules, and four different answers to
 * "what does an unavailable button look like" — one of them written against
 * `.button` purely to win a specificity argument with the shared rule.
 *
 * `busy` is the other reason this is a component rather than a class. Any
 * button that reports its own work passes the wording it shows while working,
 * and gets the stacked-label treatment for free; there is no version of this
 * component that swaps the wording by conditional rendering, so the resize
 * cannot come back.
 *
 * `done` is the third wording a button can show: its work is finished and there
 * is nothing left to press, said in the verdict green — a machine reporting its
 * own state (`AGENTS.md` §5). It replaces the label rather than greying it out,
 * because "Engraved" is an answer and a dashed "Engrave on monster" would read
 * as a question nobody can ask.
 */
export function Button({
  tone = 'quiet', size = 'regular', busy = false, busyLabel, done = false, doneLabel,
  className, disabled, children, ...rest
}: NativeButtonProps & {
  tone?: ButtonTone;
  size?: ButtonSize;
  /** The button's own work is running. It disables itself and says so to
      assistive technology, on top of showing `busyLabel`. */
  busy?: boolean;
  /** What the button reads while `busy`. Both wordings stay in the layout. */
  busyLabel?: ReactNode;
  /** The button's work is finished: it disables itself and reads `doneLabel`. */
  done?: boolean;
  /** What the button reads once `done`. Every wording stays in the layout. */
  doneLabel?: ReactNode;
}) {
  const classes = ['button', toneClass[tone], sizeClass[size], className]
    .filter(Boolean).join(' ');
  const faces: Record<string, ReactNode> = { idle: children };
  if (busyLabel !== undefined) faces.busy = busyLabel;
  if (doneLabel !== undefined) faces.done = doneLabel;
  const showing = done && doneLabel !== undefined ? 'done' : busy && busyLabel !== undefined ? 'busy' : 'idle';

  return <button type="button" {...rest} className={classes}
    disabled={disabled || busy || done} aria-busy={busy || undefined}
    data-done={done && doneLabel !== undefined ? 'true' : undefined}>
    {Object.keys(faces).length === 1 ? children : <LabelSwap showing={showing} faces={faces} />}
  </button>;
}

/**
 * **A word in a small box, beside the thing it is about** — a row's Optimize and
 * Speed tuning, a rune card's Lock and Exclude. It is quieter than `Button` on
 * purpose: it sits among names and figures and should not outshout them.
 *
 * `pressed` makes it a toggle, said with `aria-pressed` and the accent alone —
 * border, ground and ink, never weight or wording — so a choice cannot resize
 * the box or move its neighbours (`AGENTS.md` §2). Left out, it simply acts.
 */
export function InlineButton({ pressed, className, children, ...rest }: NativeButtonProps & {
  pressed?: boolean;
}) {
  const classes = ['inline-button', className].filter(Boolean).join(' ');
  return <button type="button" {...rest} className={classes} aria-pressed={pressed}>
    {children}
  </button>;
}

/**
 * One option in a filter group, and the small clear button inside a search
 * field, which wears the same quiet box.
 *
 * `active` is optional because those two uses differ: a filter option is a
 * toggle and says so with `aria-pressed`, while a clear button simply acts and
 * has no pressed state to report. Passing nothing leaves the attribute off
 * rather than claiming the control is un-pressed.
 */
export function FilterButton({ active, className, children, ...rest }: NativeButtonProps & {
  active?: boolean;
}) {
  const classes = ['filter-button', active ? 'active' : '', className]
    .filter(Boolean).join(' ');

  return <button type="button" {...rest} className={classes} aria-pressed={active}>
    {children}
  </button>;
}
