import { createElement, forwardRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { POI_CATEGORIES } from '../integrations/family/legacy/components/Map/poiCategories';
import { CATEGORY_ICON_MAP } from '../integrations/family/legacy/components/shared/categoryIcons';
import { renderIconMarkup, renderIconMarkupStrict } from './iconMarkup';

function thrown(operation: () => unknown) {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected rendering failure');
}
describe('strict icon serialization with the original safe entry preserved', () => {
  it('matches Fizz for every retained category and POI icon at every actual map size', () => {
    const icons = [...Object.values(CATEGORY_ICON_MAP), ...POI_CATEGORIES.map((category) => category.Icon)];
    expect(icons.length).toBeGreaterThan(40);
    for (const Icon of icons)
      for (const size of [13, 15, 18]) {
        const element = createElement(Icon, { size, color: 'white', strokeWidth: 2.5 });
        expect(renderIconMarkupStrict(element)).toBe(renderToStaticMarkup(element));
        expect(renderIconMarkup(element)).toBe(renderToStaticMarkup(element));
      }
  });
  it('propagates the identical component exception while the existing safe entry stays empty', () => {
    const failure = new Error('strict fixture failure');
    const Icon = () => {
      throw failure;
    };
    const element = createElement(Icon);
    expect(thrown(() => renderToStaticMarkup(element))).toBe(failure);
    expect(thrown(() => renderIconMarkupStrict(element))).toBe(failure);
    expect(renderIconMarkup(element)).toBe('');
  });
  it('preserves exceptions from a forwardRef icon without replacing their identity', () => {
    const failure = new Error('forwardRef fixture failure');
    const Icon = forwardRef(() => {
      throw failure;
    });
    const element = createElement(Icon);
    expect(thrown(() => renderToStaticMarkup(element))).toBe(failure);
    expect(thrown(() => renderIconMarkupStrict(element))).toBe(failure);
    expect(renderIconMarkup(element)).toBe('');
  });
  it('preserves legitimate empty component output without treating it as failure', () => {
    const Icon = () => null;
    const element = createElement(Icon);
    expect(renderIconMarkupStrict(element)).toBe(renderToStaticMarkup(element));
    expect(renderIconMarkupStrict(element)).toBe('');
  });
  it('keeps escaped attributes, viewBox and SVG child order byte-identical', () => {
    const element = createElement(
      'svg',
      { viewBox: '0 0 24 24', 'data-fixture': '<&"\'>' },
      createElement('path', { d: 'M0 0', strokeWidth: 2.5 }),
      createElement('title', null, 'A & < B')
    );
    expect(renderIconMarkupStrict(element)).toBe(renderToStaticMarkup(element));
    expect(renderIconMarkupStrict(element)).toContain('viewBox="0 0 24 24"');
    expect(renderIconMarkupStrict(element)).not.toContain('data-fixture="<&');
  });
  it('does not mutate caller elements or introduce state between safe and strict calls', () => {
    const props = Object.freeze({ size: 18, color: 'white', strokeWidth: 2.5 });
    const element = createElement(CATEGORY_ICON_MAP.MapPin, props);
    const expected = renderToStaticMarkup(element);
    expect(renderIconMarkupStrict(element)).toBe(expected);
    expect(renderIconMarkup(element)).toBe(expected);
    expect(renderIconMarkupStrict(element)).toBe(expected);
    expect(props).toEqual({ size: 18, color: 'white', strokeWidth: 2.5 });
  });
});
