export type SharePerm =
  | 'share_map'
  | 'share_bookings'
  | 'share_packing'
  | 'share_budget'
  | 'share_collab'
  | 'share_travel_only'
  | 'share_hide_images';
export type SharePerms = Record<SharePerm, boolean>;

export const DEFAULT_PERMS: SharePerms = {
  share_map: true,
  share_bookings: true,
  share_packing: false,
  share_budget: false,
  share_collab: false,
  share_travel_only: false,
  share_hide_images: false,
};
