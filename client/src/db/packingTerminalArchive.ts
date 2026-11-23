/** Reserved non-cache metadata key; no executable queue semantics or automatic restore. */
export const PACKING_TERMINAL_ARCHIVE_KEY = -2;
export const PACKING_TERMINAL_ARCHIVE_MAX_BYTES = 32 * 1024 * 1024;
export const PACKING_TERMINAL_ARCHIVE_MAX_ROWS = 1000;

/** Preservation-only inspection. Unknown data blocks replay; it never becomes write authority. */
export function hasPendingPackingTerminal(meta: unknown, trip?: string): boolean {
  if (meta === undefined) return false;
  const m = meta as { familyPackingTerminalArchive?: { version?: unknown; entries?: unknown } };
  const a = m?.familyPackingTerminalArchive;
  if (a?.version !== 1 || !Array.isArray(a.entries)) return true;
  return a.entries.some((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return true;
    const e = entry as { state?: unknown; row?: { body?: { command?: { scope?: { trip_id?: unknown } } } } };
    if (!['pending', 'committed', 'cancelled'].includes(String(e.state))) return true;
    return (
      e.state === 'pending' &&
      (!trip ||
        e.row?.body?.command?.scope?.trip_id === trip ||
        typeof e.row?.body?.command?.scope?.trip_id !== 'string')
    );
  });
}

/** Settled records remain exportable; a pending copy of an existing queue row is counted only once. */
export function packingTerminalArchiveCount(meta: unknown, rows: Array<{ id: string }>): number {
  if (meta === undefined) return 0;
  const a = (meta as { familyPackingTerminalArchive?: { version?: unknown; entries?: unknown } })
    ?.familyPackingTerminalArchive;
  if (a?.version !== 1 || !Array.isArray(a.entries)) return 1;
  return a.entries.reduce((count: number, entry: unknown) => {
    if (!entry || typeof entry !== 'object') return count + 1;
    const e = entry as { state?: unknown; row?: { id?: unknown } };
    return (
      count + (e.state === 'pending' && typeof e.row?.id === 'string' && rows.some((r) => r.id === e.row!.id) ? 0 : 1)
    );
  }, 0);
}
