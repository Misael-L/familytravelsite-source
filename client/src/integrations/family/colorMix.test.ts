import { describe, expect, it } from 'vitest';
import { withHexAlpha } from './colorMix';

describe('withHexAlpha', () => {
  it('keeps a real hex translucent and refuses to append alpha to a CSS variable', () => {
    expect(withHexAlpha('#2563EB', '18')).toBe('#2563EB18');
    expect(withHexAlpha('var(--info)', '18')).toBe('color-mix(in srgb, var(--info) 9%, transparent)');
  });
});
