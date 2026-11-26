# Live change notifications during save refresh

Production QA of `68ac231e` reproduced a refresh refusal after a note or activity committed successfully. A reload recovered the exact saved records and completed copy/date assignment on desktop and phone. Live itinerary notifications invalidate the repository while the save's follow-up snapshot is still loading; the isolated API rehearsal did not deliver those notifications.

The candidate retries only a retired canonical read, at most twice. Each attempt acquires fresh snapshot/read guards. The original private session, repository generation and trip-layer epoch remain fixed across attempts. A layer change, including a change away and back, still refuses the operation. Inherited original-stay observations do not retry. Authorization failures, local unsaved work and unconfirmed commands retain their existing behavior. No mutation command is replayed and no stale snapshot is published.

The regression injects an invalidation while a required ancillary read is in flight. It fails on the deployed implementation with `stale_read`, then passes with the bounded retry. Separate cases exercise continuous invalidations and a changed trip layer. Publication still checks unchanged local store references and uses the existing guarded cache transaction.

This is a website-only follow-up to schema 186. It does not require another Supabase migration. Production QA of the candidate runs only in the already-approved private test Family; public traffic remains on the explicitly approved version until the matching follow-up source tag/version is approved.


Save-generated notification echoes are also held until the note, activity or calendar command has acknowledged and published its canonical result. They are coalesced and delivered on the next task after promise/UI continuations, rather than being discarded. Each delivery rechecks the original account and trip binding. An account change cancels held callbacks. Saves on different trips stay independent; nested saves release only when every holder finishes. Other incoming changes still invalidate the view normally and use the bounded read retry.
