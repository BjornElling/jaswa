'use client';

import Image from 'next/image';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

const canvasWidth = 1920;

function viewportScale() {
  return Math.min(1, window.innerWidth / canvasWidth);
}

function isHandheldDevice() {
  const navigatorWithHints = navigator as Navigator & {
    userAgentData?: { mobile?: boolean };
  };
  const agent = navigator.userAgent;
  /* iPadOS presents itself as macOS in some browsers. Its touch-point signal is
     specific enough here because it is only used to disambiguate that agent,
     never to reject an ordinary touch-capable desktop. */
  const iPadInDesktopClothes = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return navigatorWithHints.userAgentData?.mobile === true
    || /Android|iPhone|iPad|iPod|Kindle|Silk|PlayBook|BlackBerry|Windows Phone|Tablet/i.test(agent)
    || iPadInDesktopClothes;
}

function HandheldNotice() {
  return <main className="handheld-notice">
    <header className="handheld-hero">
      <Image className="handheld-rune" src="/favicon.svg" alt="" aria-hidden="true" width={520} height={520} priority />
      <p className="handheld-brand">ja<span>sw</span>a</p>
    </header>
    <section className="handheld-message" aria-labelledby="handheld-title">
      <p className="eyebrow">Desktop required</p>
      <h1 id="handheld-title">One does not simply optimize runes on a mobile device.</h1>
      <p>This tool was forged for larger screens. Return with a desktop, brave Summoner.</p>
      <p className="handheld-footnote">Your runes can wait. They have survived worse rolls.</p>
    </section>
  </main>;
}

/**
 * JASWA is drawn on one desktop canvas. Narrower displays see that same
 * composition reduced as a whole, rather than a second responsive composition
 * whose columns and controls can drift away from the desktop contract.
 */
export function AppViewport({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<'checking' | 'handheld' | 'desktop'>('checking');
  const [scale, setScale] = useState(1);

  useEffect(() => {
    /* Schedule the result after hydration so the server and first client
       render share the same deliberately blank safety surface. */
    const frame = window.requestAnimationFrame(() => setDevice(isHandheldDevice() ? 'handheld' : 'desktop'));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (device !== 'desktop') return;
    const update = () => setScale(viewportScale());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [device]);

  /* Rendering no application surface until the local device check has run
     prevents a flash of the desktop workspace on a handheld device. */
  if (device === 'checking') return <div className="device-check" aria-busy="true" />;
  if (device === 'handheld') return <HandheldNotice />;

  return <div className="app-viewport">
    <div className="app-canvas" style={{ '--viewport-scale': scale } as CSSProperties}>
      {children}
    </div>
  </div>;
}
