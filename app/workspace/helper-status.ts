import type { HelperConnection, HelperMiss } from './ports';

/* What the helper's state means to the user, in words. Pure, so the Home card,
   the corner notices and the shell read one wording without reaching into the
   transport that fetched the state. */

/* The Rift Raid result is the one encrypted answer seen so far, and the user
   knows it as rewards, not as a command name. */
const raidResultCommand = 'BattleRiftOfWorldsRaidResult';

/** Three named, the rest counted. */
function nameSome(names: readonly string[]): string {
  return `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`;
}

/**
 * The gap notice's two lines. An unread command is JASWA's to fix and an
 * encrypted one the game's limit, and each sentence names only its own kind:
 * one sentence explaining the other's commands read as if a sale of summoning
 * pieces were a Rift Raid reward.
 */
export function missedChangesNotice(misses: readonly HelperMiss[]): { gap: string; next: string } | null {
  if (!misses.length) return null;
  const unread = [...new Set(misses.filter((miss) => miss.cause === 'unread').map((miss) => miss.command))];
  const sealed = [...new Set(misses.filter((miss) => miss.cause === 'encrypted').map((miss) => miss.command))];
  const sealedNames = nameSome(sealed.map((command) => command === raidResultCommand ? 'Rift Raid rewards' : `${command} answers`));
  if (!unread.length) {
    return { gap: `${sealedNames} are encrypted with a private game-session key — no JASWA or helper update can read them passively.`,
      next: 'Everything else keeps arriving. Restart Summoners War after your runs to load them.' };
  }
  const read = `The helper cannot read ${nameSome(unread)} yet — a JASWA update can fix that.`;
  return { gap: sealed.length ? `${read} ${sealedNames} were missed too: the game keeps their decryption key private; no JASWA or helper update can read them passively.` : read,
    next: 'Everything else keeps arriving. Restart Summoners War for a complete import.' };
}

/* The opening words of the one refusal an update cures, so the Home card and
   the corner notice can tell it from a helper that is broken. */
export const outdatedHelper = 'This helper is older than JASWA';

/** Keep socket evidence in diagnostics; the Home card needs a next step. */
export function helperStatusMessage(connection: HelperConnection): string {
  if (connection.state !== 'unavailable') return connection.detail;
  if (connection.detail.startsWith('Helper is not running.')) return 'Helper is not running. Open it and try again.';
  if (connection.detail.startsWith(outdatedHelper)) return 'This helper is older than JASWA. Update it, then start it again.';
  if (connection.detail.startsWith('Gateway exchange failed:')) return 'Connection to the game was interrupted. Try Restart helper. Check its status for any missing game data.';
  return 'The helper could not load game data. Save an error report in the helper, then restart it and the game.';
}
