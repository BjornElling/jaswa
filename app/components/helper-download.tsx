import type { ButtonSize } from './button';
import { recommendedHelperVersion } from '../lib/helper-version';

/* The four-pane Windows mark, the badge a download row conventionally uses to
   say which platform a file is for. Filled in `currentColor` so it takes the
   button's colour through hover and the disabled state rather than staying lit
   while the label around it dims. */
function WindowsMark() {
  return <svg className="button-mark" viewBox="0 0 16 16" width="13" height="13"
    fill="currentColor" aria-hidden="true" focusable="false">
    {/* Tilted panes: the top edges rise to the right and the left panes are
        shorter, which is the perspective that reads as the Windows flag rather
        than as a plain window grid. */}
    <path d="M0 2.25 6.5 1.4v6.05H0z" />
    <path d="M7.35 1.28 16 0v7.45H7.35z" />
    <path d="M0 8.3h6.5v6.06L0 13.5z" />
    <path d="M7.35 8.3H16V16l-8.65-1.24z" />
  </svg>;
}

/**
 * The link to the recommended helper's installer, wherever it is offered.
 *
 * A link wearing the button's box rather than a `Button`, because a download is
 * navigation: the browser fetches the file itself. One component, so the Game
 * data card and the update warning can never point at two different files.
 */
export function HelperDownload({ tone = 'important', size = 'regular', children = 'Download helper' }: {
  /* Quiet inside the update warning: a gold frame in a red card is two
     verdicts in one box, and the card already says this is the thing to do. */
  tone?: 'important' | 'quiet';
  size?: Exclude<ButtonSize, 'prominent'>;
  children?: string;
}) {
  const installer = `JASWA-Helper-Setup-${recommendedHelperVersion}.exe`;
  const classes = ['button', tone === 'important' ? 'important-action' : '', size === 'compact' ? 'compact' : ''];
  return <a className={classes.filter(Boolean).join(' ')}
    href={`/${installer}`} download={installer}><WindowsMark />{children}</a>;
}
