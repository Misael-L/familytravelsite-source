/** Creation owns this preservation journal; it never shares packing's metadata or replay protocol. */
export const CREATION_TERMINAL_ARCHIVE_KEY = -3;
export const CREATION_TERMINAL_ARCHIVE_MAX_ROWS = 1000;
export const CREATION_TERMINAL_ARCHIVE_MAX_BYTES = 24 * 1024 * 1024;

const digest = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const timestamp = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function logical(v: unknown) {
  return JSON.stringify(v, (_key, value: unknown) => {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Invalid journal JSON');
    return object(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value;
  });
}
type RecordValue = Record<string, unknown>;
type OriginalBody = RecordValue & { scope: RecordValue };
function entryHeader(value: unknown): value is RecordValue & { row: RecordValue } {
  return (
    object(value) &&
    Object.keys(value).sort().join(',') === 'decided_at,key,proof,request_sha256,row,row_sha256,settled_at,state' &&
    typeof value.key === 'string' &&
    digest(value.row_sha256) &&
    digest(value.request_sha256) &&
    timestamp(value.decided_at) &&
    object(value.row)
  );
}
function originalBody(row: RecordValue): OriginalBody | null {
  const body = row.body;
  if (
    typeof row.id !== 'string' ||
    !object(body) ||
    body.operation_id !== row.id ||
    !object(body.scope) ||
    typeof body.scope.trip_id !== 'string'
  )
    return null;
  return body as OriginalBody;
}
function terminalHeader(
  value: RecordValue & { row: RecordValue },
  body: OriginalBody,
  proof: unknown
): proof is RecordValue {
  return (
    ['committed', 'cancelled'].includes(String(value.state)) &&
    timestamp(value.settled_at) &&
    object(proof) &&
    Object.keys(proof).sort().join(',') ===
      'cancelled_at,form,operation_id,request_sha256,result,scope,status,trip_id,version' &&
    proof.version === 2 &&
    proof.status === value.state &&
    proof.operation_id === value.row.id &&
    proof.trip_id === body.scope.trip_id &&
    proof.request_sha256 === value.request_sha256
  );
}
function publishedResult(result: RecordValue & { operation: RecordValue }, body: OriginalBody): boolean {
  const location = object(body.form) ? body.form.location : undefined;
  if (object(location) && 'id' in location && result.location_id !== location.id) return false;
  return (
    result.state === 'published' &&
    typeof result.location_id === 'string' &&
    !!(body.form as { day?: unknown })?.day === !!result.visit_id &&
    result.operation.id === (result.visit_id ?? result.location_id)
  );
}
function committedResult(proof: RecordValue, body: OriginalBody): boolean {
  const result = proof.result;
  if (
    proof.cancelled_at !== null ||
    !object(result) ||
    result.version !== 1 ||
    !['published', 'draft', 'submitted', 'removed'].includes(String(result.state)) ||
    !object(result.operation)
  )
    return false;
  if (body.scope.layer === 'published')
    return publishedResult(result as RecordValue & { operation: RecordValue }, body);
  return (
    body.scope.layer === 'myDraft' &&
    result.state !== 'published' &&
    result.location_id === null &&
    result.visit_id === null &&
    typeof result.operation.op_id === 'string'
  );
}
/** Synchronous preservation guard only; settlement additionally verifies the complete lossless row fingerprint. */
function validEntry(value: unknown): boolean {
  if (!entryHeader(value)) return false;
  const body = originalBody(value.row);
  if (!body) return false;
  if (value.state === 'pending') return value.proof === null && value.settled_at === null;
  const proof = value.proof;
  if (!terminalHeader(value, body, proof)) return false;
  try {
    if (logical(proof.scope) !== logical(body.scope) || logical(proof.form) !== logical(body.form)) return false;
  } catch {
    return false;
  }
  return value.state === 'cancelled'
    ? timestamp(proof.cancelled_at) && proof.result === null
    : committedResult(proof, body);
}

function entries(
  meta: unknown
): Array<{ state: string; row: { id: string; body: { scope: { trip_id: string } } } }> | null {
  if (meta === undefined) return [];
  if (
    !object(meta) ||
    Object.keys(meta).sort().join(',') !==
      'familyCreationTerminalArchive,filesCachedCount,lastSyncedAt,status,tilesBbox,tripId' ||
    meta.tripId !== CREATION_TERMINAL_ARCHIVE_KEY ||
    meta.lastSyncedAt !== null ||
    meta.status !== 'idle' ||
    meta.tilesBbox !== null ||
    meta.filesCachedCount !== 0
  )
    return null;
  const archive = (meta as { familyCreationTerminalArchive?: { version?: unknown; kind?: unknown; entries?: unknown } })
    ?.familyCreationTerminalArchive;
  if (
    archive?.version !== 1 ||
    archive.kind !== 'creation-terminal-archive' ||
    Object.keys(archive).sort().join(',') !== 'entries,kind,version' ||
    !Array.isArray(archive.entries) ||
    archive.entries.length > CREATION_TERMINAL_ARCHIVE_MAX_ROWS
  )
    return null;
  const rows = archive.entries as Array<{ state: string; row: { id: string; body: { scope: { trip_id: string } } } }>;
  if (
    rows.some((e) => !validEntry(e)) ||
    new Set(archive.entries.map((e) => (e as { key: unknown }).key)).size !== rows.length
  )
    return null;
  return rows;
}
/** Unknown journals refuse automatic replay, including metadata rewrites. Settled rows do not block Trip reads. */
export function hasPendingCreationTerminal(meta: unknown, trip?: string): boolean {
  const rows = entries(meta);
  return rows === null || rows.some((e) => e.state === 'pending' && (!trip || e.row.body.scope.trip_id === trip));
}
/** A settled operation must never be resurrected, even by a producer holding an old form session. */
export function creationTerminalBlocks(meta: unknown, trip: string, operation: string): boolean {
  const rows = entries(meta);
  return (
    rows === null ||
    rows.some((e) => e.row.id === operation || (e.state === 'pending' && e.row.body.scope.trip_id === trip))
  );
}
export function creationTerminalArchiveCount(meta: unknown, rows: Array<{ id: string }>): number {
  const archived = entries(meta);
  if (archived === null) return 1;
  return archived.reduce((n, e) => n + (e.state === 'pending' && rows.some((r) => r.id === e.row.id) ? 0 : 1), 0);
}
