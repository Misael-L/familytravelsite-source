# U04-F5c5b2a — native Collection read and identity session

This bounded prerequisite qualifies the native read/identity layer of C5b2. It does not complete the coordinated writer/queue/Restore cohort or activate the ordinary Family handler. The UI layout is unchanged. Database schema142 is unchanged.

## Frozen native consumer cohort and actual gaps

- Desktop CollectionsPage/useCollections and phone Collections screens share collectionStore, collectionsApi and CollectionPlace DTOs. GET /addons/collections and GET /addons/collections/:id currently route through the unbounded legacy collectionHandler. The new read facade is qualified through the actual native store and Axios adapter in tests; ordinary handler replacement is deferred to coordinated activation.
- Desktop SaveToCollectionModal and phone MSaveToCollectionSheet share useSaveToCollection. The inspector has its own membership effect. Both send provider/name/coordinate selectors; the legacy handler matches names. Both consumers catch errors as not-saved/empty. Replace these together with canonical selectors and honest unavailable/loading/error state in the activation packet. A name is never an identity.
- Manual creation shares POST /addons/collections/places with a refused transfer route. A separate Family observed-command path is required. Do not reopen the transfer route. Status, edit and reorder must use C4, not retired item writers. Bulk changes need explicit per-operation partial-result semantics rather than invented transactionality.
- Native Collection ownership/member roles are not Family permission authority. Use actual can_edit_items/can_admin/is_owner from the checked index, followed by database authorization at execution. Do not fabricate member rows to enable native buttons.
- Root metadata/cover editing, library reordering, sharing/invites, labels/ratings, file/GPX import/export, Trip/Collection transfers and private byte onboarding remain outside this supported cohort. Item/root Trash plus authorized reachable Restore are required before removal is enabled.

## Read-session contract

The owner captures exact source URL, user, Family, nullable person, Auth session and account-scoped FamilyIdentityRegistry. Its mandatory assertCurrent must include the repository generation and source/account/Family/person/session lifetime, including A→B→A. Construction clones the scope. Every RPC and publication is fenced; explicit retirement is permanent. The fixed SDK gateway now includes the existing library read as its eighteenth name so the index also uses the captured bearer instead of ambient account auth. Database session/MFA/permission checks remain authoritative.

Library reads are complete and bounded by the accepted C5a contract (maximum1,000 roots). Detail reads join a complete authorized index entry to bounded C3 pages (maximum2,000 items/16MiB). Root facts, content revision and item count must agree across those reads; concurrent changes cause refusal rather than partial publication. No name/provider fallback, raw table fallback or optimistic empty state is allowed. A newer request for the same read resource retires its older response. Every returned snapshot exposes current(); the controller must recheck it before publishing or using a delayed callback.

Editor reads require an item-to-parent association from a qualified detail or membership result; a numeric key alone cannot authorize or select a parent. IDs use separate collection, collectionItem, person and category registry kinds. A catalog source UUID is never inserted into a provider-ID field or substituted for a saved Trip location. Membership accepts exactly catalog(kind,id), Trip(trip_id,location_id) or Collection(collection_id,item_id). All fuzzy native selectors refuse before the RPC.

## Native projection and losslessness

Every one of the nine typed records remains present with its complete frozen canonical sidecar: country/place/food/hotel/experience/airport/airline/guide/manual. Numeric native rows keep item and Collection IDs, independent description and notes, real Family category, address/contact, original ordering and stored media identities. Four nonlocation types remain listed with null native map coordinates; their canonical facts remain available. No city-coordinate substitution, fake provider IDs, zero prices, invented currencies, ratings, labels, member roles or Trip provenance.

Hero and thumbnail remain distinct. The native gallery image is a ready stored hero only; thumb-only data yields a gallery placeholder while retaining the thumbnail separately. Private/unavailable covers retain their explicit canonical identity and availability. No Storage bytes or transformations are requested in this packet.

TREK requires owner_id:number; retained Family lists can have no linked owner. Such roots stay in the complete typed result with native:null and unavailable:unlinked_owner. requireNativeCollection refuses422, rather than dropping the list or inventing a person. Coordinated activation must provide an explicit Family compatibility state for this case; it must not blindly map all roots through that helper and hide the entire library. This is an interface compatibility gap, not a reason to rewrite the retained database.

## Remaining coordinated packets

C5b2b: native command session and durable queue for exact preparation requests/originals, per-Collection serialization, retries/discovery/fresh-session cancellation and source/account/logout/restart/offline retention; observed lifecycle and reachable Restore. C5b2c: bind native reads/membership/forms/status/order/removal to those qualified ports together, including nullable owners and Family permission flags, then final-artifact desktop/phone/PWA acceptance. Preserve the12 protected native presentation files. Ordinary/hosted activation and release/source-adoption gates remain closed until the complete selected cohort qualifies.
