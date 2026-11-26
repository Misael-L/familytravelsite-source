import { expect, it } from 'vitest';
import { coreHttpsPlannerPackingProfileEnabled } from './coreHttpsPlannerPackingProfile';
import { coreHttpsTaskProfileEnabled } from './coreHttpsTaskProfile';

const origin = ['https://family-core-fixture.', 'supabase', '.co'].join('');
const profiles = [
  ['isolated-task-v1', coreHttpsTaskProfileEnabled, coreHttpsPlannerPackingProfileEnabled],
  ['isolated-planner-packing-v1', coreHttpsPlannerPackingProfileEnabled, coreHttpsTaskProfileEnabled],
  ['isolated-task-planner-packing-v1', coreHttpsPlannerPackingProfileEnabled, coreHttpsTaskProfileEnabled],
] as const;

it.each(profiles)('%s selects only the matching writer profile', (profile, selected, other) => {
  const env = {
    VITE_DATA_PLANE: 'supabase',
    VITE_SUPABASE_URL: origin,
    VITE_FAMILY_CORE_WRITER_PROFILE: profile,
    VITE_FAMILY_OFFLINE_READ_QUALIFICATION: '',
    UNRELATED_SETTING: true,
  };
  expect(selected(env)).toBe(true);
  expect(other(env)).toBe(false);
});

it.each(profiles)('%s keeps the exact origin, data plane and qualification checks', (profile, selected) => {
  const env = {
    VITE_DATA_PLANE: 'supabase',
    VITE_SUPABASE_URL: origin,
    VITE_FAMILY_CORE_WRITER_PROFILE: profile,
  };
  const rejected = [
    { VITE_SUPABASE_URL: origin.replace('family-core-fixture', 'other-fixture') },
    { VITE_SUPABASE_URL: `${origin}/` },
    { VITE_SUPABASE_URL: origin.replace('https:', 'http:') },
    { VITE_SUPABASE_URL: undefined },
    { VITE_DATA_PLANE: 'legacy' },
    { VITE_FAMILY_CORE_WRITER_PROFILE: undefined },
    { VITE_FAMILY_EXAMPLE_QUALIFICATION: 'enabled' },
  ];
  for (const override of rejected) {
    expect(selected({ ...env, ...override }), JSON.stringify(override)).toBe(false);
  }
});
