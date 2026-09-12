import { useEffect, useState } from 'react';

/* Three quarters of a screen. Measured against the window rather than fixed in
   pixels because "the top is out of reach" is a statement about the display,
   not about the document: 700px is a whole laptop view and barely half of the
   tall monitor this canvas is drawn for. Below the threshold the top is still
   one flick away, and an offer to go there is noise. */
const revealFraction = 0.75;

/* One stroke. A shaft, a rule or a second chevron each added a part that has to
   be read before the direction is understood, and the direction is the whole
   message. */
function ChevronUp() {
  /* The stated size is a floor for the moment before the stylesheet lands; the
     rendered one is a share of the circle, set in globals.css. */
  return <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M5 15.5 12 8.5l7 7" />
  </svg>;
}

/**
 * The way back to the top of a long library. It stays mounted at all times —
 * hidden by visibility, not by unmounting, which keeps it out of the tab order
 * while it is out of sight and off the page's measurements when it returns.
 */
export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(window.scrollY > window.innerHeight * revealFraction);
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  function returnToTop() {
    /* The global reduced-motion rule only reaches transitions and animations;
       a scripted smooth scroll is neither, so it is asked for here. */
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  return <button
    type="button"
    className={`scroll-to-top${visible ? ' visible' : ''}`}
    aria-label="Back to top"
    title="Back to top"
    onClick={returnToTop}
  >
    <ChevronUp />
  </button>;
}
