import type { MouseEvent, ReactNode } from 'react';
import type { Rune } from '../lib/runes';

/** The two places a rune overlay can resolve a rune from. */
export type RuneOverlayTarget =
  | { kind: 'account'; runeId: string }
  | { kind: 'generated'; rune: Rune };

export type OpenRuneOverlay = (target: RuneOverlayTarget, opener: HTMLElement) => void;

/**
 * The one clickable vocabulary for runes. It deliberately follows MonsterLink:
 * a button has no fake destination, and the opener is handed to the root so the
 * dialog can return focus to the exact row that launched it.
 */
export function RuneLink({ target, label, onOpen, children }: {
  target: RuneOverlayTarget | null;
  label: string;
  onOpen?: OpenRuneOverlay;
  children?: ReactNode;
}) {
  const body = children ?? label;
  if (target === null || onOpen === undefined) return <span className="rune-link-label">{body}</span>;
  return <button
    type="button"
    className="rune-link"
    aria-haspopup="dialog"
    aria-label={label}
    onClick={(event: MouseEvent<HTMLButtonElement>) => onOpen(target, event.currentTarget)}
  >
    {body}
  </button>;
}
