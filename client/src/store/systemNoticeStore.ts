import { create } from 'zustand';
import axios, { parseInDev } from '../api/client';
import { createSystemNoticeState, type SystemNoticeState } from './systemNoticeState';
import { systemNoticeDtoSchema, type SystemNoticeDto } from '@trek/shared';

// The notice contract lives in @trek/shared (single source of truth, shared
// with the server). Keep the historical name as an alias so the existing
// SystemNoticeBanner/Modal consumers don't need to change their imports.
export type SystemNoticeDTO = SystemNoticeDto;

// Baked in by `define` in vite.config.js; a build without it (a bare tsc run) sends
// nothing and therefore gets no release notice, which is the safe side.
const UI_VERSION: string = typeof __TREK_UI_VERSION__ === 'string' ? __TREK_UI_VERSION__ : '';

export const useSystemNoticeStore = create<SystemNoticeState<SystemNoticeDTO>>()(
  createSystemNoticeState<SystemNoticeDTO>({
    async read() {
      // Only a bundle that can render the release notice for this version may receive it.
      const res = await axios.get('/system-notices/active', { params: { supports: 'release', ui: UI_VERSION } });
      return parseInDev(systemNoticeDtoSchema.array(), res.data, 'systemNotices.fetch');
    },
    async dismiss(id) {
      await axios.post(`/system-notices/${id}/dismiss`);
    },
  })
);
