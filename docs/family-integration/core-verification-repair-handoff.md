# U04-F5b2 — formatting and catalog carryover verification repair

14 November2026, `codex/trek-v5.1.4-family-reconcile`. Parent74455c234. Mechanical formatting is isolated in commit `a24d831c2f7b3c7929fc44730740b73be39302a9`; the subsequent inventory/review commit is identified in the sealed acceptance receipt. No native Collection transfer is enabled by this packet.

## Completed

All eight excess format failures are repaired. The complete client format gate passes with2137 existing grandfathered files and the same2137-entry baseline. No baseline entry or formatting configuration changes. The permitted files are the six Family integration sources/tests listed in the preceding continuation and the scanner implementation/test pair.

The configured formatter tried to reorder application-handler module imports. Because Family Auth/settings has an existing import cycle, the handler retains its exact module-import evaluation order using file-local `organize-imports-ignore` and `sort-imports-ignore` directives, plus a reason comment. Body formatting remains checked. No lint/security rule, source baseline, dependency or native layout is disabled. The scanner test's named import specifiers are sorted within their existing declaration; this does not reorder modules.

A TypeScript compiler-tree comparison proves equivalent syntax for all eight files, including literals, flags, operators and type-only fields. It ignores source positions/layout-only multiline metadata and canonicalizes named-import-specifier order. Existing comments/directives are preserved after whitespace normalization; the handler's three explicit formatter-only comments are the sole admitted additions. Three positive and12 negative controls prove the comparison rejects literal/operator/binding/module-order/type/optional-chain/regex/template/strict-mode/PURE/directive changes. Scoped ESLint diagnostics are identical apart from positions: zero errors,14 inherited warnings, no growth.

The carryover inventory now records **both** `catalogDiscovery.ts` and `catalogDiscovery.test.ts`. Each is byte-identical to accepted catalog commit82fd5dcac and its sealed F5 proof. Their query/identity/archive/cancellation/media boundaries were reviewed and24 catalog regressions were rerun. The prior real7 API and14 native browser checks are inherited evidence, not relabelled fresh runs. All120 original carryover entries, their approved revisions, nine local patches,29 earlier additions and pinned Supabase dependency remain intact. Only two additions with exact hashes/reason/provenance were appended. The inventory command passes with31 additions; the checker itself is unchanged.

All existing guard cases remain. The count assertion now expects31 reviewed additions, the dynamic byte-mutation matrix includes both catalog files, and two explicit omitted-registration cases prevent recurrence of this gap. All46 guard cases pass, including changed imports/patches/dependencies, unrecorded sources, modified catalog bytes and omitted catalog registrations. This is a bounded carryover review, not qualified-source/native/history adoption.

## Validation and preservation

- 248 client cases across13 affected test files pass, including actual Family handler/native Collection refusal, stay/packing activation, normalized readers and scanner negatives.
- 24 catalog cases, both typechecks,120 publisher checks and46 actual carryover command guards pass. The full format check and ordinary public-loopback build/key scan pass. The only bundled JWT is the synthetic public anon key.
- 136 canonical migrations,317 SQL-test sources, the mixed canonical index,12 exact native5.1.4 layouts, original plan, dependencies, old checkouts and114 prior evidence seals/8,225 members remain preserved. All other tracked bytes outside the reviewed allowlist stay exact.
- No database service, SQL, Auth/Storage/browser smoke or hosted API call is introduced. Prior data/media/recovery evidence remains sealed; no new row-recovery proof is claimed. No production/preview/main/push/publication, hosted schema/settings/billing, backup/ETL or image-transformation change occurs.

Sanitized results: canonical modernization `evidence/u04f5b2-verification-2026-11-14`. The exact final-commit archive is check-only/unbound, the clean publication checkout advances locally, and seven simulated push-hook cases remain required. Existing5.1.2 qualified-source/native/history adoption holds stay closed; no adoption pin is changed.

## Next

Proceed with the **normalized Collection storage/command/membership prerequisite** in [the contract](core-collection-transfer-contract.md). First freeze the additive schema/API/recovery and original-operation contract using the real canonical list/item domain; then rehearse it in a new isolated target. Keep all four transfer POST refusals until one complete native path preserves typed/manual identity, notes versus shared description, overrides, media and retry outcomes. Atlas partial-read availability remains a separate contract. The formatting and two-file inventory gaps above are closed and must not be repeated as the next packet.
