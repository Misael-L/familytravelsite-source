import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '../../../tests/helpers/render';
import LegacySelect from '../../integrations/family/legacy/components/shared/CustomSelect';
import LegacyModal from '../../integrations/family/legacy/components/shared/Modal';
import CustomSelect from './CustomSelect';

const options = [
  { value: 'heading-a', label: 'Central region', isHeader: true },
  { value: 14, label: 'Puebla', groupLabel: 'Centro', badge: '2' },
  { value: 15, label: 'Mexico City', searchLabel: 'CDMX' },
  { value: 'heading-b', label: 'Coastal region', isHeader: true },
  { value: 'acapulco', label: 'Acapulco' },
];

afterEach(() => vi.restoreAllMocks());

describe.each([
  { name: 'native', Select: CustomSelect, input: 'Search', left: 'left' },
  { name: 'legacy', Select: LegacySelect, input: '...', left: 'insetInlineStart' },
])('$name select', ({ Select, input, left }) => {
  it('preserves grouped search, option labels, badges, and numeric payloads', () => {
    const choose = vi.fn();
    render(<Select value="" placeholder="Choose a place" searchable options={options} onChange={choose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose a place' }));
    const search = screen.getByPlaceholderText(input);
    fireEvent.change(search, { target: { value: 'CEnTrO' } });
    expect(screen.getByText('Central region')).toBeInTheDocument();
    expect(screen.queryByText('Coastal region')).toBeNull();
    expect(screen.queryByText('Mexico City')).toBeNull();
    const puebla = screen.getByRole('button', { name: /Puebla/ });
    expect(within(puebla).getByText('2')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'cdmx' } });
    expect(screen.getByText('Central region')).toBeInTheDocument();
    expect(screen.queryByText('Puebla')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mexico City' }));
    expect(choose.mock.calls).toEqual([[15]]);
    expect(screen.queryByPlaceholderText(input)).toBeNull();
  });

  it('keeps the initial compact popup aligned with a narrow trigger', () => {
    render(<Select value="" placeholder="Choose a place" size="sm" searchable options={options} onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Choose a place' });
    const anchor = trigger.parentElement;
    if (!anchor) throw new Error('Missing select anchor');
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(new DOMRect(24, 64, 190, 32));
    fireEvent.click(trigger);
    const menu = screen.getByPlaceholderText(input).parentElement?.parentElement;
    expect(menu?.parentElement).toBe(document.body);
    expect(menu?.style.position).toBe('fixed');
    expect(menu?.style.top).toBe('100px');
    expect(menu?.style[left as 'left' | 'insetInlineStart']).toBe('24px');
    expect(menu?.style.width).toBe('190px');
    expect(trigger.style.padding).toBe('8px 12px');
  });
});

describe('legacy picker in a modal', () => {
  it.each([true, false])('dismisses the picker before the editor when scope=%s', (scoped) => {
    const close = vi.fn();
    const scope = { restoreTo: null, suppressRestoreRef: { current: false } };
    render(
      <LegacyModal isOpen onClose={close} title="Trip editor" focusScope={scoped ? scope : undefined}>
        <LegacySelect value="" placeholder="Choose a place" onChange={vi.fn()} options={options} searchable />
      </LegacyModal>
    );
    const trigger = screen.getByRole('button', { name: 'Choose a place' });
    fireEvent.click(trigger);
    const search = screen.getByPlaceholderText('...');
    expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    expect(screen.queryByPlaceholderText('...')).toBeNull();
  });
});
