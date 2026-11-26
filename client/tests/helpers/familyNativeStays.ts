import { originalNativeStayIntent } from '../../src/integrations/family/nativeStayContract';
import { bookingStayFixture } from './familyBookingStays';
import { stayBundleFixture } from './familyStayBundles';
export function nativeStayFixture() {
  const core = bookingStayFixture(),
    s = core.stays[0];
  core.planner.state.visits.push({
    id: '80000000-0000-4000-8000-000000000001',
    trip_id: core.trip_id,
    activity: 'Manual lodging',
    starts_at: null,
    ends_at: null,
    time_zone: null,
    sort_order: 0,
    explanations: 'Arrival only',
    updated_at: s.stay.updated_at,
    plan_location_id: s.stay.location_id,
    location: structuredClone(s.location),
    timing_kind: 'untimed',
    trip_day_id: s.arrival_day_id,
    planning_day: s.stay.arrival_date,
    revision: 1,
    planned_duration_minutes: 17,
    duration_minutes: 17,
    start_local: null,
    end_local: null,
    deleted_at: null,
    owning_stay_id: s.stay.id,
  });
  return { format: 'family.native-stay-view.v1' as const, core };
}
export function nativeStayIntentFixture() {
  const b = stayBundleFixture(),
    i = b.packet.command;
  const packet = originalNativeStayIntent({
    version: 1,
    source_url: b.packet.source_url,
    command: {
      format: 'family.native-stay.v1',
      operation_id: i.operation_id,
      scope: i.scope,
      stay_id: i.stay_id,
      inner: i,
      arrival_visit_id: '80000000-0000-4000-8000-000000000002',
      keep_stop: false,
      observation: {
        trip_revision: i.observation.trip_revision,
        day_id: i.observation.arrival_day.id,
        location_id: i.stay.location_id,
        owned_visit: null,
        day_visits: [],
      },
    },
  });
  const ack = {
    format: 'family.native-stay-ack.v1' as const,
    acknowledgement: true as const,
    read_current_required: true as const,
    trip_id: i.scope.trip_id,
    stay_id: i.stay_id,
    operation_id: i.operation_id,
    trip_revision_after: i.observation.trip_revision + 1,
    arrival_visit_id: packet.command.arrival_visit_id,
    action: 'create' as const,
  };
  return { packet, ack };
}
