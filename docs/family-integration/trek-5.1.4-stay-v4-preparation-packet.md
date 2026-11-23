# U05-B2b3d1 — saved v4 media/preparation compatibility

Prerequisite: accepted U05-B2b3d reader audit and its exact local commit/evidence. Preserve the latest integration branch and every previous packet. This packet closes a demonstrated saved-v4 compatibility gap; it is not a general media rewrite or public-sharing implementation.

## Outcome and order

1. Define one readonly media context from an already validated complete envelope, using the existing strict parser selected by its real format. Preserve the original v4 envelope, canonical booking/stay core, hash, owner/head generations, actor/source/Trip, expiry and published layer. Derive only the media/file inputs needed by existing components. Do not serialize a derived old envelope as v4, change capability flags, extend access lifetime, or fabricate preparation receipts.
2. Connect explicit ready public-v1 image preparation and saved image resolution to that context, reusing the existing cache and descriptor checks. First test the real admission/component/session chain. Preserve old v2/v3 behavior and exact negative source/ordinary/hosted cases. An image receipt proves observed image bytes only; it cannot claim whole-Trip readiness, durable residency, fresh membership or permission to read private files. Missing or evicted bytes remain placeholders. No transformation, original-image fallback, implicit bulk download or new byte store.
3. Keep private-file acquisition refused until a separately tested v4 generation-owned RAM lease can use the same context and existing authorization-checked acquisition. Record that concrete follow-up if it does not fit this public-image slice. Do not enable public sharing, native whole-Trip Done, hosted cold reads or ordinary lodging actions as part of this repair.

## Scope before edits

Pin HEAD, canonical mixed index, 136/317 source hashes, 12 exact upstream layouts, package locks, qualification/adoption metadata and all prior evidence manifests. Read the actual consumers before editing:

`client/src/integrations/family/completePreparationAdmission.ts`, `completeTripRead.ts`, `completeTripV4.ts`, `completeTripSnapshot.ts`, `completeTripProjection.ts`, `preparationComponentRead.ts`, `publicImagePreparation.ts`, `publicImagePreparationRead.ts`, `publicVariantImages.ts`, `offlineTripSession.ts`, `privateFilePreparationRead.ts`, `privateFileMemory.ts`, `savedPrivateFiles.ts`, `preparationReadiness.ts`, `preparationReadinessRead.ts`, and `offlineTripQualification.ts`.

Allowed implementation: a small typed context/helper and focused tests next to these modules; narrow admission/public-image/saved-session wiring; corresponding contract/handoff docs and a tiny synthetic local driver. Private-file modules are read-only until their lease subpacket is specified. No layouts, native types, database schema, permissions, dependency locks, source-adoption pins, error baselines or generic feature flags are in scope. If an explicit qualification source entry is necessary, specify the one exact existing owned local source and marker, add ordinary/alias/hosted negative tests first, and document it before editing. Never broaden the global source allowlist merely to make an old parser accept v4.

## Required tests

Start with semantic adapter tests through the actual public preparation admission/component/session, not helpers mocked to report ready. Prove v4 native-owned stay and booking identities survive derivation; old packages retain their contract; unknown/malformed/truncated/mismatched hashes, owner/head/revision changes, foreign Trip and source aliases refuse. Distinguish verified empty descriptor sets from unavailable components.

Use bounded synthetic WebP objects, real response/stream/cache validation, and exact ready-v1 object URLs. Cover thumb/hero selection, missing or unready variant, wrong recipe/object/content, partial HTTP failure, quota, explicit retry, later eviction and placeholder. Assert zero `/render/image/` attempts, no originals, private documents or signing tokens in cache receipts, and no change to queue/import/file originals. Interleave source/actor/Trip ABA, logout, expiry and generation changes at admission, network, digest, put, resolution and disposal. The original accepted generation may never publish late bytes after retirement.

Only after module contracts pass, requalify or create a separately owned local derivative using existing guard tooling; do not adopt an arbitrary running database. Test actual SDK/AAL2 and generated desktop/phone App with a tiny synthetic fixture, then actual offline/PWA reopening/eviction on the final artifact. Distinguish real browser/SDK proof from fake IndexedDB unit fixtures. Preserve and stop only newly owned services; log exact source, artifact and process receipts. Heavy real-media copying stays in the user's Terminal and is outside this packet.

## Commands and completion

Use installed Node v24.22.2. Run selected `vitest run` tests from `client/`, configured `tsc --noEmit`, scoped typed ESLint without warning growth, the unchanged seven client gates, backend carryover and source/toolchain guards. Run builds sequentially after tests/typecheck. Build one explicitly local qualified artifact and one ordinary artifact with loopback/public-anon input only; verify final descriptor hashes, JavaScript syntax, secret scan and ordinary refusal. Do not repin the three known release holds.

Finish when v4 public images are truthfully prepared/resolved under the original lease, old paths and negative authority cases pass, actual final-artifact desktop/phone proof is recorded, all source/evidence preservation checks pass, and one scoped local commit plus sealed sanitized handoff explains private-file and release gates. If actual browser proof is blocked, record it explicitly; do not claim full preparation or activate native controls. No push, publication, preview/production, hosted SQL/settings/billing, transformations, original backups/media or ignored ETL operation.
