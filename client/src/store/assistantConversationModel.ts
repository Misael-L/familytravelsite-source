import type { AssistantFocus, AssistantMessage } from '@trek/shared';
import type { AssistantMentionItem, AssistantState, AssistantTripChat } from './assistantStore';

export function httpStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } } | null)?.response?.status;
}

/** Mentions the server takes at most per message. */
const MAX_MENTIONS = 10;

const MAX_MENTION_LABEL = 120;

/**
 * The mentions a question carries: those whose `@label` is still in its text
 * (the text is the truth; deleting the words drops the mention), without the
 * day or places the focus already names.
 */
export function sentMentions(
  mentions: readonly AssistantMentionItem[],
  text: string,
  focus: AssistantFocus | null
): AssistantMentionItem[] {
  return mentions
    .filter((m) => text.includes(`@${m.label}`))
    .filter((m) => !(m.kind === 'day' && focus?.dayId === m.id))
    .filter((m) => !(m.kind === 'place' && focus?.placeIds?.includes(m.id)))
    .slice(0, MAX_MENTIONS)
    .map((m) => ({ kind: m.kind, id: m.id, label: m.label.slice(0, MAX_MENTION_LABEL) }));
}

/** The text of the latest question in the chat. */
export function lastQuestion(messages: readonly AssistantMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== 'user') continue;
    const part = m.parts.find((p) => p.type === 'text');
    return part?.type === 'text' ? part.text : null;
  }
  return null;
}

/** Every trip's comparison back on "after". */
export function backToAfter(byTrip: Record<number, AssistantTripChat>): Record<number, AssistantTripChat> {
  const next: Record<number, AssistantTripChat> = {};
  for (const [id, c] of Object.entries(byTrip)) {
    next[Number(id)] = c.compare ? { ...c, compare: { ...c.compare, mode: 'after' } } : c;
  }
  return next;
}

/** Whether two route focuses point at the same spot of the same route from the same side. */
export function sameFocus(a: AssistantState['routeFocus'], b: AssistantState['routeFocus']): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.tripId === b.tripId &&
    a.ref === b.ref &&
    a.source === b.source &&
    a.focus.sampleIndex === b.focus.sampleIndex &&
    a.focus.distanceMeters === b.focus.distanceMeters
  );
}
