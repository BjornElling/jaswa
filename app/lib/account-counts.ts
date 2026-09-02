import { readArtifacts } from './artifacts';
import type { GameRecord } from './game-data';
import { count, craftItemCount } from './formatting';

export type AccountCounts = {
  monsters: number;
  runes: number;
  gemsAndGrinds: number;
  artifacts: number;
  relics: number;
};

/* The badge is a statement about the prepared account, not about whichever
   raw fields a caller happened to inspect. Keeping these five figures here
   makes the visible count and the tables share one account boundary. */
export function accountCounts(data: GameRecord | undefined): AccountCounts {
  return {
    monsters: count(data?.unit_list),
    runes: count(data?.runes),
    gemsAndGrinds: craftItemCount(data?.rune_craft_item_list),
    /* The artifact table reads the same canonical model, so a malformed
       artifact can never be counted in the badge while absent from the list. */
    artifacts: readArtifacts(data).length,
    relics: count(data?.relics),
  };
}
