# U04-F4a reviewed archive-input scope

Starting commit: `2d25cc818b9844e77b693b4cde2393388184b12f`. Upstream provenance:5.1.4 `2bcfc1bfcbbff0affd097c0f789c835396389572`. This review resolves every original finding without removing source files or waiving whole directories.

## Exact corrections

- reuse-existing-approved-mapbox-fixture: 2 occurrences.
- reserved-invalid-host-for-synthetic-fixture: 62 occurrences.
- reuse-existing-approved-carto-fixture: 1 occurrences.
- exact-canonical-official-markdown-documentation-link: 40 occurrences.
- redact-private-operational-identifier: 8 occurrences.
- redact-private-operational-endpoint: 1 occurrences.

Only canonical HTTPS documentation links in Markdown under the identified repository documentation tree may receive metadata classification. Exact host/path, no credentials/port/query, canonical serialization and the host occurrence position are required. The changelog landing/index paths and one exact functions-document bookmark are reviewed forms; arbitrary or encoded fragments remain rejected. Non-documentation URLs and adjacent secrets retain rejection. Existing scanner exclusions and token allowlists do not expand.

Synthetic test origins move to reserved invalid hosts with distinct origin identities preserved. The two settings test tokens and account-switch fixture reuse existing approved fixture values. Operational project/host identifiers are redacted in checked-in documentation snapshots; explicit redaction metadata distinguishes them from untouched raw evidence. Unredacted originals remain in private Git history.

## Affected-file provenance

- `client/src/components/Settings/MapSettingsTab.test.tsx`: edit; upstream-derived; baseline blob `fe8a434460af689b65b986a1a08fc6bcd14c7941`.
- `client/src/components/Settings/mapSettingsModel.test.ts`: edit; upstream-derived; baseline blob `3183e97d77044f299ff7b868f9c83d50d2414de4`.
- `client/src/integrations/family/FamilyPlannerBoundary.test.tsx`: edit; Family addition; baseline blob `6902e69926bd9b7d6d4e212c4fb240c49f52ee7c`.
- `client/src/integrations/family/bookingCalendarHandler.test.ts`: edit; Family addition; baseline blob `3d4c31fbca21e078fb3a643412d87943a7972289`.
- `client/src/integrations/family/bookingDetails.test.tsx`: edit; Family addition; baseline blob `7b5fbc3a4e1ab05e633d53b11ea1ed5a844e5cc8`.
- `client/src/integrations/family/completeTripRead.test.ts`: edit; Family addition; baseline blob `81dc4942663deb1dd6098d04d45de8933087a9cd`.
- `client/src/integrations/family/deviceRecoveryGate.test.ts`: edit; Family addition; baseline blob `41c8666420bb815f2b8acca8cbcfb606d8faf05c`.
- `client/src/integrations/family/familyOriginalWorkExport.test.ts`: edit; Family addition; baseline blob `016a87c36b67990888669c72dc4d53e311fb7668`.
- `client/src/integrations/family/governanceControls.test.tsx`: edit; Family addition; baseline blob `e99161df3732bddce2e7da4784dd080ae4db3ea4`.
- `client/src/integrations/family/logoutRecovery.test.tsx`: edit; Family addition; baseline blob `de670746aed414b2b23a2234e402b5b050061339`.
- `client/src/integrations/family/nativeBookingCallbacks.test.tsx`: edit; Family addition; baseline blob `f1fd8f3bd36d8ff41bc972404175a4512de06388`.
- `client/src/integrations/family/nativeStayControls.test.ts`: edit; Family addition; baseline blob `53206871df9a5c2a90ed3b1f27ee69fd13d4374f`.
- `client/src/integrations/family/nativeStayCreation.test.tsx`: edit; Family addition; baseline blob `202b2d1f0f3c4d51e3df7164131fce28ea68b4da`.
- `client/src/integrations/family/nativeStayQueueQualification.test.ts`: edit; Family addition; baseline blob `557eb582b9bd8526fe1b05de00e6e3d8ea651c6b`.
- `client/src/integrations/family/nativeStayWriter.test.tsx`: edit; Family addition; baseline blob `72a56ebd69e4815f14873f624ad95a6d03fec37b`.
- `client/src/integrations/family/offlineCategoryQualification.test.ts`: edit; Family addition; baseline blob `30317333fa5a670e2af7f8abcee5715b25767ff2`.
- `client/src/integrations/family/packingAggregateQualification.test.ts`: edit; Family addition; baseline blob `7d6a0d23e6c9c64c1a8229363aece70ee0d0e604`.
- `client/src/integrations/family/packingRecoveryQualification.test.ts`: edit; Family addition; baseline blob `483ab943a1b232b7c1d0f6845697e3da8dc300c6`.
- `client/src/integrations/family/plannerCohort.test.tsx`: edit; Family addition; baseline blob `f14eaf4d00174bb4f91dfadb2d271f3863343f87`.
- `client/src/integrations/family/plannerState.test.ts`: edit; Family addition; baseline blob `ea33577306afaf40aac158083a7e7052ca2933ca`.
- `client/src/integrations/family/plannerViews.test.ts`: edit; Family addition; baseline blob `4a4c08fc9c542b0324a3ace03a4369a237d2738a`.
- `client/src/integrations/family/privateFilePreparationV4.test.ts`: edit; Family addition; baseline blob `584eceea03ab56ec6167f9112dc673ec73481fc6`.
- `client/src/integrations/family/publicImagePreparation.test.ts`: edit; Family addition; baseline blob `5fc3731b3590cf647477d2683cb90231def92e42`.
- `client/src/integrations/family/publicImagePreparationV4.test.ts`: edit; Family addition; baseline blob `e693cdc47281af9170fed3462ea6a5e8f37a3953`.
- `client/src/integrations/family/publicVariantCache.test.ts`: edit; Family addition; baseline blob `7bd6f745a0e6d5ef28637bb1d8aee0b59780d8ad`.
- `client/src/integrations/family/startupReadSession.test.ts`: edit; Family addition; baseline blob `64d228648e3dc4f95d5d2a0cbefaa911b2b99ffc`.
- `docs/family-integration/offline-trip-snapshot-contract.md`: retain unchanged; Family addition; baseline blob `761f2392d202676da92c5222dd339e57aaec559e`.
- `docs/family-integration/packing-bag-command-cancellation-contract.md`: retain unchanged; Family addition; baseline blob `8f44ae4734b93f5bb970184869f441128e5f53b0`.
- `docs/family-integration/packing-bag-foundation-contract.md`: retain unchanged; Family addition; baseline blob `aaffee480d7f94b4d45a25b6df4a5ded75cf694a`.
- `docs/family-integration/packing-bag-ownership-audit.md`: retain unchanged; Family addition; baseline blob `554fb8f0b72c6723a6922d641a8e30bd321e8277`.
- `docs/family-integration/packing-category-aggregate-contract.md`: retain unchanged; Family addition; baseline blob `0336cad2310853633fef3aada45127b89501354f`.
- `docs/family-integration/packing-category-aggregate-sdk-contract.md`: retain unchanged; Family addition; baseline blob `1b38c917ea1793751eac7da4fe902cf66a6165f9`.
- `docs/family-integration/packing-category-commands-contract.md`: retain unchanged; Family addition; baseline blob `658afa54de0186f9c6581768586c0d81bc299a9f`.
- `docs/family-integration/packing-category-contract.md`: retain unchanged; Family addition; baseline blob `df60f4bbeefc4e4d4644f989cf3e2e5a487ec514`.
- `docs/family-integration/packing-category-foundation-contract.md`: retain unchanged; Family addition; baseline blob `dd40a384a243456d631875f7fd8c371238fb8fb7`.
- `docs/family-integration/packing-category-lifecycle-next-packet.md`: retain unchanged; Family addition; baseline blob `498fe6d5e45df77789f9fe983c66ca53e8f55ce3`.
- `docs/family-integration/packing-command-cancellation-packet.md`: retain unchanged; Family addition; baseline blob `aade94051fc7888b00e7e87763de160fc1725dbf`.
- `docs/family-integration/packing-group-database-contract.md`: retain unchanged; Family addition; baseline blob `aeabe5a3b253cd09c8810a5d72a399b3059cc7db`.
- `docs/family-integration/packing-group-writer-contract.md`: retain unchanged; Family addition; baseline blob `194d7cc957534ec9bc2c26db8dc1bf4b43cad1f5`.
- `docs/family-integration/preparation-readiness-contract-v1.md`: retain unchanged; Family addition; baseline blob `58676955006654b793bc0ae8afff3ab6528b4f44`.
- `docs/family-integration/private-file-acquisition-contract-v1.md`: retain unchanged; Family addition; baseline blob `52d3c80e0a45e5d2cc44158b2326dafeef0d6678`.
- `docs/family-integration/public-image-preparation-component-v1.md`: retain unchanged; Family addition; baseline blob `0ecddd89911d8b6b7b8a0d3fec879aa527eed934`.
- `docs/family-integration/public-variant-byte-cache-v1.md`: retain unchanged; Family addition; baseline blob `1d133631b2759b6bc37d73a1bed8324eeeea39bf`.
- `docs/family-integration/saved-trip-public-image-leases.md`: retain unchanged; Family addition; baseline blob `95ef75bf0aa1874545504635f024ea22334081a0`.
- `docs/family-integration/supported-core-preview-readiness.md`: edit; Family addition; baseline blob `3b90f3b87a7f29bbaa0d172ca52c6397176a3d10`.
- `docs/family-integration/supported-core-readiness/backend131/contract.md`: retain unchanged; Family addition; baseline blob `6d20088e81d2b9392e5b09ea8d45b66f1335c1f0`.
- `docs/family-integration/supported-core-readiness/hosted-comparison.json`: edit; Family addition; baseline blob `763631e59ac10c9d80539327b845c0827dfbfed6`.
- `docs/family-integration/supported-core-readiness/hosted-core-schema.json`: edit; Family addition; baseline blob `2fa6409d666501896ec4fac117c76b581ef048b3`.
- `docs/family-integration/supported-core-readiness/hosted-recovery-schema.json`: edit; Family addition; baseline blob `28de462c637b81140fd6ab1e16748ba937a61f3d`.
- `docs/family-integration/supported-core-readiness/inventory.json`: edit; Family addition; baseline blob `9754c1e48b346d971569b30e2acc14fc7b093a46`.
- `docs/family-integration/supported-core-readiness/recheck-20261114/hosted-project.json`: edit; Family addition; baseline blob `eee85858b04ddae7edb808abdfea028e3db9f052`.
- `docs/family-integration/trek-5.1.4-atomic-stay-create-contract.md`: retain unchanged; Family addition; baseline blob `7d6fc0a9113d904d6037dd0528967b8239a00652`.
- `docs/family-integration/trek-5.1.4-native-stay-client-handoff.md`: retain unchanged; Family addition; baseline blob `9c75e8262c38f504e7a51ffb9bb9cd8498962822`.
- `docs/family-integration/trek-5.1.4-stay-timing-foundation-packet.md`: retain unchanged; Family addition; baseline blob `435d5d3701c8a440c3ba106fe2f212f1a6982e4c`.
- `docs/family-integration/u03d16c-activation-decision.md`: retain unchanged; Family addition; baseline blob `f250cda67fa387dd9ee517c2e0ebceffc5015fae`.
- `docs/family-integration/u03d16e-activation-decision.md`: retain unchanged; Family addition; baseline blob `5382848788cf58fd3943e70039e224905ea51d26`.

Additional permitted implementation files are `client/tests/unit/family/secretScan.ts` and its unit test. Their source changes are explicitly reviewed Family scanner/test changes; no release-adoption pin or qualified-source baseline is changed. The upstream-derived settings tests receive fixture-only edits and remain separately recorded in the per-file evidence. The eventual source-adoption packet must qualify those changes; current source/native/history holds remain.

Acceptance: targeted changed-fixture/scanner tests, all120 local-only publisher assertions, real final-commit archive, exact source retention, seven publication hook cases and preservation of canonical317 sources, mixed index, all prior seals and twelve native layouts. No database/service start, hosted SQL, push/PR/merge/deployment, settings/billing, image transformation, backup/media or ignored ETL mutation.
