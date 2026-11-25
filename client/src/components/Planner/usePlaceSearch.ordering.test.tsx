import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/helpers/msw/server';
import { placeFormProps, seedPlaceFormStores } from '../../../tests/helpers/placeFormSetup';
import { act, fireEvent, render, renderHook, screen, waitFor } from '../../../tests/helpers/render';
import { resetAllStores } from '../../../tests/helpers/store';
import { mapsApi } from '../../api/client';
import { recordPlacePick } from '../../api/placeShadow';
import { PlacesSession } from '../../utils/placesSession';
import PlaceFormModal from './PlaceFormModal';
import { usePlaceSearch, type PlaceSearchOptions } from './usePlaceSearch';

vi.mock('../../api/placeShadow', () => ({ recordPlacePick: vi.fn() }));
vi.mock('../shared/CustomTimePicker', async () => ({
  default: (await import('../../../tests/helpers/placeForm')).TimePickerStub,
}));
type SearchResult = Awaited<ReturnType<typeof mapsApi.search>>;
type DetailsResult = Awaited<ReturnType<typeof mapsApi.details>>;
type LinkResult = Awaited<ReturnType<typeof mapsApi.resolveUrl>>;
const OLD = {
  name: 'Old fixture result',
  address: 'Fixture street',
  lat: 48.1,
  lng: 11.1,
  osm_id: 'fixture-old',
};
const NEW = {
  name: 'Chosen fixture place',
  address: 'Fixture street',
  lat: 48.2,
  lng: 11.2,
  osm_id: 'fixture-new',
};
const SUGGESTION = {
  placeId: 'fixture-old',
  mainText: OLD.name,
  secondaryText: 'Fixture city',
};
const MAP_LINK = 'https://maps.app.goo.gl/abc';
const realSearch = mapsApi.search;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  resetAllStores();
  seedPlaceFormStores();
  vi.mocked(recordPlacePick).mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  server.use(http.post('/api/maps/autocomplete', () => HttpResponse.json({ suggestions: [], source: 'osm' })));
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function nativePair() {
  const first = deferred<Response>();
  const second = deferred<Response>();
  const tasks: Array<Promise<SearchResult>> = [];
  server.use(
    http.post('/api/maps/search', async ({ request }) => {
      const { query } = (await request.json()) as { query: string };
      return query === 'First lookup' ? first.promise : second.promise;
    })
  );
  vi.spyOn(mapsApi, 'search').mockImplementation((...args) => {
    const task = realSearch(...args);
    tasks.push(task);
    return task;
  });
  const onSave = vi.fn();
  render(<PlaceFormModal {...placeFormProps} onSave={onSave} />);
  const input = screen.getByPlaceholderText(/Search places/i);
  const button = screen.getByRole('button', { name: 'Search' });
  fireEvent.change(input, { target: { value: 'First lookup' } });
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
  await waitFor(() => expect(tasks).toHaveLength(1));
  expect(button).toBeDisabled();
  expect(input).toBeEnabled();
  fireEvent.change(input, { target: { value: 'Second lookup' } });
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
  await waitFor(() => expect(tasks).toHaveLength(2));
  return { first, second, tasks, input, button, onSave };
}

describe('unmodified native search controls through the real API and mocked HTTP transport', () => {
  it.each(['new-first', 'old-first'] as const)(
    'keeps the newest keyboard search and its busy state when replies arrive %s',
    async (order) => {
      const h = await nativePair();
      let busyWhileSecondPending = true;
      if (order === 'old-first') {
        await act(async () => {
          h.first.resolve(HttpResponse.json({ places: [OLD], source: 'osm' }));
          await h.tasks[0];
        });
        busyWhileSecondPending = h.button.hasAttribute('disabled');
        await act(async () => {
          h.second.resolve(HttpResponse.json({ places: [NEW], source: 'osm' }));
          await h.tasks[1];
        });
      } else {
        await act(async () => {
          h.second.resolve(HttpResponse.json({ places: [NEW], source: 'osm' }));
          await h.tasks[1];
        });
        expect(await screen.findByText(NEW.name)).toBeInTheDocument();
        await act(async () => {
          h.first.resolve(HttpResponse.json({ places: [OLD], source: 'osm' }));
          await h.tasks[0];
        });
      }
      expect(busyWhileSecondPending).toBe(true);
      expect(screen.queryByText(OLD.name)).not.toBeInTheDocument();
      expect(screen.getByText(NEW.name)).toBeInTheDocument();
      expect(h.button).toBeEnabled();
      expect(h.onSave).not.toHaveBeenCalled();
    }
  );

  it('keeps a visible result selection while an older keyboard search is still pending', async () => {
    const pending = deferred<Response>();
    const tasks: Array<Promise<SearchResult>> = [];
    server.use(
      http.post('/api/maps/search', async ({ request }) => {
        const { query } = (await request.json()) as { query: string };
        return query === 'Seed list' ? HttpResponse.json({ places: [NEW], source: 'osm' }) : pending.promise;
      })
    );
    vi.spyOn(mapsApi, 'search').mockImplementation((...args) => {
      const task = realSearch(...args);
      tasks.push(task);
      return task;
    });
    const onSave = vi.fn();
    render(<PlaceFormModal {...placeFormProps} onSave={onSave} />);
    const input = screen.getByPlaceholderText(/Search places/i);
    fireEvent.change(input, { target: { value: 'Seed list' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await screen.findByText(NEW.name);
    fireEvent.change(input, { target: { value: 'Waiting lookup' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(tasks).toHaveLength(2));
    const choice = screen.getByRole('button', { name: new RegExp(NEW.name) });
    expect(choice).toBeEnabled();
    fireEvent.click(choice);
    const search = screen.getByRole('button', { name: 'Search' });
    const selectionFinishedBusy = !search.hasAttribute('disabled');
    await act(async () => {
      pending.resolve(HttpResponse.json({ places: [OLD], source: 'osm' }));
      await tasks[1];
    });
    expect(selectionFinishedBusy).toBe(true);
    expect(screen.queryByText(OLD.name)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue(NEW.name)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

function setup(variant: PlaceSearchOptions['variant']) {
  vi.spyOn(mapsApi, 'search').mockResolvedValue({
    places: [NEW],
    source: 'osm',
  });
  vi.spyOn(mapsApi, 'nearby').mockResolvedValue({
    places: [OLD],
    source: 'osm',
  });
  vi.spyOn(mapsApi, 'details').mockResolvedValue({ place: OLD });
  vi.spyOn(mapsApi, 'resolveUrl').mockResolvedValue({ ...OLD });
  vi.spyOn(mapsApi, 'autocomplete').mockResolvedValue({
    suggestions: [],
    source: 'osm',
  });
  const toast = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  };
  const callbacks = {
    onPlace: vi.fn(),
    onMapLink: vi.fn(),
    onCoordinates: vi.fn(),
    onSuggestionName: vi.fn(),
    onResolvingChange: vi.fn(),
  };
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
function setQuery(h: ReturnType<typeof setup>, value: string) {
  act(() => h.result.current.setQuery(value));
}
function startSearch(h: ReturnType<typeof setup>, query: string) {
  setQuery(h, query);
  let task!: Promise<void>;
  act(() => {
    task = h.result.current.runSearch();
  });
  return task;
}

describe.each(['dialog', 'sheet'] as const)('same-opening intent ownership: %s', (variant) => {
  it.each(['resolve', 'reject'] as const)('ignores an older %s while the newest search is pending', async (outcome) => {
    const h = setup(variant),
      old = deferred<SearchResult>(),
      current = deferred<SearchResult>();
    vi.mocked(mapsApi.search).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const first = startSearch(h, 'First lookup'),
      second = startSearch(h, 'Second lookup');
    await act(async () => {
      if (outcome === 'resolve') old.resolve({ places: [OLD], source: 'osm' });
      else old.reject(new Error('old search failure'));
      await first;
    });
    const busy = h.result.current.searching,
      errors = h.toast.error.mock.calls.length,
      results = h.result.current.results;
    await act(async () => {
      current.resolve({ places: [NEW], source: 'osm' });
      await second;
    });
    expect(busy).toBe(true);
    expect(errors).toBe(0);
    expect(results).toEqual([]);
    expect(h.result.current.results).toEqual([NEW]);
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores an older %s after the newest search has completed',
    async (outcome) => {
      const h = setup(variant),
        old = deferred<SearchResult>(),
        current = deferred<SearchResult>();
      vi.mocked(mapsApi.search).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
      const first = startSearch(h, 'First lookup'),
        second = startSearch(h, 'Second lookup');
      await act(async () => {
        current.resolve({ places: [NEW], source: 'osm' });
        await second;
      });
      await act(async () => {
        if (outcome === 'resolve') old.resolve({ places: [OLD], source: 'osm' });
        else old.reject(new Error('old search failure'));
        await first;
      });
      expect(h.result.current.results).toEqual([NEW]);
      expect(h.toast.error).not.toHaveBeenCalled();
    }
  );

  it.each(['resolve', 'reject'] as const)('retires an older selected suggestion before details %s', async (outcome) => {
    const h = setup(variant),
      details = deferred<DetailsResult>();
    vi.mocked(mapsApi.details).mockReturnValueOnce(details.promise);
    let old!: Promise<void>;
    act(() => {
      old = h.result.current.selectSuggestion(SUGGESTION);
    });
    const next = startSearch(h, 'Second lookup');
    await act(async () => {
      await next;
    });
    await act(async () => {
      if (outcome === 'resolve') details.resolve({ place: OLD });
      else details.reject(new Error('old details failure'));
      await old;
    });
    expect(h.onPlace).not.toHaveBeenCalled();
    expect(mapsApi.search).toHaveBeenCalledTimes(1);
    expect(h.result.current.results).toEqual([NEW]);
  });

  it('retires an older nearby search after a new full search', async () => {
    const h = setup(variant),
      pending = deferred<SearchResult>();
    vi.mocked(mapsApi.nearby).mockReturnValueOnce(pending.promise);
    let old!: Promise<void>;
    act(() => {
      old = h.result.current.searchNearby({ lat: 48.1, lng: 11.1 });
    });
    const next = startSearch(h, 'Second lookup');
    await act(async () => {
      await next;
    });
    await act(async () => {
      pending.resolve({ places: [OLD], source: 'osm' });
      await old;
    });
    expect(h.result.current.results).toEqual([NEW]);
    expect(h.result.current.nearbyList).toBe(false);
  });

  it('keeps a ranked visible pick rather than applying an older map-link reply', async () => {
    const h = setup(variant),
      pending = deferred<LinkResult>();
    const seed = startSearch(h, 'Saved results');
    await act(async () => {
      await seed;
    });
    vi.mocked(mapsApi.resolveUrl).mockReturnValueOnce(pending.promise);
    const old = startSearch(h, MAP_LINK);
    act(() => h.result.current.pickPlace(NEW, { mode: 'search', rank: 0, count: 1 }));
    const finished = !h.result.current.searching;
    await act(async () => {
      pending.resolve({ ...OLD });
      await old;
    });
    expect(finished).toBe(true);
    expect(h.onMapLink).not.toHaveBeenCalled();
    expect(h.onPlace).toHaveBeenCalledTimes(1);
    expect(h.onPlace.mock.calls[0][0]).toBe(NEW);
    expect(recordPlacePick).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Saved results',
        source: 'search:osm',
        liveRank: 0,
        liveCount: 1,
        pickedName: NEW.name,
      })
    );
    expect(h.toast.success).not.toHaveBeenCalled();
  });
});

describe.each(['dialog', 'sheet'] as const)('preserved current intent controls: %s', (variant) => {
  it('does not retire a valid search for an empty query or missing nearby pin', async () => {
    const h = setup(variant),
      pending = deferred<SearchResult>();
    vi.mocked(mapsApi.search).mockReturnValueOnce(pending.promise);
    const old = startSearch(h, 'First lookup');
    setQuery(h, '');
    await act(async () => {
      await h.result.current.runSearch();
      await h.result.current.searchNearby(null);
    });
    await act(async () => {
      pending.resolve({ places: [OLD], source: 'osm' });
      await old;
    });
    expect(h.result.current.results).toEqual([OLD]);
    expect(h.result.current.searching).toBe(false);
  });

  it('still falls back from current missing details and applies its result', async () => {
    const h = setup(variant);
    vi.mocked(mapsApi.details).mockResolvedValueOnce({ place: null });
    await act(async () => {
      await h.result.current.selectSuggestion(SUGGESTION);
    });
    expect(h.onPlace).toHaveBeenCalledTimes(1);
    expect(h.onPlace.mock.calls[0][0]).toBe(NEW);
    expect(h.result.current.searching).toBe(false);
  });

  it('only lets the current search finish its native in-memory session', async () => {
    const h = setup(variant),
      old = deferred<SearchResult>(),
      current = deferred<SearchResult>();
    vi.mocked(mapsApi.search).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const first = startSearch(h, 'First lookup'),
      second = startSearch(h, 'Second lookup');
    const end = vi.spyOn(PlacesSession.prototype, 'end');
    await act(async () => {
      old.resolve({ places: [OLD], source: 'osm' });
      await first;
    });
    const earlyEnds = end.mock.calls.length;
    await act(async () => {
      current.resolve({ places: [NEW], source: 'osm' });
      await second;
    });
    expect(earlyEnds).toBe(0);
    expect(end).toHaveBeenCalledTimes(variant === 'sheet' ? 1 : 0);
  });
});

it('lets a phone coordinate choice retire an older nearby search without a new provider lookup', async () => {
  const h = setup('sheet'),
    pending = deferred<SearchResult>();
  vi.mocked(mapsApi.nearby).mockReturnValueOnce(pending.promise);
  let old!: Promise<void>;
  act(() => {
    old = h.result.current.searchNearby({ lat: 48.1, lng: 11.1 });
  });
  const choice = startSearch(h, '48.2, 11.2');
  await act(async () => {
    await choice;
  });
  const finished = !h.result.current.searching;
  await act(async () => {
    pending.resolve({ places: [OLD], source: 'osm' });
    await old;
  });
  expect(finished).toBe(true);
  expect(h.onCoordinates).toHaveBeenCalledWith('48.2', '11.2');
  expect(h.result.current.results).toEqual([]);
  expect(mapsApi.search).not.toHaveBeenCalled();
});
