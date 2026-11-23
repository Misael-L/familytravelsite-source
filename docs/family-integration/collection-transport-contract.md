# U04-F5c5b1 — strict Collection transport

Local prerequisite: accepted schema142, C3 bounded reads, C4 observed item authoring and C1 lifecycle/history. This packet adds no database migration. It does not activate native handlers, controls, queue replay or ordinary/hosted recovery.

## Source and session boundary

`collectionRpc.ts` is the fixed 17-name SDK gateway. It captures the configured source, client, user, session and request arguments before awaiting Auth, refuses mismatches and expired/malformed claims, and sends the captured bearer explicitly through the installed SDK. JWT decoding is only a refusal fence: GoTrue/PostgREST/PostgreSQL remain the authentication, current-session, membership, permission and MFA authorities. No service key enters product code. The transport also requires a caller-owned synchronous lifetime fence before dispatch and after success/failure. The native controller must retire that fence on account, Family, source and session changes; this packet does not implement that controller.

## Reads and identity

Exact versioned schemas reject unknown fields, unsafe integers, wrong Family/Collection/item identities, malformed cursors, mixed observations and incomplete page chains. UUIDs remain canonical; no name, coordinate, provider or numeric-ID guessing. Library C5a remains separate. Content page size is 1–100; complete native reads stop at 20 pages/2,000 items or16MiB and refuse rather than silently return a partial collection. Each page is independently bounded to2MiB. Membership requires the exact catalog, trip-location or Collection-item identity and preserves errors instead of reporting saved=false.

All nine item kinds remain typed: country, place, food, hotel, experience, airport, airline, guide and manual. Four nonlocation kinds are not coerced into a city or map location. Venue coordinates remain their own. Description and personal notes are separate. Only ready ordinary catalog/variants/v1 WebP URLs on the configured Storage origin are accepted. Private cover identity is retained with explicit unavailable state; no private/signed/original/transform URL is invented or fetched.

## Observed commands and originals

1. Normalize URL/coordinate fields with the accepted backend helper before requesting an observation. Omitted fields preserve; explicit NULL or supported empty strings clear. Preparation refuses requests not already normalized.
2. Capture scope, operation UUID, exact action/body and observation once. Preparation returns a deep-frozen exact original, including server-derived snapshot content or an explicit materialization no-op. Each deliberate new action gets a new operation UUID; retries retain the original UUID/request.
3. Execute only in the original session. Discovery/cancellation may use a fresh session for the same source, user, person, Family and Collection, with database authorization rechecked. Never silently replace observations or originals after conflicts.
4. Minimal committed receipts are historical facts, not current rows. Do not merge a delayed acknowledgement into newer content, fabricate a successful write, retry unknown failures with a new UUID, or treat transport failure as cancellation.

JSON is limited to finite plain data: no getters, prototypes, cycles, undefined, sparse arrays, functions, symbols or unsafe integers. Inputs are cloned before waiting; returned values are deep-frozen without freezing caller objects. Retained history keeps arbitrary JSON keys as data. PostgreSQL deletion cursor timestamps retain microsecond ordering, not JavaScript millisecond precision.

## Lifecycle and recovery

C1 Collection and item Trash/Restore, context, outcome, cancellation and history keep exact target identities and original revisions. For item commands, expected_collection_revision is the aggregate content revision, not the root metadata revision. Root/item trash cursor ordering and paired values remain exact. Existing archived-parent rules and database permission/session checks remain authoritative. Removal controls stay gated until the next packet provides a reachable authorized Restore path.

## Qualification boundary

Mocked contracts cover malformed/refused/partial responses, immutable originals and lifetime changes. A separate opt-in suite uses the actual pinned Supabase JS SDK, real local GoTrue and PostgREST on an owned Unix socket. Its allowlisted Python bridge changes only synthetic fixture records; it returns actual HTTP/database responses and refuses external URLs or Storage requests. Auth tokens remain in a private temporary file/stdin, never source, arguments, evidence or logs. Ordinary test runs do not silently claim this live qualification: set FAMILY_COLLECTION_TRANSPORT_FIXTURE only after preparing the explicit owned fixture.

`collection-transport/source` contains the reviewed setup/bridge copies; they require the already guarded Collection test support and compact fixture. Do not run them against a hosted project. No real private byte acquisition, browser/PWA queue/restart or visible native activation is claimed here.
