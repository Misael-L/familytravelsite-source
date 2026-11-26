import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { activateFamilyFrontend } from './runtime';
import { useEditorInitialization } from './useEditorInitialization';
describe('Family editing session initialization', () => {
  it('keeps initial values during independent reads and reseeds on a later open', () => {
    activateFamilyFrontend();
    const original = { id: 1, title: 'Saved' },
      refreshed = { id: 1, title: 'Latest' };
    const { result, rerender } = renderHook(
      ({ open, record, expenses }) => useEditorInitialization(open, record, [record, expenses]),
      { initialProps: { open: true, record: original, expenses: ['Fare'] } }
    );
    const initial = result.current;
    rerender({ open: true, record: refreshed, expenses: [] });
    expect(result.current).toBe(initial);
    expect(result.current[0]).toBe(original);
    rerender({ open: false, record: refreshed, expenses: [] });
    rerender({ open: true, record: refreshed, expenses: [] });
    expect(result.current[0]).toBe(refreshed);
  });
});
