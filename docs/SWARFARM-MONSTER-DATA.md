# Swarfarm monster catalogue — synchronisation contract

**Status:** Binding maintenance rule for the monster catalogue
**Reviewed:** October 20, 2026
**Source:** Swarfarm Bestiary API

The catalogue gives JASWA current monster ids, names, image file names and
archetypes without putting ordinary user traffic on Swarfarm.

## Principle

JASWA **never** fetches Swarfarm data from the browser, during a JSON import,
or as part of an ordinary page view. A user's import is always looked up in the
local snapshot `app/data/swarfarm-monsters.json`. This is part of AGENTS.md
§6's rule that user data stays on the user's computer: no lookup leaves it.

Swarfarm describes its API as public but rate-limited, and asks web
applications to proxy it through their own server. A local snapshot removes
both browser CORS and repeated lookups by end users.

## Controlled refresh

Only a deliberate maintenance action may run:

```text
npm run refresh:monsters
```

The command (`scripts/refresh-swarfarm-monsters.mjs`) reads the paginated
endpoint `GET /api/v2/monsters/` at 100 monsters per page, with a pause of at
least 3 seconds between pages. It:

- makes no request while the local snapshot is younger than 7 days
  (`retrievedAt` in the snapshot);
- stores only the fields JASWA needs: `com2us_id`, `name`, `image_filename`
  and `archetype`;
- writes atomically, so the existing data survives a network or response
  error;
- stops on HTTP 429/503 and honours a reported `Retry-After` by leaving the
  operator to wait and start a new manual refresh;
- makes no automatic retry, no parallel requests and no periodic polling.

`--force` is only for an explicit refresh before the seven days are up. It does
not change the rate limiting.

Swarfarm image file names are stored as metadata, but the catalogue sync never
fetches monster images. Only images already present in `public/monster-images`
are shown, so a data refresh never becomes thousands of extra requests.

## Monster images

**Monster images are never committed.** The repository is public, and the
artwork is not ours to redistribute. `public/monster-images/` is git-ignored,
and each working copy fetches its own files:

```text
npm run fetch:monster-images
```

The command reads the image file names from the local snapshot and fetches one
image at a time with a 250 ms pause. It:

- skips what is already present, so an interrupted run resumes by running the
  command again;
- writes to a temporary name and renames, so an interruption never leaves a
  half-written PNG;
- checks the PNG signature before accepting a file;
- stops on HTTP 429/5xx rather than pressing the host further;
- rewrites `app/data/local-monster-images.ts` from what is actually on disk
  after every run.

`--limit <n>` fetches only the first n missing images. `--all` walks the whole
list again instead of only the missing ones.

A missing image is not an error: the roster shows the monster's initial
instead, so the app works fully without a single fetched file.

## Validation and use

A new snapshot is accepted only when every page was fetched, the number of
monsters observed matches the API's `count`, and every `com2us_id` is unique.
The catalogue is the only source of monster names.

After a successful refresh, run the project's build and
`npm run verify:collaboration-species` and `npm run verify:element-qualified-names`.
If the build fails, or a newly imported id is still missing, keep the previous
working snapshot and investigate the deviation before another round of
requests.

`app/data/swarfarm-monster-details.json` (each master id's family id and
skill-ups to max, read by `monster-catalog.ts`) is a second Swarfarm snapshot;
no refresh command writes it.

## Collaboration monsters

How a collaboration monster and its generic re-release relate — one statistics
species, two owned identities — is `MONSTER-SPECIES-DECISION.md`, and the table
lives in `app/data/collaboration-species.json`, outside this snapshot so a
refresh never overwrites it.

## Sources

- [Swarfarm README — API](https://github.com/swarfarm/swarfarm/blob/master/README.md)
- [Swarfarm Bestiary API](https://swarfarm.com/api/v2/monsters/?page_size=1)
