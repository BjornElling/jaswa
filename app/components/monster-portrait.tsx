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
  return <span className="monster-portrait placeholder" aria-hidden="true">{initial}</span>;
}
