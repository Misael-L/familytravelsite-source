import {
  MAPBOX_STYLE_PRESETS as nativeMapboxPresets,
  OPENFREEMAP_STYLE_PRESETS as nativeOpenFreeMapPresets,
  type GlMapProvider,
  type GlStylePreset,
} from '../../../../../components/Map/glProviders';

export {
  basemapLanguage,
  defaultStyleForProvider,
  isOpenFreeMapStyle,
  MAPBOX_DEFAULT_STYLE,
  normalizeStyleForProvider,
  OPENFREEMAP_DEFAULT_STYLE,
  styleForActiveProvider,
  styleSettingKey,
  type GlMapProvider,
  type GlStylePreset,
} from '../../../../../components/Map/glProviders';

// Keep the Family selectors' preset lists and their tags independently mutable.
function copyStylePresets(presets: readonly GlStylePreset[]): GlStylePreset[] {
  return presets.map((preset) => (preset.tags ? { ...preset, tags: [...preset.tags] } : { ...preset }));
}

export const MAPBOX_STYLE_PRESETS = copyStylePresets(nativeMapboxPresets);
export const OPENFREEMAP_STYLE_PRESETS = copyStylePresets(nativeOpenFreeMapPresets);

export function getStylePresets(provider: GlMapProvider): GlStylePreset[] {
  return provider === 'maplibre-gl' ? OPENFREEMAP_STYLE_PRESETS : MAPBOX_STYLE_PRESETS;
}
