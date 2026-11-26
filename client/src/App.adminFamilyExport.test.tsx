import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '../tests/helpers/render';
import FamilyAdminPage from './integrations/family/FamilyAdminPage';
import { ToastContainer as FamilyToasts } from './integrations/family/legacy/components/shared/Toast';
import { familyAuthStore } from './integrations/family/repository';

const fixture = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: (await import('react-router')).useNavigate,
}));
vi.mock('./integrations/family/legacy/data/supabase/familyAdmin', async (original) => ({
  ...(await original<typeof import('./integrations/family/legacy/data/supabase/familyAdmin')>()),
  listFamilyAdminMembers: async () => [],
  listPendingAccessRequests: async () => [],
  loadFamilyAdminStats: async () => ({ totalUsers: 0, totalTrips: 0, totalPlaces: 0, totalFiles: 0 }),
}));
vi.mock('@family/backend/supabase/client', async (original) => ({
  ...(await original<typeof import('@family/backend/supabase/client')>()),
  getSupabaseBrowserClient: () => ({
    rpc: fixture.rpc,
    functions: { invoke: fixture.invoke },
  }),
}));

const initialFamily = familyAuthStore.getState();
const familyId = '0b930000-0000-4000-8000-000000000051';

function seedFamily() {
  vi.stubEnv('VITE_DATA_PLANE', 'supabase');
  familyAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    authCheckFailed: false,
    authGate: 'ok',
    isSuperAdmin: false,
    familyId,
    membershipRole: 'patriarch',
    authUserId: '0b930000-0000-4000-8000-000000000055',
    personId: '0b930000-0000-4000-8000-000000000056',
  });
  fixture.invoke.mockReset();
  fixture.rpc.mockReset().mockImplementation(async (name: string) => {
    if (name === 'list_family_permission_policies') {
      return { data: { family_id: familyId, can_manage: true, policies: [] }, error: null };
    }
    throw new Error('Unexpected Admin fixture RPC ' + name);
  });
}

async function openExportTab() {
  fireEvent.click(await screen.findByText('Export', { selector: 'nav button span' }));
}

describe('Family data export session routing', () => {
  const nextFamily = '0b930000-0000-4000-8000-000000000321';
  const jobId = '0b930000-0000-4000-8000-000000000322';
  const queuedId = '0b930000-0000-4000-8000-000000000323';
  const listRpc = 'list_family_export_jobs';
  const requestRpc = 'request_family_export';
  const signFunction = 'get-family-export-download';
  const requestLabel = 'Request export';
  const signedUrl = 'https://fixture-storage.example.test/export.json';
  const ready = { id: jobId, status: 'completed', expires_at: '2026-12-12T01:00:00Z' };
  const queued = { id: queuedId, status: 'queued' };
  const signed = { data: { signed_url: signedUrl, filename: 'fixture-family-export.json' }, error: null };
  const list = (
    id: string,
    canManage = true,
    jobs: Array<{ id: string; status: string; expires_at?: string }> = [ready]
  ) => ({
    data: { family_id: id, can_manage: canManage, jobs },
    error: null,
  });

  function delay<T>() {
    let release!: (result: T) => void;
    const response = new Promise<T>((resolve) => {
      release = resolve;
    });
    return { response, release };
  }

  function reply(handler?: (name: string, input: { p_family_id: string }) => unknown) {
    const other = fixture.rpc.getMockImplementation();
    fixture.rpc.mockImplementation(async (name: string, input: { p_family_id: string }) => {
      const value = handler?.(name, input);
      if (value !== undefined) return value;
      if (name === listRpc) return input.p_family_id === nextFamily ? list(nextFamily, false, []) : list(familyId);
      if (name === requestRpc) return { data: queued, error: null };
      return other?.(name, input);
    });
  }

  function switchFamily() {
    act(() => familyAuthStore.setState({ familyId: nextFamily }));
  }

  async function openExport() {
    await openExportTab();
    await screen.findByRole('heading', { name: 'Family data export' });
  }

  beforeEach(() => {
    seedFamily();
    fixture.invoke.mockResolvedValue(signed);
  });

  afterEach(() => {
    cleanup();
    familyAuthStore.setState(initialFamily, true);
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('drops an earlier export list after moving to a read-only Family', async () => {
    const previous = delay<ReturnType<typeof list>>();
    reply((name, input) => (name === listRpc && input.p_family_id === familyId ? previous.response : undefined));
    render(<FamilyAdminPage />);
    await openExportTab();
    await waitFor(() => expect(fixture.rpc).toHaveBeenCalledWith(listRpc, { p_family_id: familyId }));
    switchFamily();
    expect(await screen.findByText('No family exports yet.')).toBeInTheDocument();
    await act(async () => previous.release(list(familyId)));
    expect(screen.queryByRole('button', { name: requestLabel })).not.toBeInTheDocument();
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
  });

  it('ignores a previous export acknowledgement before refreshing jobs or showing feedback', async () => {
    const previous = delay<{ data: typeof queued; error: null }>();
    reply((name) => (name === requestRpc ? previous.response : undefined));
    render(
      <>
        <FamilyAdminPage />
        <FamilyToasts />
      </>
    );
    await openExport();
    fireEvent.click(screen.getByRole('button', { name: requestLabel }));
    expect(fixture.rpc).toHaveBeenCalledWith(requestRpc, { p_family_id: familyId });
    switchFamily();
    expect(await screen.findByText('No family exports yet.')).toBeInTheDocument();
    await act(async () => previous.release({ data: queued, error: null }));
    expect(fixture.rpc.mock.calls.filter(([name]) => name === listRpc)).toEqual([
      [listRpc, { p_family_id: familyId }],
      [listRpc, { p_family_id: nextFamily }],
    ]);
    expect(screen.queryByText('Export requested')).not.toBeInTheDocument();
  });

  it('skips fetching an export link received after same-Family access changes', async () => {
    const pending = delay<typeof signed>();
    fixture.invoke.mockReturnValueOnce(pending.response);
    const fetchFile = vi.fn().mockRejectedValue(new Error('Fixture abort'));
    vi.stubGlobal('fetch', fetchFile);
    reply((name) =>
      name === listRpc ? list(familyId, familyAuthStore.getState().membershipRole === 'patriarch') : undefined
    );
    render(<FamilyAdminPage />);
    await openExport();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(fixture.invoke).toHaveBeenCalledWith(signFunction, { body: { family_id: familyId, job_id: jobId } });
    act(() => familyAuthStore.setState({ membershipRole: 'parent' }));
    await act(async () => pending.release(signed));
    expect(fetchFile).not.toHaveBeenCalledWith(signedUrl, expect.anything());
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
  });

  function prepareBrowserDownload() {
    const pendingBytes = delay<Blob>();
    const readBody = vi.fn(() => pendingBytes.response);
    const fetchFile = vi.fn().mockResolvedValue({ ok: true, blob: readBody });
    const objectUrl = vi.fn(() => 'blob:family-export-fixture');
    const revokeUrl = vi.fn<(url: string) => void>();
    class FixtureURL extends URL {
      static override createObjectURL = objectUrl;
      static override revokeObjectURL = revokeUrl;
    }
    vi.stubGlobal('URL', FixtureURL);
    vi.stubGlobal('fetch', fetchFile);
    const deliver = vi.fn<(filename: string) => void>();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      deliver(this.download);
    });
    return { pendingBytes, fetchFile, objectUrl, deliver, readBody, revokeUrl };
  }

  it('discards export bytes if the session changes before the browser receives the file', async () => {
    const download = prepareBrowserDownload();
    reply();
    render(<FamilyAdminPage />);
    await openExport();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(download.readBody).toHaveBeenCalledTimes(1));
    switchFamily();
    expect(await screen.findByText('No family exports yet.')).toBeInTheDocument();
    await act(async () => download.pendingBytes.release(new Blob(['{}'])));
    expect(download.objectUrl).not.toHaveBeenCalled();
    expect(download.deliver).not.toHaveBeenCalled();
  });

  it('keeps the newer polling result when an older export read finishes last', async () => {
    const earlier = delay<ReturnType<typeof list>>();
    let reads = 0;
    reply((name) => {
      if (name !== listRpc) return undefined;
      reads += 1;
      if (reads === 2) return earlier.response;
      return list(familyId, true, reads === 1 ? [ready, queued] : [ready]);
    });
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    render(<FamilyAdminPage />);
    await openExport();
    await act(async () => vi.advanceTimersByTimeAsync(8000));
    expect(reads).toBeGreaterThanOrEqual(3);
    await act(async () => earlier.release(list(familyId, true, [queued])));
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.queryByText('Queued')).not.toBeInTheDocument();
  });

  it('drops a download when a current poll withdraws the export grant', async () => {
    const download = prepareBrowserDownload();
    let allowed = true;
    reply((name) => (name === listRpc ? list(familyId, allowed, [ready, queued]) : undefined));
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    render(<FamilyAdminPage />);
    await openExport();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    });
    expect(download.readBody).toHaveBeenCalledTimes(1);
    allowed = false;
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
    await act(async () => download.pendingBytes.release(new Blob(['{}'])));
    expect(download.deliver).not.toHaveBeenCalled();
  });

  it('requests and downloads only the selected job for the current Family under Strict Mode', async () => {
    const download = prepareBrowserDownload();
    reply();
    render(
      <StrictMode>
        <FamilyAdminPage />
        <FamilyToasts />
      </StrictMode>
    );
    await openExport();
    fireEvent.click(screen.getByRole('button', { name: requestLabel }));
    expect(await screen.findByText('Export requested')).toBeInTheDocument();
    expect(fixture.rpc).toHaveBeenCalledWith(requestRpc, { p_family_id: familyId });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(download.readBody).toHaveBeenCalledTimes(1));
    expect(fixture.invoke).toHaveBeenCalledWith(signFunction, { body: { family_id: familyId, job_id: jobId } });
    expect(download.fetchFile).toHaveBeenCalledWith(signedUrl, { credentials: 'omit' });
    vi.useFakeTimers();
    await act(async () => download.pendingBytes.release(new Blob(['{}'])));
    expect(download.deliver).toHaveBeenCalledExactlyOnceWith(signed.data.filename);
    await act(async () => vi.advanceTimersByTimeAsync(100));
    expect(download.revokeUrl).toHaveBeenCalledWith('blob:family-export-fixture');
  });
});
