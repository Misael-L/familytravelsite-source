# Atlas native availability contract reproduction

Baseline `8d6fd108fa628ebb0ff6992defee56afaea0e460`; no application source is changed. Read [the finding](../../core-atlas-availability-contract-gap.md) and [the bounded continuation](../../core-atlas-availability-rendering-packet.md).

Eight current-behavior diagnostics pass. They reproduce defects rather than qualify a repaired feature: real Family stats reader/handler/Axios adapter feed actual useAtlas, desktop AtlasPage and phone stats/bucket components. Supabase select responses, the repository session and graphics/network dependencies are synthetic; Auth/settings use standard unit fixtures. Atlas facts are not injected into a fake controller, and no write acknowledgement is fabricated. This is a unit DOM contract proof, not an authentication, production build/browser/RLS/Storage proof.

Three **desired behavior regressions intentionally fail** on the unchanged baseline: unsupported bucket read must refuse, successful stats must survive bucket failure, and the actual phone must not render unknown city count as measured zero. Their exit1 is retained and is not called a green release gate. No failing test is installed in the application's normal test roots. `consumer-contract.json` pins the inspected native source and lines.

To reproduce with the existing installed lock and Node24, create a fresh owner-only0700 `/private/tmp/trek-atlas-contract-<suffix>` directory. Run `python3 run-contract-probes.py --repo <absolute-checkout> --output <that-directory>` (expected8/8 and exit0). Run the same command with `--wanted` (expected3 assertion failures and exit1 on this pinned baseline). The runner verifies unchanged application roots against the baseline and copies only the existing native test's graphics mocks. Everything generated stays in the private output directory. Do not point it at hosted data or deploy this synthetic configuration.

No schema/settings/billing/source gate/preview/production/backup/ETL/media operation is involved. Existing source-adoption holds remain. These receipts justify the original packet's explicit stop at a native representation gap; they do not claim the Atlas repair is done.
