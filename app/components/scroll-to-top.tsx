import { useEffect, useState } from 'react';

/* Three quarters of a screen. Measured against the window rather than fixed in
   pixels because "the top is out of reach" is a statement about the display,
   not about the document: 700px is a whole laptop view and barely half of the
   tall monitor this canvas is drawn for. Below the threshold the top is still
   one flick away, and an offer to go there is noise. */
const revealFraction = 0.75;

function ArrowToTop() {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {/* The ceiling stays put and the arrow rises into it on hover, so the
        gesture the button performs is the one it shows. */}
    <path d="M6 5.5h12" />
    <g className="scroll-to-top-arrow">
      <path d="M12 19.5V10" />
      <path d="M7.5 14 12 9.5l4.5 4.5" />
    </g>
  </svg>;
}

/**
 * The way back to the top of a long library. It is chrome rather than page
 * content: it lives outside the scaled canvas, so it keeps one true size on
 * every display, and it stays mounted at all times — hidden by visibility, not
 * by unmounting, which keeps it out of the tab order while it is out of sight.
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
    <ArrowToTop />
  </button>;
}
