import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MapViewAuto } from '../../components/Map/MapViewAuto';
import { FamilyControllerContext, type FamilyControllerValue } from './controllerContext';

vi.mock('../../components/Map/MapView', () => ({ MapView: (props: FamilyMapGeometry) => paint(props) }));

type FamilyMapGeometry = Pick<ComponentProps<typeof MapViewAuto>, 'route' | 'routeColors' | 'focusPoints' | 'fitKey'>;

function host() {
  const value = {
    core: { trip: { id: 'trip-1' }, days: [], places: [], schedule: [], notes: [] },
    gov: { nextSortOrder: 1, addDraftOp: vi.fn() },
    selectedDayId: null,
    selectedPlaceId: null,
    selectDay: vi.fn(),
    selectPlace: vi.fn(),
    setTab: vi.fn(),
    reload: vi.fn(),
    explore: {
      open: false,
      pendingDeepLink: null,
      countryIds: [],
      tripPlaceIds: [],
      familyId: null,
      personId: null,
      canMutate: false,
      writeMode: 'direct',
      writeModeFor: () => 'direct',
      openExplore: vi.fn(),
      closeExplore: vi.fn(),
      consumeDeepLink: vi.fn(),
    },
    partialLoad: { failed: false, retry: vi.fn() },
  } as unknown as FamilyControllerValue;
  return value;
}

function paint(geometry: FamilyMapGeometry) {
  return (
    <div
      data-testid="native-map"
      data-route={JSON.stringify(geometry.route ?? null)}
      data-colors={JSON.stringify(geometry.routeColors ?? null)}
      data-focus={JSON.stringify(geometry.focusPoints ?? null)}
      data-fit={String(geometry.fitKey ?? '')}
    />
  );
}

describe('native desktop map geometry alongside the Family controller', () => {
  it('changes the rendered map when overview route, colours, and focus change', () => {
    const value = host();
    const first = {
      route: [
        [
          [48.1, 11.5],
          [48.2, 11.6],
        ],
      ] as [number, number][][],
      routeColors: [{ line: '#0a84ff', casing: '#0a5cc2' }],
      focusPoints: [[48.1, 11.5]] as [number, number][],
      fitKey: 1,
    };
    const view = render(
      <FamilyControllerContext.Provider value={value}>
        <MapViewAuto {...first} />
      </FamilyControllerContext.Provider>
    );
    const map = screen.getByTestId('native-map');
    expect(map).toHaveAttribute('data-route', JSON.stringify(first.route));
    expect(map).toHaveAttribute('data-colors', JSON.stringify(first.routeColors));
    expect(map).toHaveAttribute('data-focus', JSON.stringify(first.focusPoints));
    expect(map).toHaveAttribute('data-fit', '1');

    const next = {
      route: [
        [
          [19.4, -99.1],
          [19.5, -99.2],
        ],
      ] as [number, number][][],
      routeColors: [{ line: '#16a34a', casing: '#14532d' }],
      focusPoints: [
        [19.4, -99.1],
        [19.5, -99.2],
      ] as [number, number][],
      fitKey: 4,
    };
    view.rerender(
      <FamilyControllerContext.Provider value={value}>
        <MapViewAuto {...next} />
      </FamilyControllerContext.Provider>
    );
    expect(map).toHaveAttribute('data-route', JSON.stringify(next.route));
    expect(map).toHaveAttribute('data-colors', JSON.stringify(next.routeColors));
    expect(map).toHaveAttribute('data-focus', JSON.stringify(next.focusPoints));
    expect(map).toHaveAttribute('data-fit', '4');
    expect(map.getAttribute('data-route')).not.toBe(JSON.stringify(first.route));
  });
});
