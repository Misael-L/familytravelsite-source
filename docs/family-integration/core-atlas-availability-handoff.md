# Atlas availability — local acceptance

Backend preflight resolution: [the144 aggregate correction](core-travel-statistics-handoff.md) now proves/fixes the Trip-day fan-out and contracts excess view grants locally. The UI acceptance below remains valid at its original fixture scope; it is not a combined144 browser release claim.

15 November 2026. The coordinated packet is complete locally on `codex/trek-v5.1.4-family-reconcile`, descending from `61cbd41975cdc6830c396bbb70723d09d11072ff`. The local commit and final source hashes are bound by the canonical evidence receipt after committing. No deployment or source-adoption approval follows from this acceptance.

## Result

The Family handler reads the existing completed-travel aggregate view and explicit visited-country marks. The complete country lookup is validated. A missing aggregate group is a legitimate zero because that view groups completed, unarchived Trips; malformed/incomplete totals or country lookups fail instead of becoming zero. City/region and per-country trip/place counts are omitted when unmeasured. Continents derive only from actual visited-country codes. Legacy dashboard statistics and the carried backend are unchanged.

Stats, geography, bucket, regions, layers and country-detail reads have explicit loading/ready/unavailable/error states. Real totals and country geometry survive each other's failure and unsupported sections. Retry is real and limited to errors. Unsupported bucket/regions/layers/detail reads return stable501 availability codes; all unsupported mutations remain refused. Bucket unavailability has native unavailable content instead of empty-list advice or Add. Genuine supported empty data and native/Nest behavior remain intact. Missing metrics display an accessible neutral dash in the same existing slot.

Source/actor/owner generations guard reads, retries, country detail, search and retained map callbacks. Old success/error/finally cannot repaint or clear new data. Unsupported region zoom does not repeatedly fetch or dim country geography. Map initialization also paints data that arrived before another initial request settled; country bounds survive a theme redraw.

The four native Atlas display files retain every one of their242 existing class/style attributes. The12 separately pinned native planner/map presentation files remain byte-exact upstream5.1.4. Only availability props/branches use the existing EmptyState/button/locale system; no CSS/layout replacement. All28 locales include the required unavailable wording.

## Qualification and limits


-314 affected Atlas/catalog/navigation/source cases in14 files pass, including27 new real reader→handler→Axios→hook→native desktop/phone cases and the delayed map-readiness regression.0 failures or pending.

-80 retained Collection cases in4 files pass separately;63 backend-carryover checks pass separately. No fictitious full-suite total is claimed.

-Backend and client typechecks pass. Scoped client lint improves140 to131 inherited advisories with no new advisory/error; shared scope has none. Locale parity/use gates and six structural/style gates pass. No baseline or dependency was widened.

-The repository-wide size gate still exits1. Other oversized files and stale entries are inherited; the changed Atlas hook shrinks1231→1205 wrapped lines, below its1207 allowance, making that unchanged ratchet entry stale. No allowance was increased or hidden. The gate is not claimed green; reconcile its downward-only entry with broader source/quality adoption, without laundering unrelated size failures.

-The ordinary `npm run build:web` succeeds with an explicitly synthetic loopback source and noncredential publishable-key placeholder. Qualification flags are off; actual App/SDK/handler/consumers are used. The unchanged artifact credential scanner passes437 files. This fixture artifact is not deployable.

-Final built desktop/phone browser proof covers normal synthetic password login, actual Atlas facts, unavailable bucket, independent stats/geography faults with actual Retry, unsupported-region zoom, and same-document logout/back/relogin/Atlas navigation while an older read is pending. Final flow count, screenshots and request counts are in the sealed receipt. No page errors, hosted requests, business mutations or `/render/image/` attempts are accepted. Read-only dashboard Collections is explicitly unavailable in this Atlas-only fixture. This is synthetic SDK/Auth-response proof, not real Auth/RLS/database/Storage, PWA, physical iOS or provider-byte acceptance.

Earlier consumer-gap diagnostics remain sealed unchanged. Their intentionally red assertions are now covered by passing desired regressions in normal application test roots; old diagnostic witnesses were not inverted to require bugs forever. No hosted metadata was refreshed in this packet.

## Backend aggregate preflight to retain

The existing canonical `20260718020000_travel_stats_completed_and_person.sql` joins Trip rows to trip_places before summing Trip duration. SQL inspection raises a potential duration fan-out for completed Trips with multiple places. This packet preserves that authoritative view's current semantics; it does not prove live numerical accuracy or silently change SQL. Before claiming exact day totals in composed/backend acceptance, reproduce with0/1/multiple-place completed Trips, independent visited marks and archived controls; if confirmed, fix the aggregate at its canonical grain with a separately rehearsed migration. Catalog geography must never substitute for a venue/visit. This is a bounded backend correctness preflight, not a new feature/schema redesign.

## Preservation and next

143 migrations,351 prior canonical schema/test/support sources, the mixed canonical index,131 prior SHA seals/9,087 members and11 auxiliary manifests remain exact. All outside-scope tracked website bytes, backend carryover, source/adoption/permission/variant pins, package locks, protected layouts and three other checkouts are preserved. The local publication checkout and source archive are check-only, unbound and unpublished; seven hook cases remain required. Existing5.1.2 source-adoption metadata intentionally continues to hold release acceptance.

Continue [composed supported-core acceptance](core-composed-acceptance-packet.md), not advanced feature parity or another Atlas redesign. Then perform explicit tested-source adoption and the separate hosted-contract/engine/current-protection/recovery/release steps. Historical observations88 hosted/143 local and55 pending require freshness before release; no hosted migration is authorized here. Advanced stay/packing/private profiles, Tours/providers and unsupported global actions stay off for the first core preview. Independent database-plus-files restore and incremental/off-device protection remain unproved.

No hosted SQL/settings/billing, remote push/main, production/preview deployment, transformation, backup/media or ignored ETL operation occurred. Only the browser's owned ephemeral loopback server/Chrome were started and closed; retained database fixtures were not restarted.
