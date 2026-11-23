import { coherentStayQualificationEnabled, nativeStayCommandQualificationEnabled } from './coherentStayQualification';
import { getSupabaseUrl } from './legacy/data/supabase/env';
/** Qualification only. No hosted endpoint or ordinary build may admit cold Trip reads yet. */
export const offlineTripQualificationEnabled = () =>
  coherentStayQualificationEnabled() ||
  (import.meta.env.VITE_FAMILY_OFFLINE_READ_QUALIFICATION === 'local-v1' &&
    (['http://127.0.0.1:55331', 'http://127.0.0.1:55431'].includes(getSupabaseUrl()) ||
      packingIdentityQualificationEnabled() ||
      packingAggregateQualificationEnabled()));

/** Normal bootstrap category activation is limited to the marked122 qualification build. */
export const packingCategoryQualificationEnabled = () =>
  offlineTripQualificationEnabled() && getSupabaseUrl() === 'http://127.0.0.1:55431';

/** Explicit identity-presentation rehearsal only; never a hosted feature flag. */
export const packingIdentityQualificationEnabled = () =>
  import.meta.env.VITE_FAMILY_PACKING_IDENTITY_QUALIFICATION === 'local-v2' &&
  getSupabaseUrl() === 'http://127.0.0.1:55631';

/** Existing preparation scopes are unchanged; v3 additionally admits only the explicit124 rehearsal source. */
export const completePreparationSource = (source: string, format: string) =>
  ['http://127.0.0.1:55331', 'http://localhost:55331'].includes(source) ||
  (format === 'family.offline-trip.v3' && source === 'http://127.0.0.1:55631') ||
  (format === 'family.offline-trip.v3' &&
    source === 'http://127.0.0.1:55731' &&
    packingAggregateQualificationEnabled());

/** Separate explicit125 aggregate rehearsal; default/hosted activation stays off. */
export const packingAggregateQualificationEnabled = () =>
  import.meta.env.VITE_FAMILY_PACKING_AGGREGATE_QUALIFICATION === 'local-v3' &&
  getSupabaseUrl() === 'http://127.0.0.1:55731';

/** Native bag UI rehearsal is admitted only on strict127; hosted/default builds stay gated. */
export const packingBagQualificationEnabled = () =>
  import.meta.env.VITE_FAMILY_PACKING_BAG_QUALIFICATION === 'local-v1' && getSupabaseUrl() === 'http://127.0.0.1:55931';

/** Separate128 recovery rehearsal; the accepted127 qualification is unchanged. */
export const packingRecoveryQualificationEnabled = () =>
  import.meta.env.VITE_FAMILY_PACKING_RECOVERY_QUALIFICATION === 'local-v1' &&
  getSupabaseUrl() === 'http://127.0.0.1:56041';

/** Public images only on the already owned native-v4 rehearsal, never private files or whole preparation. */
export const v4PublicImageSource = (source: string) =>
  source === 'http://127.0.0.1:57171' && nativeStayCommandQualificationEnabled();
export const publicImagePreparationSource = (source: string, format: string) =>
  format === 'family.offline-trip.v4' ? v4PublicImageSource(source) : completePreparationSource(source, format);

/** Private RAM only, independently marked; public-image qualification never grants file readiness. */
export const v4PrivateFileSource = (source: string) =>
  source === 'http://127.0.0.1:57171' &&
  nativeStayCommandQualificationEnabled() &&
  import.meta.env.VITE_FAMILY_PRIVATE_FILE_QUALIFICATION === 'local-v4';
export const privateFilePreparationSource = (source: string, format: string) =>
  format === 'family.offline-trip.v4' ? v4PrivateFileSource(source) : completePreparationSource(source, format);
