import { describe, expect, it } from 'vitest';
import { buildFlexibleTripProposal, flexibleProposalCalendar } from './flexibleTripProposal';
describe('Relative proposal calendar', () => {
  it('keeps blank dates blank with an explicit duration', () => {
    expect(flexibleProposalCalendar('', '', 7)).toEqual({ start: null, end: null, days: 7 });
  });
  it('uses an explicit inclusive date range independently of an unused duration input', () => {
    expect(flexibleProposalCalendar('2028-02-28', '2028-03-01', 0))
      .toEqual({ start: '2028-02-28', end: '2028-03-01', days: 3 });
  });
  it('preserves the selected end-only anchor for the server to resolve', () => {
    expect(flexibleProposalCalendar('', '2028-03-01', 3))
      .toEqual({ start: null, end: '2028-03-01', days: 3 });
  });
  it.each([0, 1.5, 3661, Number.NaN])('refuses invalid duration %s', (duration) => {
    expect(flexibleProposalCalendar('', '', duration)).toBeNull();
  });
  it('refuses invalid dates, reversed bounds and ranges beyond supported years', () => {
    expect(flexibleProposalCalendar('2027-02-29', '', 3)).toBeNull();
    expect(flexibleProposalCalendar('2028-03-01', '2028-02-28', 3)).toBeNull();
    expect(flexibleProposalCalendar('9999-12-31', '', 2)).toBeNull();
    expect(flexibleProposalCalendar('', '0001-01-01', 2)).toBeNull();
  });
  it('includes currency and duration in the original save payload', () => {
    const built = buildFlexibleTripProposal({ familyId: 'family', title: '  Family proposal  ', notes: null,
      startDate: '', endDate: '', dayCount: 7, countryIds: ['country'], placeIds: [], travelerPersonIds: [],
      primaryCountryId: null, occasion: 'trip', coverUrl: null, reminderDays: 3, currencyCode: 'MXN' });
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.args).toMatchObject({ p_title: 'Family proposal',
      p_start_date: null, p_end_date: null, p_day_count: 7, p_currency_code: 'MXN' });
  });
});
