# Passive game data

**Status:** Binding throughout JASWA
**Reviewed:** November 1, 2026

JASWA only reads game data passively. It never sends its own data back to the
game or its servers. This is a design boundary without exceptions, including
diagnostics, import recovery and experiments.

## What passive means

The application may read existing exports, local captures and data the game
already sends. Decoding, validating and calculating happen on local copies.
The helper's transparent relay carries the game's original application
messages unchanged in both directions. TLS terminates locally as documented
for capture; it does not authorise changing the relayed application bytes.

The helper never originates a game request, replays or retries one, invents a
response, changes a field or header, substitutes a checksum or encryption key,
or translates an envelope into another format. In particular, both replacing
login's `sck` and forcing `sck: "fail"` are forbidden. The game receives the
server's original response even when JASWA cannot understand it.

No JASWA feature or diagnostic tool writes game state, patches game files or
memory, injects code into the game, or automates game input to force a read.
The user may operate the game normally while a passive capture records it.
JASWA's local browser API serves the browser, not the game; the existing
temporary redirect and certificate are capture infrastructure, not permission
to send authored game messages.

## When a source cannot be read

Import parity remains binding. Never suppress an unreadable reward, infer an
item from an incomplete request, or claim a partial account is complete.
Investigate passive sources and keep the gap visible until actual current
data closes it. A complete login can restore an account snapshot; it does not
prove that later live rewards can be read. If the required information cannot
be obtained passively, report that limitation plainly and preserve the evidence.

This boundary applies equally to dependencies, prototypes and tooling outside
the shipped app. No permission prompt or optional setting offers a way around
it. A fix must satisfy both this contract and `IMPORT-PARITY-CONTRACT.md`.

## Verification

The helper test
`passive_relay_preserves_login_keys_opaque_raid_answers_and_later_updates`
drives the production relay through a real local TLS connection. It compares
the complete HTTP messages byte for byte in both directions, including `sck`,
checksums, header spelling and an unreadable marked Raid response. It also
checks that capture originates no refresh or retry, and that a later readable
update is imported while the Raid gap remains visible.

Run it with `cargo test --manifest-path helper/src-tauri/Cargo.toml --lib
passive_relay_preserves`. Every change that adds an outbound capability must
also be reviewed against this contract; a test of an existing path cannot
authorise a new one.
