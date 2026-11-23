/** Shared types for the admin page + its data hook. No React, no side effects. */

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
  created_at: string;
  last_login?: string | null;
  online?: boolean;
  oidc_issuer?: string | null;
  avatar_url?: string | null;
}

export interface AdminStats {
  totalUsers: number;
  totalTrips: number;
  totalPlaces: number;
  totalFiles: number;
}
