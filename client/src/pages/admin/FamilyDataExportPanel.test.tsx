import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '../../../tests/helpers/render'
import { resetAllStores } from '../../../tests/helpers/store'
import { useAuthStore } from '../../store/authStore'
import { buildUser } from '../../../tests/helpers/factories'
import { ToastContainer } from '../../components/shared/Toast'
import FamilyDataExportPanel from './FamilyDataExportPanel'
import type { FamilyExportJobs } from '../../data/supabase/familyExport'

const { listJobs, requestExport, getDownload, downloadFile } = vi.hoisted(() => ({
  listJobs: vi.fn(),
  requestExport: vi.fn(),
  getDownload: vi.fn(),
  downloadFile: vi.fn(),
}))

vi.mock('../../data/supabase/familyExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../data/supabase/familyExport')>()
  return {
    ...actual,
    listFamilyExportJobs: listJobs,
    requestFamilyExport: requestExport,
    getFamilyExportDownload: getDownload,
  }
})

vi.mock('../../utils/fileDownload', () => ({
  downloadFile,
}))

const hofSnapshot: FamilyExportJobs = {
  familyId: 'fam-1',
  canManage: true,
  jobs: [{
    id: 'job-1',
    status: 'completed',
    schemaVersion: 1,
    requestedByPersonId: 'p-1',
    byteSize: 12,
    sha256: 'ab'.repeat(32),
    rowCounts: { people: 1 },
    errorCode: null,
    attemptCount: 1,
    expiresAt: '2026-08-23T00:00:00.000Z',
    createdAt: '2026-08-22T00:00:00.000Z',
    completedAt: '2026-08-22T00:01:00.000Z',
  }],
}

const parentSnapshot: FamilyExportJobs = { ...hofSnapshot, canManage: false }

beforeEach(() => {
  resetAllStores()
  listJobs.mockReset()
  requestExport.mockReset()
  getDownload.mockReset()
  downloadFile.mockReset()
  useAuthStore.setState({
    user: buildUser({ role: 'admin' }),
    isAuthenticated: true,
    familyId: 'fam-1',
    isSuperAdmin: false,
  })
})

describe('FamilyDataExportPanel', () => {
  it('lets HOF request and download without restore or backup controls', async () => {
    listJobs.mockResolvedValue(hofSnapshot)
    requestExport.mockResolvedValue({ ...hofSnapshot.jobs[0], status: 'queued', id: 'job-2' })
    getDownload.mockResolvedValue({
      signedUrl: 'https://example.supabase.co/storage/v1/object/sign/x',
      expiresIn: 120,
      filename: 'family-export.json',
      sha256: hofSnapshot.jobs[0].sha256,
      byteSize: 12,
    })
    downloadFile.mockResolvedValue(undefined)
    render(
      <>
        <FamilyDataExportPanel />
        <ToastContainer />
      </>,
    )
    expect(await screen.findByText('Family data export')).toBeInTheDocument()
    expect(screen.queryByText(/restore/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^backup$/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/schedule/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /request export/i }))
    await waitFor(() => {
      expect(requestExport).toHaveBeenCalledWith('fam-1')
    })
    fireEvent.click(screen.getByRole('button', { name: /^download$/i }))
    await waitFor(() => {
      expect(getDownload).toHaveBeenCalledWith('fam-1', 'job-1')
      expect(downloadFile).toHaveBeenCalled()
    })
  })

  it('keeps parents read-only', async () => {
    listJobs.mockResolvedValue(parentSnapshot)
    render(<FamilyDataExportPanel />)
    expect(await screen.findByText(/view only/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /request export/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^download$/i })).not.toBeInTheDocument()
  })
})
