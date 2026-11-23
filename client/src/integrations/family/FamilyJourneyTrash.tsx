import { useJourneyStore } from '../../store/journeyStore';
import { FamilyAggregateTrash } from './FamilyAggregateTrash';
export function FamilyJourneyTrash() {
  const load = useJourneyStore((s) => s.loadJourneys);
  return <FamilyAggregateTrash domain="journeys" onRestored={load} />;
}
