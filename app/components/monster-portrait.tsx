import { portraitUrl } from '../lib/monster-portrait-image';

/**
 * `decorative` hides the portrait from assistive technology, for the one case
 * where the name is already announced beside it: inside `MonsterLink` the
 * button carries the monster's name, so a portrait labelled with it too would
 * have a screen reader say the monster twice.
 */
export function MonsterPortrait({ imageFilename, initial, name, decorative = false }: {
  imageFilename?: string;
  initial: string;
  name: string;
  decorative?: boolean;
}) {
  if (imageFilename) return <span
    className="monster-portrait"
    {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name })}
    style={{ backgroundImage: `url(${portraitUrl(imageFilename)})` }}
  />;
  return <span className="monster-portrait placeholder" aria-hidden="true">
    {initial || <svg className="monster-portrait-silhouette" viewBox="0 0 64 64" fill="currentColor"
      aria-hidden="true">
      <path d="M20 14 27 9 31 22 33 9 44 16 48 29 56 34 54 40 48 37 43 48 39 44 38 56H26L25 44 21 48 16 37 10 40 8 34 16 29Z" />
      <path className="monster-portrait-eyes" d="M18 29Q26 30 29 39 20 38 18 29ZM46 29Q38 30 35 39 44 38 46 29Z" />
    </svg>}
  </span>;
}
