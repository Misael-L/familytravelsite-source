import { useState } from 'react';
import type { CreationTerminalDecision } from './creationTerminalSettlement';
import type { RetainedTask } from './plannerTaskRecovery';

/** Only an explicit second confirmation can arm cancellation. Dismissal is entirely local. */
export function FamilyCreationRecoveryActions({
  task,
  busy,
  run,
  settled,
}: {
  task: RetainedTask;
  busy: boolean;
  run: (work: () => Promise<unknown>) => Promise<void>;
  settled: (result: 'committed' | 'cancelled') => Promise<void>;
}) {
  const [decision, setDecision] = useState<CreationTerminalDecision | null>(null);
  const button = 'rounded-lg border border-edge px-3 py-2 text-content disabled:opacity-50';
  const controls = task.creation;
  if (!controls) return null;
  return (
    <div className="flex flex-col gap-3" aria-label="Original place save decision">
      {!decision ? (
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const prepared = await controls.prepare();
              setDecision(prepared);
            })
          }
        >
          Cancel original planner save…
        </button>
      ) : (
        <div className="flex flex-col gap-2" role="group" aria-label="Confirm cancellation of original save">
          <p>
            Cancel this original place or visit save? If it already saved, it will stay saved. Its original will be kept
            for export. A corrected save must be started separately after the Trip refreshes.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy} onClick={() => setDecision(null)}>
              Keep original save
            </button>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await decision.cancel();
                  await settled(result);
                })
              }
            >
              Confirm cancellation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
