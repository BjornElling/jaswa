import { type FormEvent, type ReactNode, type RefObject, useEffect, useRef } from 'react';

/**
 * The one frame every overlay opens in: the backdrop, the panel, the round
 * close button on its lower edge, and every way out of it.
 *
 * **While an overlay is up, all activity happens on it.** The page behind it
 * does not scroll, Tab does not leave it, and a click on the backdrop, Escape
 * and the mouse's back button all close it. Each overlay used to carry its own
 * copy of the keyboard half of that and none of the rest, so they disagreed:
 * one closed on a backdrop click and the other did not, and both let the wheel
 * scroll the table underneath.
 *
 * `dismissible` is the one way an overlay can hold on to itself. It stops the
 * three *incidental* exits — Escape, the backdrop, the back button — for as
 * long as it is false, which is what an overlay holding unsaved edits wants: a
 * stray keypress aimed at something else must not throw the edits away. The
 * close button is never held: pressing it is a decision, not an accident.
 */

/** Open overlays, innermost last. Only the innermost answers an exit, and the
    page stays locked until the last one closes. */
const openOverlays: symbol[] = [];

/** The mouse's back and forward buttons, as `MouseEvent.button` numbers them. */
const backButton = 3;
const forwardButton = 4;

const focusableSelector = [
  'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', 'a[href]', '[tabindex]:not([tabindex="-1"])',
].join(', ');

function CloseMark() {
  return <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 4l8 8" />
    <path d="M12 4l-8 8" />
  </svg>;
}

const actionMarks = {
  /* A tick: what is on the panel is kept. */
  save: <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>,
  /* An arrow turning back on itself: the panel starts over. */
  reset: <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2" />
    <path d="M3.5 2.5v2.8h2.8" />
  </svg>,
} as const;

/**
 * One of an overlay's own ways out, drawn as the close button is: a round mark
 * on the panel's lower edge, named by its accessible label rather than by text.
 * Its box is the same in every state, disabled included, so nothing on the
 * edge moves when an edit makes Save available.
 */
export function OverlayAction({ kind, label, hint, type = 'button', disabled, onClick }: {
  kind: keyof typeof actionMarks;
  label: string;
  /** What is missing before the action can be taken; shown on hover in place of the label. */
  hint?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
}) {
  return <button type={type} className={`overlay-round overlay-${kind}`} aria-label={label} title={hint ?? label}
    aria-description={hint} disabled={disabled} onClick={onClick}>
    {actionMarks[kind]}
  </button>;
}

export function Overlay({
  labelledBy, describedBy, className, dismissible = true, onClose, onSubmit, actions, children,
}: {
  labelledBy: string;
  describedBy?: string;
  /** Sizes the panel; the frame itself owns everything else about it. */
  className?: string;
  dismissible?: boolean;
  onClose: () => void;
  /** Given, the panel is a `<form>` and this is its submit. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /**
   * Buttons that sit on the panel's lower edge beside the close button. They
   * replace a footer bar: a bar cut the scrolling body short above it and
   * read as a second panel, where the edge already holds the one way out.
   */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  /* Read through refs so the listeners below are attached once, for the life of
     the overlay, rather than torn down and re-added on every keystroke the
     overlay's own form causes. */
  const exits = useRef({ dismissible, onClose });
  useEffect(() => { exits.current = { dismissible, onClose }; }, [dismissible, onClose]);

  useEffect(() => {
    const self = Symbol('overlay');
    openOverlays.push(self);
    const root = document.documentElement;
    if (openOverlays.length === 1) {
      /* Measured before the lock, while the page's own scrollbar still stands.
         The locked page gives that width back as padding, and the backdrop
         stays out of it, so neither the page nor a panel centred over it
         moves by half a scrollbar when the lock goes on. */
      root.style.setProperty('--overlay-gutter', `${window.innerWidth - root.clientWidth}px`);
      root.classList.add('overlay-open');
    }
    const innermost = () => openOverlays.at(-1) === self;

    /* An overlay that put its own first field under the caret keeps it there;
       otherwise the close button takes focus, so the reader lands in the
       overlay rather than on the row behind it. Child effects run before this
       one, which is what lets a child's choice win. */
    if (!panel.current?.contains(document.activeElement)) closeButton.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (!innermost() || !panel.current) return;
      if (event.key === 'Escape') {
        /* A menu inside the overlay stops its own Escape before it gets here;
           anything that only marked it handled is respected too. */
        if (event.defaultPrevented || !exits.current.dismissible) return;
        event.preventDefault();
        exits.current.onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      /* `aria-modal` alone traps focus in no browser; tabbing past the last
         control would strand the reader behind a backdrop they cannot see past. */
      const focusable = [...panel.current.querySelectorAll<HTMLElement>(focusableSelector)]
        .filter((element) => element.offsetParent !== null || element === document.activeElement);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      const inside = panel.current.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !inside)) { event.preventDefault(); first.focus(); }
    }

    /* The browser acts on the back and forward buttons when they are released,
       and leaving the page from under an overlay would lose it along with
       whatever the page held. Both are swallowed while an overlay is up; back
       is then given the meaning the reader intended by it — away from here. */
    function onMouseUp(event: MouseEvent) {
      if (event.button !== backButton && event.button !== forwardButton) return;
      event.preventDefault();
      if (event.button === backButton && innermost() && exits.current.dismissible) exits.current.onClose();
    }
    function onMouseDown(event: MouseEvent) {
      if (event.button === backButton || event.button === forwardButton) event.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousedown', onMouseDown);
      openOverlays.splice(openOverlays.indexOf(self), 1);
      if (openOverlays.length === 0) {
        root.classList.remove('overlay-open');
        root.style.removeProperty('--overlay-gutter');
      }
    };
  }, []);

  const panelProps = {
    className: ['dialog', 'overlay', className].filter(Boolean).join(' '),
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': labelledBy,
    'aria-describedby': describedBy,
  } as const;
  const body = <>
    {children}
    {actions !== undefined && <div className="overlay-actions">{actions}</div>}
    <button ref={closeButton} type="button" className="overlay-round overlay-close" aria-label="Close" title="Close"
      onClick={onClose}>
      <CloseMark />
    </button>
  </>;

  return <div className="modal-backdrop overlay-backdrop" role="presentation"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget && event.button === 0 && exits.current.dismissible) onClose();
    }}>
    {onSubmit === undefined
      ? <div ref={panel as RefObject<HTMLDivElement>} {...panelProps}>{body}</div>
      : <form ref={panel as RefObject<HTMLFormElement>} {...panelProps} onSubmit={onSubmit}>{body}</form>}
  </div>;
}
