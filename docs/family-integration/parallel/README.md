# Two coordinated work queues — FTS-PARALLEL-20261118-v1

Prepared18 November2026 from verified private integration `0e265c1e92cd20048d775a161f8cf7d3c4462264`. This setup makes no feature, quality-baseline, schema or deployment change. Existing release gates still apply. It assigns two finite queues so “Continue with the next” means the next ready task in that chat's own lane.

- Coordinator A: `/Users/Misael/Downloads/FamilyTravelSite-trek-5.1.4` on `codex/trek-v5.1.4-family-reconcile`. Follow [coordinator queue](coordinator-queue.md).
- Worker B: `/Users/Misael/.codex/worktrees/family-site-worker-b-20261118/FamilyTravelSite-trek-5.1.4` on `codex/trek-v5.1.4-test-types-worker-b-20261118`. Follow [worker queue](worker-b-queue.md).
- Machine-readable ownership/tests: [plan.json](plan.json).
- Exact second-chat starter: [START-WORKER-B.md](START-WORKER-B.md).

## Ownership and continuation

A owns runtime packing fixes, duplication review, release/source qualification, global handoffs, preservation state and reviewed integration. B owns exactly the three assigned test files plus its own status/reports. Neither chat chooses work from the other's queue. Do not give both chats the old global “next handoff” as an assignment.

B starts PB-01. After a tested/committed/pushed packet it updates only worker-b-status.json and its packet report. On a later “Continue with the next,” it resumes unfinished assigned work or selects the next PB item. After PB-03 it reports QUEUE COMPLETE and stops. It does not invent PB-04. If a fix needs production code, a helper/factory outside the allowlist, weakened coverage, any/type assertion/non-null suppression, a baseline/config change or another lane's work, preserve the attempt, report NEEDS COORDINATOR and stop dependent work. A may assign a new versioned batch after review.

A checks the peer branch/status at meaningful checkpoints, not through an unattended background loop. It reviews actual source diffs, tests and commit IDs before cherry-picking. It does not merge an entire unreviewed branch, edit B's checkout/index or reset/rebase B's work. Both chats normally commit and push their own completed packets to their respective private branches; neither pushes main or upstream tags. The shared Git object/ref store is still shared, so do not change global remotes, hooks or Git configuration from B.

## Shared records and environment

Only A updates source qualification/release pins, the master release checklist, shared plan/queues, coordinator status, canonical source preservation baselines and `/private/tmp/family-modernization-active.json`. B's changed test provenance is integrated centrally. Source qualification may remain stale on B until A reviews and records the new source; B must report that honestly and must not “repair” the shared qualification files or scanner. A private worker checkpoint is not release acceptance.

The initial Node version is24.22.2. Existing pinned dependencies and generated SDK inputs are isolated COW copies with distinct file identities and verified bytes/metadata. Workspace package links resolve within B. Ignored caches and project environment/credential files were not copied. Do not replace this with a shared writable node_modules symlink or hardlinks, reinstall/update dependencies, copy production credentials or run npm pretest/pretypecheck hooks that rebuild shared inputs. Use the prepared runner. Keep `.cache/` receipts ignored.

Worktree isolation does not create separate Supabase/Cloudflare/Docker environments. These tasks use mocked HTTP/fake IndexedDB. No hosted requests, live fixtures, migrations, schema or setting changes, Docker resets, media/backfill/transformation/backup operations, production/preview deployments, public source publication, main merges or iOS work are authorized here. Canonical FamilyTravelApp and its mixed index stay unchanged.

## Check runner and resource lease

Run from the assigned worktree root:

```sh
python3 docs/family-integration/parallel/run-check.py --lane worker-b --packet PB-01 --kind preflight
python3 docs/family-integration/parallel/run-check.py --lane worker-b --packet PB-01 --kind tests --label before
python3 docs/family-integration/parallel/run-check.py --lane worker-b --packet PB-01 --kind strict --label before
```

Reuse the prepared before-test/strict receipts when the recorded source/dependency inputs are still exact. After each repair run that packet's tests, format, lint and one strict check with `--label after`. A preceding packet's unchanged after-strict result can serve as the next before result; do not rerun the same full compiler merely to change a label. At final batch acceptance run `--kind all-tests` once for the three-file union. Existing strict failures mean the raw global exit remains1. Read the JSON's packet_diagnostics and actual raw log; never call global strict/CI green just because the assigned file is clean. Do not run strict --update or change any quality baseline.

Strict/typecheck/typed lint/build checks must acquire the shared non-blocking lease at `/private/tmp/family-site-parallel-20261118/heavy-check.lock`. The runner handles this for strict/typed lint. Exit75 means another heavy check is running or immediately free capacity is too low; do independent read-only work or retry later, never delete/override the lease. Focused mocked tests use at most two workers and separate caches. Disk free readings are immediate APFS free space, not necessarily macOS Available including reclaimable caches; the runner records the current value rather than assuming total disk capacity is exhausted.

A wraps any expensive existing build/check script with:

```sh
python3 docs/family-integration/parallel/run-check.py --lane coordinator --packet PA-01 --kind lease -- <existing-reviewed-command-and-arguments>
```

The coordinator's existing isolated configuration/source-binding procedures still apply. The lease does not approve or configure a deployment. Do not run concurrent full builds/typechecks/global lint outside the lease.

## Reports and preservation

Each B report is `worker-b-reports/PB-XX.md`: original and implementation commits; exact files/diff purpose; unchanged test/fixture/assertion coverage; before/after assigned and global diagnostics; commands/raw exit codes/results; any byte-identical generated-JS or fixture-value proof; known unrelated gates; private push/ref verification; next item or explicit blocker. Commit code first, then record that implementation commit in the report/status; do not try to make a commit contain its own hash. Push only the worker branch and verify it remotely.

Before integration A confirms the worker diff is within its lane, preserves existing fixtures/null cases and original assertions, and has no suppressions/config/baseline/runtime edits. A then updates qualification for reviewed changes and runs meaningful combined checks. It does not simply sum overlapping test counts or present inherited results as fresh runs. All prior source/output/archive/evidence/backup data remain; cleanup or disposal of worktrees is a separate recoverable operation after successful integration.

The original checkout `/Users/Misael/Desktop/FamilyTravelSite` is unrelated dirty release/47-maps work. Neither lane should switch to or modify it. Use the explicit paths above, not a project display name alone.
