import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { nativeStayFixture } from '../../../tests/helpers/familyNativeStays';
import { stayPlaceChoices } from '../../components/Planner/stayFormModel';
import { installPlannerStayWritePort } from '../../repo/plannerStayPort';
import { nativeStayControlsQualificationEnabled } from './coherentStayQualification';
import { FamilyIdentityRegistry } from './identity';
import { nativeStayCreationDraft } from './nativeStayCreation';
let source = 'http://127.0.0.1:57171';
vi.mock('./legacy/data/supabase/env', () => ({ getSupabaseUrl: () => source }));
const fixture = () => {
  const core = nativeStayFixture().core,
    ids = new FamilyIdentityRegistry(core.user_id);
  return {
    core,
    ids,
    body: {
      place_id: ids.register('place', core.planner.state.locations[0].id),
      start_day_id: ids.register('day', core.days[0].id),
      end_day_id: ids.register('day', core.days[core.days.length - 1].id),
    },
  };
};
beforeEach(() => {
  source = 'http://127.0.0.1:57171';
  vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', 'local-native-v1');
  vi.stubEnv('VITE_FAMILY_STAY_CONTROLS_QUALIFICATION', 'local-native-v1');
});
afterEach(() => vi.unstubAllEnvs());
it('maps an original manual lodging and calendar without fabricating midnight or booking confirmation', () => {
  const { core, ids, body } = fixture();
  const d = nativeStayCreationDraft(body, core, ids);
  expect(d.location.id).toBe(core.planner.state.locations[0].id);
  expect(d.stay.check_in_time).toBeNull();
  expect(d.stay.check_out_time).toBeNull();
  expect(d.confirmation).toBeNull();
  expect(d.stay.time_zone).toBeNull();
});
it('keeps explicit midnight and local guidance separate from visit instants', () => {
  const { core, ids, body } = fixture();
  core.planner.state.locations[0].time_zone = 'America/Mexico_City';
  const d = nativeStayCreationDraft({ ...body, check_in: '00:00' }, core, ids);
  expect(d.stay.check_in_time).toBe('00:00');
  expect(d.stay.time_zone).toBe('America/Mexico_City');
  expect(d.stay).not.toHaveProperty('starts_at');
});
it('preserves explicit creation notes and confirmation code separately', () => {
  const { core, ids, body } = fixture();
  const d = nativeStayCreationDraft({ ...body, notes: 'Personal lodging note', confirmation: 'ABC' }, core, ids);
  expect(d.stay.notes).toBe('Personal lodging note');
  expect(d.confirmation).toBe('ABC');
});
it.each(['place_id', 'start_day_id', 'end_day_id'] as const)('does not turn native string %s into a UUID', (field) => {
  const { core, ids, body } = fixture();
  expect(() => nativeStayCreationDraft({ ...body, [field]: '1' }, core, ids)).toThrow();
});
it.each([0, -1, 1.5, NaN, Infinity])('rejects invalid numeric selectors %s', (value) => {
  const { core, ids, body } = fixture();
  expect(() => nativeStayCreationDraft({ ...body, place_id: value }, core, ids)).toThrow();
});
it.each(['food', 'experience', 'place'] as const)('does not disguise a %s catalog item as lodging', (kind) => {
  const { core, ids, body } = fixture();
  core.planner.state.locations[0].source = { kind, id: crypto.randomUUID() };
  expect(() => nativeStayCreationDraft(body, core, ids)).toThrow();
});
it.each(['archived', 'deleted', 'missing', 'foreignDay', 'reverse', 'extra'] as const)(
  'refuses %s request facts',
  (kind) => {
    const { core, ids, body } = fixture();
    if (kind === 'archived') core.planner.state.locations[0].source_archived = true;
    if (kind === 'deleted') core.planner.state.locations[0].deleted_at = '2026-11-14T00:00:00Z';
    if (kind === 'missing') core.planner.state.locations = [];
    if (kind === 'foreignDay') body.start_day_id = ids.register('day', crypto.randomUUID());
    if (kind === 'reverse') [body.start_day_id, body.end_day_id] = [body.end_day_id, body.start_day_id];
    expect(() =>
      nativeStayCreationDraft(kind === 'extra' ? ({ ...body, unknown: true } as never) : body, core, ids)
    ).toThrow();
  }
);
it.each(['check_in', 'check_in_end', 'check_out'] as const)('refuses unrepresentable seconds in %s', (field) => {
  const { core, ids, body } = fixture();
  expect(() => nativeStayCreationDraft({ ...body, [field]: '12:34:56' }, core, ids)).toThrow();
});
it('refuses an overnight window that the native form cannot express', () => {
  const { core, ids, body } = fixture();
  expect(() => nativeStayCreationDraft({ ...body, check_in: '22:00', check_in_end: '02:00' }, core, ids)).toThrow();
});
it('does not guess a time zone for local guidance', () => {
  const { core, ids, body } = fixture();
  core.planner.state.locations[0].time_zone = null;
  expect(() => nativeStayCreationDraft({ ...body, check_in: '14:00' }, core, ids)).toThrow();
});
it('only filters native picker choices when a qualified writer supplies an eligibility contract', () => {
  const places = [
    { id: 1, category_id: 7 },
    { id: 2, category_id: 8 },
  ];
  const release = installPlannerStayWritePort({ update: vi.fn(), eligibleLodging: (id) => id === 1 });
  try {
    expect(stayPlaceChoices(places, 2, null)).toEqual([places[0]]);
    expect(stayPlaceChoices(places, 2, 8)).toEqual([]);
  } finally {
    release();
  }
  expect(stayPlaceChoices(places, 2, null)).toEqual(places);
});
it.each([
  'https://hosted.supabase.invalid',
  'http://localhost:57171',
  'http://127.0.0.1:57171/',
  'http://127.0.0.1:56671',
  'https://127.0.0.1:57171',
])('never treats %s as qualified native controls', (url) => {
  source = url;
  expect(nativeStayControlsQualificationEnabled()).toBe(false);
});
it('requires both command and controls flags; older read/writer flags do not enable native Add', () => {
  expect(nativeStayControlsQualificationEnabled()).toBe(true);
  vi.stubEnv('VITE_FAMILY_STAY_CONTROLS_QUALIFICATION', '');
  expect(nativeStayControlsQualificationEnabled()).toBe(false);
  vi.stubEnv('VITE_FAMILY_STAY_CONTROLS_QUALIFICATION', 'local-native-v1');
  vi.stubEnv('VITE_FAMILY_STAY_COMMAND_QUALIFICATION', '');
  expect(nativeStayControlsQualificationEnabled()).toBe(false);
});

it('accepts equivalent minute/zero-second precision without treating it as an overnight window', () => {
  const { core, ids, body } = fixture();
  core.planner.state.locations[0].time_zone = 'UTC';
  expect(
    nativeStayCreationDraft({ ...body, check_in: '14:00:00', check_in_end: '14:00' }, core, ids).stay
      .check_in_window_end
  ).toBe('14:00');
});
it.each(['manual', 'hotel'] as const)('rejects invalid original %s source identity', (kind) => {
  const { core, ids, body } = fixture();
  core.planner.state.locations[0].source = { kind, id: kind === 'manual' ? crypto.randomUUID() : null };
  expect(() => nativeStayCreationDraft(body, core, ids)).toThrow();
});
