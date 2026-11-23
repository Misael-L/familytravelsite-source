# Q110 — Copied packing UI chain retired

Completed 18 November 2026 on the private integration branch. Incoming `caefebdcd764490f570a541c454cb1f661cab59a`; implementation `e708a6b9a0aafb8a04b62758e2502156c6351637`; source-bound fixture build `dcc414ae54c3fce7c74a00511bf4b28c30f75539`. [Export/helper/type/source audit, unchanged consumer checks, output comparison and replay](evidence/packing-ui-retirement-20261118/README.md).

Only copied PackingListPanel, PackingListPanelList, PackingListPanelCategoryGroup and PackingListPanelItemRow are removed. Their three UI imports are internal, with no outside candidate consumer or augmentation. The original itemWeight helper and all five outside module consumers, including two type-only consumers, remain byte-exact. No helper/model/state/ops/context/sibling removal or native packing replacement.

1,215 identical cases pass before/after. Build/compiler, four source guards and three artifact-source controls pass. All 3,792 outputs other than the sourceCommit configuration match byte-for-byte. Format/warning gates pass unchanged. Size15→14 removes only the old item-row finding; every other failure line remains exact. G2 and independent release gates remain open.

## Exact next packet — Q111 bounded copied system-notice UI review

Review before selecting any deletion:

- client/src/integrations/family/legacy/components/SystemNotices/SystemNoticeModal.tsx
- client/src/integrations/family/legacy/components/SystemNotices/SystemNoticeHost.tsx

The initial search finds the copied Host importing ModalRenderer from the copied Modal with a .js specifier. That is a real module edge; resolve JavaScript-style imports to the actual TypeScript sources. Native App imports the distinct native Host. Do not infer that either copied module is unused solely from that distinction. Review all ModalRenderer/SystemNoticeHost exports and any outside runtime/type/test/mock/tool/configuration consumers. Keep a required exporter or resolve its exact outside boundary before removal; do not widen into stores/APIs/renderers merely to retire the modal's size finding.

Preserve native components/SystemNotices, App's native Host entry, modal/escape/host/native support tests, mobile desktopOnly conditions, cold-session fetch behavior, keyboard/focus/close/body-scroll semantics, auth/session and notice/link safety. Keep copied SystemNoticeBanner/BannerRenderer/ToastRenderer, systemNoticeStore/authStore, notice DTO/API/read/write/permission helpers and all model/type/dependency consumers, unless separately reviewed and explicitly selected. Same-name native/copied modules are distinct; feature conditions in tests do not enable unsupported Family integration/provider functionality.

Recompute complete raw runtime/import/export/type/ImportTypeNode/JSDoc/mock/require and actual root/config/tool/public/source/license/dynamic/glob/cache closure, including .js-to-TS resolution and alternative entries. Inspect global/module augmentation and any implicit types; actual compiler-program/effective-type proof is required where applicable. Keep all 6,091 current graph nodes/edges/source bytes, twelve protected native files, outside tracked bytes and positive candidate-import controls.

Prototype only proved-closed modules. Compare unchanged native host/modal/escape/native support, session/auth and notice store/API/link-permission consumer cases before/after with expanded names/files/status/multiplicity exact. Do not weaken assertions, fixtures, mocks, configuration, timeouts, skips or coverage. Any demonstrated reachable bug takes priority with red/green proof. Build committed qualified source; inspect complete generated output and independently prove any actual CSS/chunk/SW/receipt changes. Do not copy Q110's byte-identity result without fresh evidence.

Update only actual deleted provenance rows/pins; run fresh compiler/native/source/artifact/actual format/warning/size gates with current generated-declaration hashes. Keep all 14 remaining size findings explicit. No rule/baseline/exclusion/suppression/scanner relaxation, blind helper deletion, UI replacement or new API/provider/writer/profile admission. Finish bounded preservation, check-only archive, normal private checkpoint push and precise continuation pointers.

Use `/private/tmp/trek-core-packing-ui-retirement-20261118/next-baseline-private.json` after verified push. Preserve canonical 151 migrations/370 sources/index/README, all sealed evidence and complete source archives, unrelated checkouts, backups/ETL/media. Check available disk before prototypes/builds; retire only verified disposable copies after proof. Shared backend remains8cc0fe3f. Website only; no main/preview/production/Supabase/schema/settings/billing/transformation/public mirror/backup/ETL/iOS changes.
