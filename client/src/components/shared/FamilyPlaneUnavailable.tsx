import React from 'react'

/** Explicit deferred copy; never mount a Nest-backed panel on the Family plane. */
export default function FamilyPlaneUnavailable({ message }: { message: string }): React.ReactElement {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
      {message}
    </div>
  )
}
