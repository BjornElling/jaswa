export function MonsterPortrait({ imageFilename, initial, name }: { imageFilename?: string; initial: string; name: string }) {
  if (imageFilename) return <span
    className="monster-portrait"
    role="img"
    aria-label={name}
    style={{ backgroundImage: `url(/monster-images/${imageFilename})` }}
  />;
  return <span className="monster-portrait placeholder" aria-hidden="true">{initial}</span>;
}
