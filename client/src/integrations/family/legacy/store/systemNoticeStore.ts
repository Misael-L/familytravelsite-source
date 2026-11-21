import { systemNoticeDtoSchema, type SystemNoticeDto } from '@family/shared-compat';
import { create } from '@family/zustand-v4';
import { createSystemNoticeState, type SystemNoticeState } from '../../../../store/systemNoticeState';
import axios, { parseInDev } from '../api/client';
import { isSupabaseDataPlane } from '../data/supabase/auth';

// The notice contract lives in @trek/shared (single source of truth, shared
// with the server). Keep the historical name as an alias so the existing
// SystemNoticeBanner/Modal consumers don't need to change their imports.
export type SystemNoticeDTO = SystemNoticeDto;

export const useSystemNoticeStore = create<SystemNoticeState<SystemNoticeDTO>>()(
  createSystemNoticeState<SystemNoticeDTO>({
    available: () => !isSupabaseDataPlane(),
    async read() {
      const res = await axios.get('/system-notices/active');
      return parseInDev(systemNoticeDtoSchema.array(), res.data, 'systemNotices.fetch');
    },
    async dismiss(id) {
      await axios.post(`/system-notices/${id}/dismiss`);
    },
  })
);
