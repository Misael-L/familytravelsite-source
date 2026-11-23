import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchExploreCatalogDetail } from '../../data/supabase/catalogExploreLists';
import { listCatalogVariantSlidesForEntity } from '../../data/supabase/catalogExploreMedia';
import { isCatalogSaved } from '../../data/supabase/catalogSaves';
import { listFamilyListMembership } from '../../data/supabase/familyLists';
import { resetHeroPrefetchForTests } from '../../lib/media/prefetchHeroImages';
import ExploreEntityDetailPanel from './ExploreEntityDetailPanel';

vi.mock('../../i18n/index.ts', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../store/familyFeatureStore', () => ({
  useCollectionsEnabled: () => true,
}));

vi.mock('../../data/supabase/catalogExploreLists', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/catalogExploreLists')>();
  return { ...actual, fetchExploreCatalogDetail: vi.fn() };
});

vi.mock('../../data/supabase/catalogExploreMedia', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/catalogExploreMedia')>();
  return {
    ...actual,
    listCatalogVariantSlidesForEntity: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('../../data/supabase/catalogSaves', () => ({
  isCatalogSaved: vi.fn().mockResolvedValue(false),
  toggleCatalogSave: vi.fn(),
}));

vi.mock('../../data/supabase/familyLists', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/familyLists')>();
  return { ...actual, listFamilyListMembership: vi.fn().mockResolvedValue([]) };
});

const detail = {
  id: 'pl-1',
  kind: 'place' as const,
  name: 'Gubbio',
  notes: null,
  address: null,
  linkUrl: null,
  phone: null,
  typeLabel: null,
  latitude: 43.35,
  longitude: 12.57,
  coverUrl: null,
  canonicalCoverUrl: null,
  placeId: null,
};

const HERO_A = 'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/aa/hero-a.webp';
const HERO_B = 'https://catalog.example.invalid/storage/v1/object/public/catalog/variants/v1/bb/hero-b.webp';

function renderPanel() {
  return render(
    <ExploreEntityDetailPanel
      kind="place"
      entityId="pl-1"
      onBack={vi.fn()}
      tripId="trip-1"
      canMutate={false}
      tripPlaceIds={[]}
      days={[]}
      scheduleItems={[]}
      onItineraryChanged={vi.fn().mockResolvedValue(undefined)}
      familyId="fam-1"
      personId="p1"
    />
  );
}

describe('ExploreEntityDetailPanel catalog variants', () => {
  const prefetched: string[] = [];

  beforeEach(() => {
    prefetched.length = 0;
    vi.clearAllMocks();
    vi.mocked(fetchExploreCatalogDetail).mockResolvedValue(detail);
    vi.mocked(listFamilyListMembership).mockResolvedValue([]);
    vi.mocked(isCatalogSaved).mockResolvedValue(false);
    vi.mocked(listCatalogVariantSlidesForEntity).mockResolvedValue([]);
    resetHeroPrefetchForTests();
    vi.stubGlobal(
      'Image',
      class {
        decoding = '';
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(value: string) {
          prefetched.push(value);
          queueMicrotask(() => this.onload?.());
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetHeroPrefetchForTests();
  });

  it('shows the ready hero and opens that slide original', async () => {
    const user = userEvent.setup();
    vi.mocked(listCatalogVariantSlidesForEntity).mockResolvedValue([
      { position: 0, mediaAssetId: 'a', canonicalUrl: 'https://cdn.example/a.jpg', heroUrl: null },
      { position: 1, mediaAssetId: 'b', canonicalUrl: 'https://cdn.example/b.jpg', heroUrl: HERO_B },
    ]);
    const view = renderPanel();
    const image = await waitFor(() => {
      const node = view.container.querySelector('img');
      expect(node).toHaveAttribute('src', HERO_B);
      return node;
    });
    await user.click(screen.getByRole('button', { name: 'View original' }));
    expect(image).toHaveAttribute('src', 'https://cdn.example/b.jpg');
    expect(view.container.innerHTML).not.toContain('/render/image/');
    expect(prefetched).toEqual([HERO_B]);
  });

  it('uses a placeholder when no ready hero or cover variant exists', async () => {
    vi.mocked(listCatalogVariantSlidesForEntity).mockResolvedValue([
      { position: 0, mediaAssetId: 'a', canonicalUrl: 'https://cdn.example/a.jpg', heroUrl: null },
    ]);
    vi.mocked(fetchExploreCatalogDetail).mockResolvedValue({
      ...detail,
      coverUrl: null,
      canonicalCoverUrl: 'https://cdn.example/a.jpg',
    });
    const view = renderPanel();
    await screen.findByRole('heading', { level: 1, name: 'Gubbio' });
    await waitFor(() => {
      expect(listCatalogVariantSlidesForEntity).toHaveBeenCalled();
      expect(screen.queryByText('Loading…')).toBeNull();
    });
    expect(view.container.querySelector('img')).toBeNull();
    expect(screen.queryByRole('button', { name: 'View original' })).toBeNull();
    expect(view.container.innerHTML).not.toContain('/render/image/');
    expect(view.container.innerHTML).not.toContain('cdn.example/a.jpg');
    expect(prefetched).toEqual([]);
  });

  it('keeps gallery order across ready heroes and opens the displayed original', async () => {
    const user = userEvent.setup();
    vi.mocked(listCatalogVariantSlidesForEntity).mockResolvedValue([
      { position: 0, mediaAssetId: 'a', canonicalUrl: 'https://cdn.example/a.jpg', heroUrl: HERO_A },
      { position: 1, mediaAssetId: 'b', canonicalUrl: 'https://cdn.example/skipped.jpg', heroUrl: null },
      { position: 2, mediaAssetId: 'c', canonicalUrl: 'https://cdn.example/c.jpg', heroUrl: HERO_B },
    ]);
    const view = renderPanel();
    const image = await waitFor(() => {
      const node = view.container.querySelector('img');
      expect(node).toHaveAttribute('src', HERO_A);
      return node;
    });
    await user.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(image).toHaveAttribute('src', HERO_B);
    await user.click(screen.getByRole('button', { name: 'View original' }));
    expect(image).toHaveAttribute('src', 'https://cdn.example/c.jpg');
    expect(view.container.innerHTML).not.toContain('/render/image/');
    expect(prefetched).toEqual([HERO_A, HERO_B]);
  });
});
