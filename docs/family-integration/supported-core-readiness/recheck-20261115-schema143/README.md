# Schema143 supported-core readiness evidence —15 November2026

Candidate runtime `e287b4c53d3bc7ad88177c566bd936240c95f64f`. Read [the decision](../../supported-core-schema143-readiness.md) and [next bounded packet](../../core-atlas-read-availability-packet.md).

`inventory.json` covers22 domains with concrete desktop/phone journeys, actual limits and inherited-versus-fresh evidence. `migration-delta.json` records55 pending versions and source hashes against the preserved143 ledger. Hosted88 version/name pairs match; no hosted statement checksum, signature/grant/definition or business behavior is claimed. The one historical ownership filename/ledger label difference is retained, not rewritten.

`API-inventory.json` is a bounded local literal-name inventory (128 references;20 Collection cohort APIs), not a minimum release API count or hosted acceptance. Project/Worker observations are read-only metadata. Public entry checks are anonymous GETs, not login or feature acceptance. A status200 HTML fallback at `/family-build.json` is not a valid descriptor or proof of an outage.

`profile-diagnostics.json` records34 actual-module admission cases; `checks.json` also records68 existing connector/gate cases. These102 cases are not full-current-App/browser/database acceptance. Prior catalog/Collection acceptance stays in its original sealed evidence. No feature/source policy was changed and no local service was started.

To repeat only the admission diagnostics, use Node24 with dependencies already installed in the pinned checkout. Create a fresh owner-only0700 directory named `/private/tmp/trek-supported-core-readiness143-<suffix>`, then run `python3 run-probes.py --repo <absolute-qualified-checkout> --output <that-directory>`. The runner checks the exact runtime roots against the candidate, writes only inside the private output directory and calls actual Vitest gate modules with synthetic `.invalid`/loopback sources. It does not connect to those sources. Never deploy that fixture configuration or use it as an authorization grant.

Runtime/source pins, schemas, backups/media/ETL and live targets remain untouched. The source-adoption guard remains an explicit release hold, not a test passed by repinning metadata.
