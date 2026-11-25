import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FamilyControllerContext, type FamilyControllerValue } from './controllerContext';
import { FamilyExploreHost } from './FamilyExploreHost';

vi.mock('./legacy/components/Explore/TripWorkspaceExplorePanel', () => ({
  default: () => <div>Family catalog explore</div>,
}));

function value(open: boolean, closeExplore = vi.fn()): FamilyControllerValue {
  return {
    core: {
      trip: { id: 'trip-1' },
      days: [],
      places: [],
      schedule: [],
      notes: [],
    } as unknown as FamilyControllerValue['core'],
    gov: { nextSortOrder: 1, addDraftOp: vi.fn() } as unknown as FamilyControllerValue['gov'],
    selectedDayId: null,
    selectedPlaceId: null,
    selectDay: vi.fn(),
    selectPlace: vi.fn(),
    setTab: vi.fn(),
    reload: vi.fn(),
    explore: {
      open,
      pendingDeepLink: null,
      countryIds: [],
      tripPlaceIds: [],
      familyId: 'fam',
      personId: 'person',
      canMutate: true,
      writeMode: 'direct',
      writeModeFor: () => 'direct',
      openExplore: vi.fn(),
      closeExplore,
      consumeDeepLink: vi.fn(),
    },
    partialLoad: { failed: false, retry: vi.fn() },
  };
}

describe('FamilyExploreHost', () => {
  it('stays unmounted until Explore is opened, then closes from its own control', async () => {
    const closeExplore = vi.fn();
    const { rerender } = render(
      <FamilyControllerContext.Provider value={value(false, closeExplore)}>
        <FamilyExploreHost />
      </FamilyControllerContext.Provider>
    );
    expect(screen.queryByText('Family catalog explore')).toBeNull();
    rerender(
      <FamilyControllerContext.Provider value={value(true, closeExplore)}>
        <FamilyExploreHost />
      </FamilyControllerContext.Provider>
    );
    expect(screen.getByText('Family catalog explore')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closeExplore).toHaveBeenCalledOnce();
  });
});
