# Q27f2 — original-bound arrangement outcomes and finite conflict repair

Frozen from the Q27f1 audit on local schema150, 16 November2026. **Implemented and accepted locally by [Q27f2](core-native-arrangement-outcome-handoff.md) on schema151; native client/profile enablement remains Q27f3.** The requirements and original diagnostic observations below remain the historical frozen contract, not a claim of hosted availability. Preserve TREK5.1.4 presentation, all completed Family packets,368 canonical source/test inputs, the mixed canonical index, existing data and current authorization. No new tables, columns, indexes, triggers, feature activation, hosted migration or deployment are needed for this prerequisite.

## Demonstrated prerequisite

The native move/reorder/Trash/Clear/Undo producers reach `arrange_family_native_visits_v1` with no IndexedDB original. Their memory-only pending entry/Undo callback does not survive reset or failed Undo. The native history removes an Undo entry before awaiting its command. Retaining the command when Undo is invoked can repair uncertain Undo recovery without editing that native history implementation.

The existing actor/Trip/operation-indexed `family_auth.trip_location_receipts` already stores the exact arrangement acknowledgement. Its digest domain is **native_arrangement**, distinct from the lower-level **visit_arrangement**, creation and editor domains. The proposed endpoint is absent from the real schema/API. Replaying the writer is not a read-only Check.

## Public interface

Add one uniquely named wrapper, with no overload:

```sql
public.get_family_native_arrangement_receipt_v1(
  p_trip_id uuid,
  p_operation_id uuid,
  p_scope jsonb,
  p_plan jsonb
) returns jsonb
```

Use `LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''` and a single private `family_auth.planner_arrangement_receipt(uuid,uuid,jsonb,jsonb)` implementation, `LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''`. Explicitly retain the reviewed owner; revoke all default/public/anon/service-role execution and grant only the authenticated execution required by the wrapper/helper. Do not grant receipt-table access or expand schema/table/RLS permissions. No external calls, advisory locks, row locks, writes, sequences, advisory status posting or draft restaging belong in this read.

Inputs preserve the original native scope and entire plan exactly. Scope keys are exactly `version,trip_id,user_id,family_id,person_id,layer`; version1; layer `published|myDraft`. Plan keys are exactly `version,action,visit,days`; action `move|trash|restore|reorder|clear`. Days have exactly `id,civil_day,observed,order`, one or two entries, at most1000 observations/order IDs each. Observations have exactly `id,revision`; selected visit is null for reorder/clear and an ID/revision object for move/trash/restore. Validate UUIDs, real ISO civil dates, unique day IDs, positive safe-integer revisions and structurally correct arrays without reading current day membership or visit revisions. Preserve original JSONB values; do not normalize away numeric differences before digesting. Combined `octet_length(p_scope::text)+octet_length(p_plan::text)` is at most180000, matching the writer. Null/malformed/oversize input is refused before any lookup. Do not call `plan_visit_arrangement` to validate historical observations: it evaluates current state and rejects successfully committed originals after later edits.

Exact response keys:

```json
{
  "version": 1,
  "trip_id": "original-trip-uuid",
  "operation_id": "original-operation-uuid",
  "scope": "the original JSON object, not a string",
  "plan": "the original JSON object, not a string",
  "request_sha256": "64 lowercase hexadecimal characters",
  "status": "unknown or committed",
  "result": null
}
```

The illustrative strings for scope/plan stand for JSON objects. `unknown` has a JSON null result. `committed` has the immutable **stored** native arrangement acknowledgement as result, including its original state, change flag, operation and affected/removed visit revisions. Do not synthesize that result from current planner state or call `plan_stage_state` to rewrite historical state. A later submitted/removed/replaced private draft does not undo the fact that the earlier save committed; canonical planner/governance reads determine what is displayed now.

The digest is exactly the existing outer writer framing:

```sql
encode(sha256(convert_to(
  jsonb_build_array('native_arrangement',p_scope,p_plan)::text,
  'UTF8'
)),'hex')
```

Use the existing indexed receipt lookup by `(trip_id,actor_user_id,operation_id)`. The audit's real EXPLAIN uses the existing primary-key index; add no index. Return `unknown` only when no matching receipt exists and no creation-terminal collision exists. Return `PT409` for an operation already bound to different intent/domain or terminal creation cancellation. The existing terminal-exclusion trigger already protects writers atomically; preserve it unchanged. Do not reuse creation cancellation for edits or arrangements.

Validate the stored acknowledgement before returning it: version1, recognized historical state/change flag, consistent published result versus private operation envelope, original anchor, unique bounded affected IDs/revisions and removed IDs/day identities belonging to the original plan. Bound the entire output at2MiB. Refuse inconsistent/corrupt historical data rather than returning a success-shaped object. Do not expose private ledger IDs, digests or content beyond this original-bound result.

## Current authority, including the discovered staging distinction

Call the reviewed `require_private_session(false)` at entry and before return. Require current Trip access, non-trashed Trip, actor user/person and Family membership matching the original scope. A still-signed token after logout/session expiry/deletion is not current authority. Keep current MFA, travel membership, head/member, direct/propose/deny and person-context behavior.

Published outcomes require current direct schedule authority through `require_visit_write`. Private outcomes first require `require_plan_stage(...,'visit')`. **Restore additionally requires direct schedule authority in either layer.** A member with only proposal permission cannot restore or publish an arrangement.

The audit proves an additional nuance: an ordinary direct-only member passes `require_plan_stage`, but staging an actual private change subsequently requires `can_stage_capability(...,'trip.schedule.manage')`; direct-only private no-op succeeds because nothing is staged. Preserve both facts. For a found private receipt whose operation is non-null, require that current staging capability before exposing its historical acknowledgement. A historical private no-op with null operation needs only the initial plan-stage gate. An authorized `unknown` read does not grant write authority: the actual writer must still decide whether a subsequent command stages a change. Do not weaken staging rules or silently promote proposals to direct writes. Test head/direct-only/proposal-only/deny and the no-op distinction explicitly.

Authorization failure is `42501`; malformed input `22023` (or the specific PostgreSQL invalid-cast/date class); original mismatch `PT409`; output bound `54000`; inconsistent historical receipt `55000`. Missing API stays unavailable. Do not turn these into fabricated success, cancellation or a replacement operation.

## Four demonstrated permanent-conflict sites

Change **only these four literal raises** from `40001` to `PT409`, retaining messages and every other function byte/owner/ACL/setting:

- `public.arrange_family_native_visits_v1(uuid,uuid,jsonb,jsonb)`: `Original arrangement scope changed` and `Native arrangement UUID reused`.
- `family_auth.plan_visit_arrangement(uuid,jsonb)`: `Selected occurrence changed` and `Day membership, order or occurrence revision changed; reload`.

Each was reproduced under real authenticated SQL and through real PostgREST. A bounded one-second HTTP probe timed out while the isolated database recorded repeated rollbacks; the owned REST service had to be interrupted to terminate the request. **No completed409 HTTP response was observed for these probes.** Do not report one. The initial30-second timeout and controlled retries are retained as diagnostic evidence.

Do not change PostgREST retry settings, catch all40001 errors, relabel genuine serialization/deadlock errors or mass-rewrite other functions. A separate coordinated repeatable-read SQL control preserves the genuine database40001 behavior. Pin the two reviewed function definitions before replacement and assert that only those four intended literals change. Other custom40001 sites, including ones in the same helper, stay untouched until separately demonstrated. Use a CLI-generated migration name after inspecting installed CLI help; never edit historical migrations or the existing canonical index.

## Acceptance before client cutover

Use a new positively guarded copy of the sealed stopped schema150 target. Iterate DDL only there; preserve all old fixtures/services/seals. A migration rehearsal must advance a fresh150→151 target without rewriting the150 historical ledger entries or losing any incoming/original row. Expect two new routines and only the two reviewed old definitions changed; no table/trigger/index/RLS/old grant changes. Rehearse and compare the final migration to the tested prototype.

Prove true SQL read-only invocation and real stable POST behavior for unknown and committed outcomes for all five actions; repeated reads must leave graph/ledger/audit counts exact. Verify original echo and PostgreSQL digest with numeric/Unicode/control cases, wrong actor/person/Family/Trip/layer/action/domain/operation, malformed/oversize plan, result caps, no-op/private staging nuances, current permission loss/restoration, outsiders, AAL1, actual logout/new login, expired/deleted sessions and current deleted Trip behavior.

Prove later reorder/move/Trash and submitted/removed/replaced private operations do not rewrite historical results or restage anything. Reproduce all four repaired permanent conflicts over real HTTP as prompt409/PT409 refusals with no graph changes and no repeated rollback loop; preserve genuine40001 and unrelated compatibility controls. Verify the terminal-cancellation trigger still rejects a collided UUID atomically. Review privilege/search-path/RLS/security/index behavior and run available appropriate advisors without falling back to a hosted project.

Application source, source qualification, accepted build, native controls and HTTPS admission remain unchanged for the server prerequisite. Only after this passes, implement Q27f3 native producer/queue/recovery and the exact isolated-profile RPC admission. Preserve existing task/editor/creation behavior and all presentation pins. Full Q26, inherited global quality, independent database-plus-files recovery, unused-source cleanup and hosted release remain separate gates.
