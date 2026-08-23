/**
 * Family-scoped portability export (§38). Postgres + Edge are SoR.
 * Distinct from platform backup/PITR and Nest backupApi.
 */

import { getSupabaseBrowserClient } from './client'

export type FamilyExportJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'expired'

export type FamilyExportJob = {
  id: string
  status: FamilyExportJobStatus
  schemaVersion: number
  requestedByPersonId: string | null
  byteSize: number | null
  sha256: string | null
  rowCounts: Record<string, number>
  errorCode: string | null
  attemptCount: number
  expiresAt: string | null
  createdAt: string
  completedAt: string | null
}

export type FamilyExportJobs = {
  familyId: string
  canManage: boolean
  jobs: FamilyExportJob[]
}

export type FamilyExportDownload = {
  signedUrl: string
  expiresIn: number
  filename: string
  sha256: string | null
  byteSize: number | null
}

type JobRow = {
  id?: string
  status?: string
  schema_version?: number
  requested_by_person_id?: string | null
  byte_size?: number | null
  sha256?: string | null
  row_counts?: Record<string, number> | null
  error_code?: string | null
  attempt_count?: number
  expires_at?: string | null
  created_at?: string
  completed_at?: string | null
  storage_path?: unknown
}

const STATUSES: FamilyExportJobStatus[] = ['queued', 'processing', 'completed', 'failed', 'expired']

function asStatus(value: string | undefined): FamilyExportJobStatus {
  return STATUSES.includes(value as FamilyExportJobStatus) ? (value as FamilyExportJobStatus) : 'failed'
}

function mapJob(row: JobRow): FamilyExportJob {
  if ('storage_path' in row && row.storage_path != null) {
    throw new Error('export job leaked storage_path')
  }
  return {
    id: row.id ?? '',
    status: asStatus(row.status),
    schemaVersion: row.schema_version ?? 1,
    requestedByPersonId: row.requested_by_person_id ?? null,
    byteSize: row.byte_size ?? null,
    sha256: row.sha256 ?? null,
    rowCounts: row.row_counts ?? {},
    errorCode: row.error_code ?? null,
    attemptCount: row.attempt_count ?? 0,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at ?? '',
    completedAt: row.completed_at ?? null,
  }
}

export async function listFamilyExportJobs(familyId: string): Promise<FamilyExportJobs> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('list_family_export_jobs', { p_family_id: familyId })
  if (error) throw error
  const row = data as { family_id?: string; can_manage?: boolean; jobs?: JobRow[] } | null
  if (!row) throw new Error('export jobs missing')
  return {
    familyId: row.family_id ?? familyId,
    canManage: !!row.can_manage,
    jobs: (row.jobs ?? []).map(mapJob),
  }
}

export async function requestFamilyExport(familyId: string): Promise<FamilyExportJob> {
  const { data, error } = await getSupabaseBrowserClient()
    .rpc('request_family_export', { p_family_id: familyId })
  if (error) throw error
  const row = data as JobRow | null
  if (!row?.id) throw new Error('export request missing')
  return mapJob(row)
}

export async function getFamilyExportDownload(familyId: string, jobId: string): Promise<FamilyExportDownload> {
  const { data, error } = await getSupabaseBrowserClient().functions.invoke<{
    signed_url?: string
    expires_in?: number
    filename?: string
    sha256?: string | null
    byte_size?: number | null
    error?: string
  }>('get-family-export-download', {
    body: { family_id: familyId, job_id: jobId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  if (!data?.signed_url) throw new Error('export download missing')
  return {
    signedUrl: data.signed_url,
    expiresIn: data.expires_in ?? 120,
    filename: data.filename ?? `family-export-${jobId}.json`,
    sha256: data.sha256 ?? null,
    byteSize: data.byte_size ?? null,
  }
}

export function isActiveExportJob(status: FamilyExportJobStatus): boolean {
  return status === 'queued' || status === 'processing'
}
