# SWEX review

**Reviewed:** October 30, 2026

This review compares SWEX's published release and source with JASWA's helper.
It covers the proxy, Steam routing, lifecycle, profile export, LiveSync,
diagnostic loggers, plugin updates and their relevant release/issue history.
It is a code and captured-packet review, not a live Steam compatibility test.

The source baseline is SWEX [v1.1.0](https://github.com/Xzandro/sw-exporter/releases/tag/v1.1.0)
and [eb7f8c0](https://github.com/Xzandro/sw-exporter/tree/eb7f8c09b976d7b76c51ebb30765bfdf381c3888),
the repository head inspected here. The public SWGT plugin is identified
separately below; it is not part of SWEX's built-in LiveSync. SWOP's internal
consumer was not verified, so this review makes no claim about its merge rules.

## Findings applied

### Committed state must be distinguished from candidates

SWEX's [LiveSync](https://github.com/Xzandro/sw-exporter/blob/v1.1.0/app/plugins/live-sync.js)
emits explicit actions and selected fields. A sale carries the requested rune
identifiers; a dungeon acquisition carries the actual reward record. It does
not discover current inventory by recursively merging every plausible record.
Its default branch ignores unsupported commands. That limited coverage cannot
replace JASWA's import parity contract: `ConvertArtifactByCraft` is absent from
the inspected built-in dispatcher.

The [SWGT personal plugin](https://github.com/Cerusa/swgt-personal-swex-plugin/blob/5581abb5d0e55149089b5ab4c778cf21c84c83cc/SWGTPersonalLogger/index.js#L499)
handles that command explicitly. It drops the before/after copies and retains
the confirmed artifact for its consumer. This supports the distinction seen in
the developer's saved October 30 packet: the confirmed record is the committed
artifact, while the before record is old and the after record is a candidate.
The response also reports the conversion material's remaining quantity.

JASWA now recognises confirmation as a field role across entity types instead
of adding one command-specific path. A confirmed record wins over other copies
of its identifier, independently of JSON order. Before records are excluded in
both naming forms. Candidates cannot create inventory. The existing request,
ownership and continuous-path checks still apply to every acquisition and update.
Compatible partial confirmations can update an existing item; disagreement on
the same field is refused. A partial record cannot introduce a new item that
the update reader would then silently decline.
This keeps the historical-reward protection without calling a confirmed change
an unknown account path.

Fixtures cover empty and populated accounts, both confirmation naming forms,
lists, conflicting confirmations, archives, queries and a subsequent dungeon
reward. The real conversion replay compares the full committed record, all
engraved copies, the spent material and unchanged runes, not just final counts.

### An unreadable account update must not be called auxiliary traffic

SWEX's [proxy](https://github.com/Xzandro/sw-exporter/blob/eb7f8c09b976d7b76c51ebb30765bfdf381c3888/app/proxy/SWProxy.js)
continues after a decryption failure. That behaviour is useful for unrelated
service traffic, but cannot guarantee JASWA's account stays complete.

The review found JASWA previously made only login decoding failures visible;
an unreadable known sale or conversion could be logged as auxiliary and leave
the saved account stale. The service now uses the same request classification
as the account reader. An unreadable known account operation is a missed
change, named on every surface while capture goes on; auxiliary chat/service
lookups are not account data. Tests exercise both with empty and populated
accounts and confirm that the next change still arrives and a fresh login
clears the list ([Live import coverage](./LIVE-IMPORT-COVERAGE.md)).

### A failed save must preserve the last complete export

SWEX's profile exporter explicitly checks required login data, creates its
output directories, sanitises account filenames and offers timestamped copies.
Its [profile exporter](https://github.com/Xzandro/sw-exporter/blob/eb7f8c09b976d7b76c51ebb30765bfdf381c3888/app/plugins/profile-export.js)
also illustrates why publication and data validation are separate concerns:
the account may be valid while writing it still fails.

JASWA already validates login sections, sanitises filenames and reports write
errors. The review found its fixed-name export could nevertheless be truncated
before a failed write completed. Exports and private reports now stage the
complete file beside the destination, flush and close it, then replace it.
Windows tests verify creation, replacement and a locked destination: the old
file stays intact and no incomplete staging file remains after the failure.
This is a JASWA improvement found during comparison, not a claim that SWEX
implements atomic publication.

## Safeguards already covered

| SWEX evidence | JASWA comparison and decision |
| --- | --- |
| [Issue 320 and its fix](https://github.com/Xzandro/sw-exporter/issues/320#issuecomment-630959086): a new API command suffix stopped grind live files. [Release 0.0.66](https://github.com/Xzandro/sw-exporter/releases/tag/v0.0.66) also records a command-case correction. | The request reader normalises case and numeric `_v…` suffixes once. Keep that shared classification; do not copy a case-sensitive command switch. |
| [Release 1.0.0](https://github.com/Xzandro/sw-exporter/releases/tag/v1.0.0) freezes proxy events so one plugin cannot rewrite another's input. | Rust capture accepts borrowed request/response values and builds a separate candidate account before publication. Raw incident evidence is retained separately. No plugin mutation API is needed. |
| [PR 593](https://github.com/Xzandro/sw-exporter/pull/593) adds optional cleanup of action files left on disk. | JASWA does not replay disk-based action files. It keeps one live account, session/instance identity and monotonic revisions; starting the next game session drops the previous account. Do not introduce a replay folder that could reapply sold gear. |
| [Proxy stop and quit cleanup](https://github.com/Xzandro/sw-exporter/blob/eb7f8c09b976d7b76c51ebb30765bfdf381c3888/app/proxy/SWProxy.js#L219) removes the hosts redirect and flushes DNS. | JASWA owns only its marked redirect, opens listeners before redirecting, rolls back failed startup, and cleans up on exit and installer replacement. Recovery keeps the running session and bound listeners. Existing tests hold these boundaries. |
| [PR 574](https://github.com/Xzandro/sw-exporter/pull/574) addresses silent certificate export failure when the folder is absent. | JASWA creates required directories, propagates failures, provisions the per-user identity before elevation and refuses a missing identity after elevation. |
| SWEX's proxy disables upstream keep-alive in Steam mode and resolves upstream IPv4 separately from the redirected hosts file. | JASWA resolves real upstreams before redirecting, rejects loopback DNS answers and uses a fresh upstream connection per exchange. The game's keep-alive connection remains supported; ambiguous POSTs are never retried. |
| SWEX bounds its on-screen log and makes full logging opt-in. | JASWA already bounds diagnostics and private traffic separately, requires consent for private reports/recording, and stops logging visibly on disk failure. Logging does not merge data into the account. |
| SWEX's plugin updater checks metadata, payload size and hash and offers an update decision. | JASWA uses explicit installer downloads, Authenticode verification and a source/installer fingerprint. The compiled program and installer are both verified before recording a release. Arbitrary downloadable plugins and automatic account uploads would conflict with JASWA's local-only contract. |

## Follow-up work requiring evidence or a separate implementation

1. **HTTP transfer and content encodings.** SWEX uses its HTTP library's gzip
   handling, and [PR 583](https://github.com/Xzandro/sw-exporter/pull/583) fixes
   an invalid-trailer interaction with the proxy library. JASWA's reader rejects
   chunked transfer encoding and has no outer HTTP gzip decoder; the game's
   encrypted response's zlib compression is a different layer. This is a real
   compatibility limitation, not a demonstrated cause of the saved artifact
   error. Add bounded decoding and framing fixtures before supporting it. Do
   not copy Node's header workaround into a Rust relay that forwards original
   bytes. Known unreadable account responses now fail visibly.
2. **Full proposal/accept/decline captures for rerolls and refinement.** SWEX's
   [efficiency logger](https://github.com/Xzandro/sw-exporter/blob/eb7f8c09b976d7b76c51ebb30765bfdf381c3888/app/plugins/rune-drop-efficiency.js)
   reads proposed results from commands its built-in LiveSync does not forward.
   Displaying a candidate's efficiency does not prove the candidate is owned.
   In particular, `refineRune` is not currently classified as a committed
   mutation by JASWA. Capture the complete workflow before changing that rule;
   importing a preview to avoid a visible gap would introduce a worse defect.
3. **Broader capture regression corpus.** The saved sale, bulk upgrade,
   dungeon-start and artifact-conversion reports, plus the traffic capture,
   exercise the observed failures. They do not prove every unrecorded activity.
   Capture both successful and declined operations, reward previews and claims,
   sales and repurchases. Keep personal packets local and turn understood
   behaviour into small synthetic fixtures. Continuing to diagnose additional
   unsupported shapes during an existing gap, with bounded evidence, would
   help expose several missing readers in one session instead of one per release.

No new remote data transmission, preference reset, certificate bypass or
automatic publication is part of this review.
