/**
 * `decorative` hides the portrait from assistive technology, for the one case
 * where the name is already announced beside it: inside `MonsterLink` the
 * button carries the monster's name, so a portrait labelled with it too would
 * have a screen reader say the monster twice.
 */
const portraitUrl = (imageFilename: string) => `/monster-images/${imageFilename}`;
const warmed = new Set<string>();

/**
 * Fetches and decodes portraits ahead of their first paint, once each, so a
 * monster added to a list arrives with its face rather than a beat later. For a
 * native menu, whose options send no hover events, the moment it opens is the
 * earliest signal there is.
 */
export function warmMonsterPortraits(imageFilenames: Iterable<string | undefined>) {
  for (const imageFilename of imageFilenames) {
    if (!imageFilename || warmed.has(imageFilename)) continue;
    warmed.add(imageFilename);
    const image = new Image();
    image.src = portraitUrl(imageFilename);
    image.decode().catch(() => warmed.delete(imageFilename));
  }
}

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
