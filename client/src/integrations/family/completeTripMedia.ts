import type { StoredCompleteTrip } from './completeTripV4';

/** Only public cover facts from an already validated envelope; no copied private core or new snapshot. */
export function completeTripMedia(envelope: StoredCompleteTrip) {
  const { locations, variants } =
    envelope.format === 'family.offline-trip.v4'
      ? { locations: envelope.data.core.planner.state.locations, variants: envelope.data.variants }
      : { locations: envelope.data.planner.view.state.locations, variants: envelope.data.planner.variants };
  return Object.freeze({
    locations: Object.freeze(locations.map(({ id, cover_media_id }) => Object.freeze({ id, cover_media_id }))),
    variants: Object.freeze(
      variants.map(({ mediaAssetId, recipeVersion, thumbUrl, heroUrl }) =>
        Object.freeze({ mediaAssetId, recipeVersion, thumbUrl, heroUrl })
      )
    ),
  });
}
