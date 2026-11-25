# U04-F2 readiness inputs and reproduction

Read the parent supported-core-preview-readiness.md first. inventory.json is a22-domain acceptance mapping, not a claim that all domains work or that local proof is hosted proof. Backend inventory is a bounded literal reference map; hosted-comparison.json contains the actual 15-function subset/ledger check. Source/readiness witnesses include expected unavailable/empty replies and must not be presented as passing feature acceptance.

Reproduce36 actual-module diagnostics against the b93124b source qualification, installed locked dependencies and Node 24:

```sh
python3 docs/family-integration/supported-core-readiness/run.py --output /private/tmp/family-preview-readiness-new-review
```

Choose a new nonexistent output directory. This runner calls no hosted tool, database or provider. It checks the qualified source before executing the captured probes. Hosted JSON is point-in-time read-only evidence from 12 November 2026, not a replayable authenticated session; the SQL preflight file contains only catalog queries and rollback. Do not run it against another project or mutate a migration ledger to match this metadata.
