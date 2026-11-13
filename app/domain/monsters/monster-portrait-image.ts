export const portraitUrl = (imageFilename: string) => `/monster-images/${imageFilename}`;
const warmed = new Set<string>();

/** A native menu offers no option hover, so opening it is the earliest time to warm its portraits. */
export function warmMonsterPortraits(imageFilenames: Iterable<string | undefined>) {
  for (const imageFilename of imageFilenames) {
    if (!imageFilename || warmed.has(imageFilename)) continue;
    warmed.add(imageFilename);
    const image = new Image();
    image.src = portraitUrl(imageFilename);
    image.decode().catch(() => warmed.delete(imageFilename));
  }
}
