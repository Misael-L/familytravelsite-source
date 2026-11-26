import { useState, type ReactNode } from 'react';
import { OpenTrack, PublishTrack, type PreviewTourMapDraft } from './PreviewTourMapContext';

export function PreviewTourMapProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<PreviewTourMapDraft | null>(null);
  return <PublishTrack.Provider value={setDraft}>
    <OpenTrack.Provider value={draft}>{children}</OpenTrack.Provider>
  </PublishTrack.Provider>;
}
