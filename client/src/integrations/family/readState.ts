import { create } from 'zustand';
export type FamilyResource = 'reservations' | 'expenses' | 'files';
export type FamilyReadPhase = 'loading' | 'ready' | 'error';
export const useFamilyReadState = create<{
  reads: Record<string, { phase: FamilyReadPhase; message?: string }>;
}>(() => ({ reads: {} }));
export const readKey = (tripId: string, resource: FamilyResource) => `${tripId}:${resource}`;
export function setFamilyRead(tripId: string, resource: FamilyResource, phase: FamilyReadPhase, error?: unknown) {
  useFamilyReadState.setState((s) => ({
    reads: {
      ...s.reads,
      [readKey(tripId, resource)]: {
        phase,
        message: error instanceof Error ? error.message : undefined,
      },
    },
  }));
}
export function clearFamilyReads() {
  useFamilyReadState.setState({ reads: {} });
}
