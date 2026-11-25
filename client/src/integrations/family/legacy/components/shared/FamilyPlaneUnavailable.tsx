import React from 'react';

/** Explicit deferred copy; never mount a Nest-backed panel on the Family plane. */
export default function FamilyPlaneUnavailable({ message }: { message: string }): React.ReactElement {
  return (
    <div className="rounded-xl border border-edge bg-surface-card p-8 text-center text-body text-content-muted">
      {message}
    </div>
  );
}
