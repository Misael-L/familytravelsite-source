import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAllStores } from '../../../tests/helpers/store';
import { mapsApi } from '../../api/client';
import { PlacesSession } from '../../utils/placesSession';
import { usePlaceSearch, type PlaceSearchOptions } from './usePlaceSearch';

vi.mock('../../api/placeShadow', () => ({ recordPlacePick: vi.fn() }));
const PLACE = { name: 'Museum', address: 'Fixture street', lat: 48.1, lng: 11.1, osm_id: 'fixture-place' };
const SUGGESTION = { placeId: 'fixture-place', mainText: 'Museum', secondaryText: 'Fixture city' };
const NEW = { placeId: 'fixture-new', mainText: 'New museum', secondaryText: 'Fixture city' };
const MAP_LINK = 'https://maps.app.goo.gl/abc';
type Result<K extends 'search' | 'details' | 'resolveUrl' | 'nearby' | 'autocomplete'> = Awaited<
  ReturnType<(typeof mapsApi)[K]>
>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function setup(variant: PlaceSearchOptions['variant']) {
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
  const callbacks = { onPlace: vi.fn(), onSuggestionName: vi.fn(), onMapLink: vi.fn(), onResolvingChange: vi.fn() };
  const hook = renderHook(() =>
    usePlaceSearch({
      variant,
      open: variant === 'dialog' ? true : undefined,
      locationBias: undefined,
      t: (key) => key,
      toast,
      ...callbacks,
    })
  );
  return { ...hook, ...callbacks, toast };
}

beforeEach(() => {
  resetAllStores();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(mapsApi, 'search').mockResolvedValue({ places: [PLACE], source: 'openstreetmap' });
  vi.spyOn(mapsApi, 'details').mockResolvedValue({ place: PLACE });
  vi.spyOn(mapsApi, 'resolveUrl').mockResolvedValue({ ...PLACE });
  vi.spyOn(mapsApi, 'nearby').mockResolvedValue({ places: [], source: 'openstreetmap' });
  vi.spyOn(mapsApi, 'autocomplete').mockResolvedValue({ suggestions: [NEW], source: 'openstreetmap' });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(['dialog', 'sheet'] as const)('native place-search lifecycle: %s', (variant) => {
  it('does not apply a resolved map link or publish success after unmount', async () => {
    const pending = deferred<Result<'resolveUrl'>>();
    vi.mocked(mapsApi.resolveUrl).mockReturnValueOnce(pending.promise);
    const { result, unmount, onMapLink, onResolvingChange, toast } = setup(variant);
    act(() => result.current.setQuery(MAP_LINK));
    let task!: Promise<void>;
    act(() => {
      task = result.current.runSearch();
    });
    unmount();
    const notifications = onResolvingChange.mock.calls.length;
    await act(async () => {
      pending.resolve({ ...PLACE });
      await task;
    });
    expect(onMapLink).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(onResolvingChange).toHaveBeenCalledTimes(notifications);
  });

  it.each(['resolve', 'reject'] as const)('retires a selected suggestion before its details %s', async (outcome) => {
    const pending = deferred<Result<'details'>>();
    vi.mocked(mapsApi.details).mockReturnValueOnce(pending.promise);
    const { result, unmount, onPlace, onResolvingChange, toast } = setup(variant);
    let task!: Promise<void>;
    act(() => {
      task = result.current.selectSuggestion(SUGGESTION);
    });
    unmount();
    const notifications = onResolvingChange.mock.calls.length;
    await act(async () => {
      if (outcome === 'resolve') pending.resolve({ place: PLACE });
      else pending.reject(new Error('retired details failure'));
      await task;
    });
    expect(onPlace).not.toHaveBeenCalled();
    expect(mapsApi.search).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(onResolvingChange).toHaveBeenCalledTimes(notifications);
  });

  it('does not publish a full-search error after unmount', async () => {
    const pending = deferred<Result<'search'>>();
    vi.mocked(mapsApi.search).mockReturnValueOnce(pending.promise);
    const { result, unmount, toast, onResolvingChange } = setup(variant);
    act(() => result.current.setQuery('Museum'));
    let task!: Promise<void>;
    act(() => {
      task = result.current.runSearch();
    });
    unmount();
    const notifications = onResolvingChange.mock.calls.length;
    await act(async () => {
      pending.reject(new Error('retired search failure'));
      await task;
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(onResolvingChange).toHaveBeenCalledTimes(notifications);
  });

  it.each(['resolve', 'reject'] as const)('retires a nearby search before its %s', async (outcome) => {
    const pending = deferred<Result<'nearby'>>();
    vi.mocked(mapsApi.nearby).mockReturnValueOnce(pending.promise);
    const { result, unmount, toast, onResolvingChange } = setup(variant);
    let task!: Promise<void>;
    act(() => {
      task = result.current.searchNearby({ lat: 48.1, lng: 11.1 });
    });
    unmount();
    const notifications = onResolvingChange.mock.calls.length;
    await act(async () => {
      if (outcome === 'resolve') pending.resolve({ places: [], source: 'openstreetmap' });
      else pending.reject(new Error('retired nearby failure'));
      await task;
    });
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(onResolvingChange).toHaveBeenCalledTimes(notifications);
  });

  it('aborts autocomplete and ends its in-memory search session on unmount', async () => {
    const pending = deferred<Result<'autocomplete'>>();
    vi.mocked(mapsApi.autocomplete).mockReturnValueOnce(pending.promise);
    const end = vi.spyOn(PlacesSession.prototype, 'end');
    const { result, unmount } = setup(variant);
    let task!: Promise<void>;
    act(() => {
      task = result.current.fetchSuggestions('Museum');
    });
    const signal = vi.mocked(mapsApi.autocomplete).mock.calls[0][3];
    end.mockClear();
    unmount();
    await act(async () => {
      pending.resolve({ suggestions: [SUGGESTION], source: 'openstreetmap' });
      await task;
    });
    expect(signal?.aborted).toBe(true);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)(
    'keeps the new suggestions when the aborted old request later %ss',
    async (outcome) => {
      const pending = deferred<Result<'autocomplete'>>();
      vi.mocked(mapsApi.autocomplete).mockReturnValueOnce(pending.promise);
      const { result } = setup(variant);
      let oldTask!: Promise<void>;
      act(() => {
        oldTask = result.current.fetchSuggestions('Old museum');
      });
      await act(async () => {
        await result.current.fetchSuggestions('New museum');
      });
      expect(result.current.suggestions).toEqual([NEW]);
      await act(async () => {
        if (outcome === 'resolve') pending.resolve({ suggestions: [SUGGESTION], source: 'openstreetmap' });
        else pending.reject(new Error('retired autocomplete failure'));
        await oldTask;
      });
      expect(result.current.suggestions).toEqual([NEW]);
    }
  );

  it('still applies a current resolved map link and publishes success', async () => {
    const { result, onMapLink, onResolvingChange, toast } = setup(variant);
    act(() => result.current.setQuery(MAP_LINK));
    await act(async () => {
      await result.current.runSearch();
    });
    expect(onMapLink).toHaveBeenCalledWith(PLACE);
    expect(toast.success).toHaveBeenCalled();
    expect(onResolvingChange).toHaveBeenLastCalledWith(false);
  });

  it('still reports a current full-search failure and clears its busy state', async () => {
    vi.mocked(mapsApi.search).mockRejectedValueOnce(new Error('current search failure'));
    const { result, onResolvingChange, toast } = setup(variant);
    act(() => result.current.setQuery('Museum'));
    await act(async () => {
      await result.current.runSearch();
    });
    expect(toast.error).toHaveBeenCalled();
    expect(result.current.searching).toBe(false);
    expect(onResolvingChange).toHaveBeenLastCalledWith(false);
  });
});
