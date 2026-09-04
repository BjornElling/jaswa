'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

const canvasWidth = 1920;

function viewportScale() {
  return Math.min(1, window.innerWidth / canvasWidth);
}

/**
 * JASWA is drawn on one desktop canvas. Narrower displays see that same
 * composition reduced as a whole, rather than a second responsive composition
 * whose columns and controls can drift away from the desktop contract.
 */
export function AppViewport({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const update = () => setScale(viewportScale());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return <div className="app-viewport">
    <div className="app-canvas" style={{ '--viewport-scale': scale } as CSSProperties}>
      {children}
    </div>
  </div>;
}
