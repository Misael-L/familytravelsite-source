import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '../../../tests/helpers/render';
import AtlasCountrySearch from './AtlasCountrySearch';
import type { AtlasPlaceHit } from './atlasModel';

const PLACE: AtlasPlaceHit = { name: 'Lisbon', address: 'Portugal', lat: 38.72, lng: -9.14 };

function renderSearch(overrides: Partial<Parameters<typeof AtlasCountrySearch>[0]> = {}) {
  const props = {
    dark: false,
    t: (key: string) => key,
    search: 'po',
    setSearch: vi.fn(),
    results: [{ code: 'PT', label: 'Portugal' }],
    setResults: vi.fn(),
    open: true,
    setOpen: vi.fn(),
    options: [],
    onSelect: vi.fn(),
    placeResults: [PLACE],
    placesLoading: false,
    onQueryChange: vi.fn(),
    onSelectPlace: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<AtlasCountrySearch {...props} />) };
}

describe('AtlasCountrySearch result rows', () => {
  it('draws a country and a place row the same way, each ending in a chevron', () => {
    renderSearch();
    const country = screen
      .getByText('Portugal', { selector: 'span.text-content' })
      .closest('button') as HTMLButtonElement;
    const place = screen.getByText('Lisbon').closest('button') as HTMLButtonElement;
    for (const row of [country, place]) {
      expect(row.style.padding).toBe('10px 12px');
      expect(row.style.borderBottom).toBe('1px solid rgba(0, 0, 0, 0.06)');
      expect(row.lastElementChild?.tagName.toLowerCase()).toBe('svg');
    }
    expect(country.querySelector('img')).toHaveAttribute('src', 'https://flagcdn.com/w40/pt.png');
    expect(place).toHaveTextContent('Portugal');
  });

  it('selects the country or the place that was clicked', () => {
    const { props } = renderSearch();
    fireEvent.click(screen.getByAltText('PT').closest('button') as HTMLButtonElement);
    expect(props.onSelect).toHaveBeenCalledWith('PT');
    fireEvent.click(screen.getByText('Lisbon').closest('button') as HTMLButtonElement);
    expect(props.onSelectPlace).toHaveBeenCalledWith(PLACE);
  });

  it('uses the first country on Enter and falls back to the first place while the list is open', () => {
    const { props, rerender } = renderSearch();
    const input = screen.getByPlaceholderText('atlas.searchCountry');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onSelect).toHaveBeenCalledExactlyOnceWith('PT');
    expect(props.onSelectPlace).not.toHaveBeenCalled();

    rerender(<AtlasCountrySearch {...props} results={[]} />);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onSelectPlace).toHaveBeenCalledExactlyOnceWith(PLACE);
  });

  it('ignores Enter after Escape closes the results and reopens place-only results on focus', () => {
    const { props, rerender } = renderSearch({ results: [] });
    const input = screen.getByPlaceholderText('atlas.searchCountry');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(props.setOpen).toHaveBeenLastCalledWith(false);

    rerender(<AtlasCountrySearch {...props} open={false} />);
    expect(screen.queryByText('Lisbon')).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(props.onSelectPlace).not.toHaveBeenCalled();

    fireEvent.focus(input);
    expect(props.setOpen).toHaveBeenLastCalledWith(true);
  });

  it('clears the place query together with the text and country results', () => {
    const { props } = renderSearch();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(props.setSearch).toHaveBeenCalledExactlyOnceWith('');
    expect(props.onQueryChange).toHaveBeenCalledExactlyOnceWith('');
    expect(props.setResults).toHaveBeenCalledExactlyOnceWith([]);
    expect(props.setOpen).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('leaves an empty, settled result list closed to any selection', () => {
    const { props } = renderSearch({ results: [], placeResults: [] });
    fireEvent.keyDown(screen.getByPlaceholderText('atlas.searchCountry'), { key: 'Enter' });

    expect(screen.queryByText('atlas.searchPlaces')).not.toBeInTheDocument();
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onSelectPlace).not.toHaveBeenCalled();
  });

  it('tints a row on hover in the colour of the scheme and clears it on leave', () => {
    renderSearch({ dark: true });
    const row = screen.getByText('Lisbon').closest('button') as HTMLButtonElement;
    expect(row.style.borderBottom).toBe('1px solid rgba(255, 255, 255, 0.06)');
    fireEvent.mouseEnter(row);
    expect(row.style.background).toBe('rgba(255, 255, 255, 0.06)');
    fireEvent.mouseLeave(row);
    expect(row.style.background).toBe('transparent');
  });
});
