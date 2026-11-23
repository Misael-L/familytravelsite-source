// organize-imports-ignore
// sort-imports-ignore
// Preserve the original test runtime module evaluation order.
import '../../../src/db/offlineDb';
import '../../../src/store/tripReadScope';
import '../offlineDb';
import 'react';
import { screen, within } from '../render';
import userEvent from '@testing-library/user-event';
import 'msw';
import '../msw/server';
import '../../../src/store/authStore';
import '../../../src/store/tripStore';
import '../../../src/store/settingsStore';
import '../../../src/store/permissionsStore';
import '../../../src/store/pluginStore';
import '../store';
import { buildDay } from '../factories';
import '../../../src/components/Planner/DayDetailPanel';
import '../bookingCodeBlur';

export const day = buildDay({ id: 1, trip_id: 1, date: '2025-06-15', title: 'Day in Paris' });

export const defaultProps = {
  day,
  days: [day],
  places: [],
  categories: [],
  tripId: 1,
  assignments: {},
  reservations: [],
  lat: null,
  lng: null,
  onClose: vi.fn(),
  onAccommodationChange: vi.fn(),
};

/** The stay picker filters by category through a pill that opens its list; this picks one entry of it. */
export async function pickStayCategory(user: ReturnType<typeof userEvent.setup> | typeof userEvent, name: string) {
  await user.click(screen.getByRole('button', { name: /^Category:/ }));
  await user.click(within(screen.getByRole('group', { name: 'Category' })).getByRole('button', { name }));
}
