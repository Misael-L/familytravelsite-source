import { getSupabaseUrl } from './legacy/data/supabase/env';
/** Local canonical133 cache rehearsal only. Never a hosted/default/native activation switch. */
export const coherentStayQualificationEnabled = () =>
  (import.meta.env.VITE_FAMILY_STAY_READ_QUALIFICATION === 'local-v4' &&
    ['http://127.0.0.1:56471', 'http://127.0.0.1:56571', 'http://127.0.0.1:56671'].includes(getSupabaseUrl())) ||
  nativeStayCommandQualificationEnabled();

/** Existing-stay writer rehearsal only; create/delete/compound commands remain unavailable. */
export const nativeStayWriteQualificationEnabled = () =>
  coherentStayQualificationEnabled() &&
  import.meta.env.VITE_FAMILY_STAY_WRITE_QUALIFICATION === 'local-existing-v1' &&
  getSupabaseUrl() === 'http://127.0.0.1:56671';

/** Separate original native-command rehearsal only; never a hosted/default/native UI activation switch. */
export const nativeStayCommandQualificationEnabled = () =>
  import.meta.env.VITE_FAMILY_STAY_COMMAND_QUALIFICATION === 'local-native-v1' &&
  getSupabaseUrl() === 'http://127.0.0.1:57171';

/** Combined native controls rehearsal; installing controls still requires lifecycle/Trash/browser acceptance. */
export const nativeStayControlsQualificationEnabled = () =>
  nativeStayCommandQualificationEnabled() &&
  import.meta.env.VITE_FAMILY_STAY_CONTROLS_QUALIFICATION === 'local-native-v1';
