# Public client configuration and artifact scanning

S2 contract, 15 November 2026. Applies to the existing build-time Family browser configuration; it does not replace the SDK, backend, Auth, native presentation or source-capability admission.

## Allowed public configuration

The browser uses the existing VITE_DATA_PLANE, VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY inputs. Receipt qualification accepts only a canonical HTTPS origin whose exact SHA256 appears in client/publicClientConfig.mjs, paired with a syntactically valid sb_publishable_ key. The two reviewed origin identities are the existing Family primary project and the isolated synthetic core fixture. This is not a suffix, arbitrary-subdomain or all-project exception. Origin hashes are identifiers, not encrypted secrets. Source archives contain no actual project URL or key.

A public key identifies the client application; it does not authorize data access. This contract neither checks that a key belongs to the project nor substitutes for current-session, permission, RLS, API or operational backend acceptance. The synthetic identity is for the existing network-isolated local gateway; listing it grants no hosted access. Mapbox values retain the scanner's existing independent rules. Unknown VITE settings and nonempty Family qualification flags refuse receipt-qualified HTTPS builds. HTTP local profiles emit no receipt and keep their existing admission rules.

Secret/service-role keys and JWTs remain refused. This packet introduces no key migration, credential retrieval, schema or hosted setting change. A previously rejected legacy JWT cannot become publishable by renaming its field.

## Exact artifact and immutable source binding

With FAMILY_SOURCE_COMMIT set to a full lowercase 40-character Git commit, Vite emits family-public-config.json. It contains the source commit, version, finalized entry identity, origin/key hashes and the exact paths, sizes, hashes and character spans of complete generated production environment records and two already-existing compiler-folded public-origin uses. No raw origin or key is copied into the receipt. Existing application configuration remains in the ordinary generated chunks; no string is hidden, moved or encoded to bypass scanning.

The artifact scanner independently reads the build descriptor and finalized entry/chunk bytes, verifies the caller's --source-commit, re-parses each environment object and exact folded context, re-derives every span and validates the fixed origin policy and public-key shape. It refuses symlinks, changed bytes, malformed context, unknown fields, duplicate environment keys, paths outside the fixed assets shape and oversized receipts/chunks. Only FamilyTravelSite dist mode can classify these slots. Source archives and the other repository never acquire the exception.

Two folded contexts are separately pinned to exact asset-name families and hashes of the complete containing expression/function: the disabled local reader gate (also its exact callee) and the assistant account-scope key. Only the already validated origin value is normalized when deriving a context hash; no executable artifact changes. Changed function logic, another asset or an unrelated URL does not qualify. At least one complete production environment record is mandatory; inline-only receipts cannot approve a build. This deliberately refuses future compiler/source-shape changes until individually reviewed.

The scanner creates an in-memory classification view covering only the validated URL value spans. It does not edit artifact bytes or waive an entire file or line. Other URLs, project references and credentials on that same minified line still undergo the existing scanner. A new sb_secret_ rejection also applies outside artifact mode. A missing receipt leaves the original host rules in force. An invalid receipt is a scan error, not a fallback approval.

The publisher creates its build from an immutable Git extract, overrides any inherited FAMILY_SOURCE_COMMIT with that exact source commit for the build, and passes the same expected commit to the dist scanner. Archive scanning and retained-source verification remain unchanged. A receipt alone is not a signature or proof of reproducible source: the trusted clean-source build procedure and external expected commit are required. A standalone caller must independently establish which commit it built.

## Capability and release boundaries

No JSX/CSS, native protected file, backend carryover, API, database or image reader changes. An HTTPS receipt does not qualify writers, queue replay, private files, recovery or advanced features. All existing default/HTTPS capability refusals remain tested. No local-v1 marker is extended to HTTPS.

Focused tests cover finalized-byte/source/receipt tampering, malformed generated environments, unknown origins, keys, same-line extra URLs, secrets/JWTs/service-role values, path/context/symlink attacks and immutable publisher sequencing. A real ordinary HTTPS production build must also pass the scanner with its externally pinned commit. Previous private builds remain unchanged and retain their original scanner refusal.

Release acceptance still requires the separately recorded quality, hosted ledger/API, engine/timezone, protection, independent database-plus-files recovery, explicit HTTPS writing and real Worker/source binding checks. Check-only source archives are unbound. This contract authorizes no production/preview deployment, push, billing change or backup/media/ETL work.
