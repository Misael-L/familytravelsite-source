# Traveler photos and mixed avatar references

The live trip-card ticket can show initials even when the signed-in user has a valid photo. The profile menu signs only that person's canonical avatar path. Hub enrichment signs all traveler paths together; older noncanonical references make the browser request policy refuse the complete batch. The previous signer soft-failed the whole batch, including valid paths. The person's identity, trip creator relationship and existing stored photo are intact.

The browser connector now isolates a refused batch into individual signed reads, each attempted once through the unchanged host policy and Storage RLS. A successful batch retains its ordinary per-object error handling and does not fan out. A failed single-object read is not repeated. Original account checks remain mandatory before and after every asynchronous operation; an account change aborts isolation and publication. No avatar is uploaded, replaced or deleted, and no database migration is required.

The regression uses the real Supabase Storage SDK and production request policy with a canonical photo plus a noncanonical legacy reference. It fails on the deployed code because the valid person's URL is absent. The corrected path forwards only the permitted individual request. Connector tests cover returned/thrown batch failures, per-object errors, single-object failure and an account change. The existing ticket rendering tests cover signed photos and creator-first ordering.

This follow-up is a separate website release from production `25fadb2c`. Its exact source tag and Cloudflare version must be prepared and approved before publication/activation.
