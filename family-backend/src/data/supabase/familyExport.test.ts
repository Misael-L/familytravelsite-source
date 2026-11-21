import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseBrowserClient } from './client'
import {
  getFamilyExportDownload,
  isActiveExportJob,
  listFamilyExportJobs,
  requestFamilyExport,
} from './familyExport'

vi.mock('./client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

describe('familyExport adapter', () => {
  const rpc = vi.fn()
  const invoke = vi.fn()

  beforeEach(() => {
    rpc.mockReset()
    invoke.mockReset()
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      rpc,
      functions: { invoke },
    } as never)
  })

  it('lists sanitized jobs and throws on RPC error', async () => {
    rpc.mockResolvedValue({
      data: {
        family_id: 'fam-1',
        can_manage: true,
        jobs: [{
          id: 'job-1',
          status: 'completed',
          schema_version: 1,
          requested_by_person_id: 'p-1',
          byte_size: 12,
          sha256: 'ab'.repeat(32),
          row_counts: { people: 1 },
          error_code: null,
          attempt_count: 1,
          expires_at: '2026-08-23T00:00:00Z',
          created_at: '2026-08-22T00:00:00Z',
          completed_at: '2026-08-22T00:01:00Z',
        }],
      },
      error: null,
    })
    await expect(listFamilyExportJobs('fam-1')).resolves.toMatchObject({
      familyId: 'fam-1',
      canManage: true,
      jobs: [{ id: 'job-1', status: 'completed', schemaVersion: 1 }],
    })
    expect(rpc).toHaveBeenCalledWith('list_family_export_jobs', { p_family_id: 'fam-1' })

    rpc.mockResolvedValue({ data: null, error: { message: 'denied' } })
    await expect(listFamilyExportJobs('fam-1')).rejects.toMatchObject({ message: 'denied' })
  })

  it('rejects a leaked storage_path', async () => {
    rpc.mockResolvedValue({
      data: {
        family_id: 'fam-1',
        can_manage: true,
        jobs: [{ id: 'job-1', status: 'completed', storage_path: 'secret.json' }],
      },
      error: null,
    })
    await expect(listFamilyExportJobs('fam-1')).rejects.toThrow(/storage_path/)
  })

  it('requests an export and throws on error', async () => {
    rpc.mockResolvedValue({
      data: { id: 'job-2', status: 'queued', schema_version: 1, created_at: '2026-08-22T00:00:00Z' },
      error: null,
    })
    await expect(requestFamilyExport('fam-1')).resolves.toMatchObject({ id: 'job-2', status: 'queued' })
    rpc.mockResolvedValue({ data: null, error: { message: 'export_in_progress' } })
    await expect(requestFamilyExport('fam-1')).rejects.toMatchObject({ message: 'export_in_progress' })
  })

  it('downloads via Edge and never calls Nest backup routes', async () => {
    invoke.mockResolvedValue({
      data: { signed_url: 'https://files.example.invalid/storage/v1/object/sign/x', expires_in: 120, filename: 'a.json' },
      error: null,
    })
    await expect(getFamilyExportDownload('fam-1', 'job-1')).resolves.toMatchObject({
      signedUrl: 'https://files.example.invalid/storage/v1/object/sign/x',
      expiresIn: 120,
    })
    expect(invoke).toHaveBeenCalledWith('get-family-export-download', {
      body: { family_id: 'fam-1', job_id: 'job-1' },
    })
    invoke.mockResolvedValue({ data: null, error: { message: 'denied' } })
    await expect(getFamilyExportDownload('fam-1', 'job-1')).rejects.toMatchObject({ message: 'denied' })
  })

  it('treats queued and processing as active', () => {
    expect(isActiveExportJob('queued')).toBe(true)
    expect(isActiveExportJob('processing')).toBe(true)
    expect(isActiveExportJob('completed')).toBe(false)
  })
})
