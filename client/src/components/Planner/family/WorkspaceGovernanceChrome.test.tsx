import React from 'react'
import { render, screen } from '../../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import WorkspaceGovernanceChrome from './WorkspaceGovernanceChrome'
import type { UseFamilyTripWorkspaceGovernanceResult } from '../../../pages/familyTripWorkspace/useFamilyTripWorkspaceGovernance'
import type { WorkspaceWriteMode } from '../../../pages/familyTripWorkspace/workspaceGovernanceModel'
import type { TripChangeDraftOpRow, TripChangeRequestRow } from '../../../data/supabase/tripChangeRequests'
import { ToastContainer } from '../../shared/Toast'

function op(partial: Partial<TripChangeDraftOpRow> = {}): TripChangeDraftOpRow {
  return {
    id: 'op-1',
    draftId: 'draft-1',
    module: 'trip_place',
    op: 'add',
    tripDayId: null,
    civilDate: null,
    targetTable: 'trip_places',
    targetId: null,
    payload: { schema_version: 1, place_id: 'pl-1' },
    sortOrder: 0,
    createdAt: null,
    ...partial,
  }
}

function request(partial: Partial<TripChangeRequestRow> = {}): TripChangeRequestRow {
  return {
    id: 'req-1',
    tripId: 'trip-1',
    proposedByPersonId: 'p1',
    status: 'submitted',
    summary: 'Places',
    submittedAt: '2026-08-20',
    resolvedAt: null,
    ...partial,
  }
}

function gov(partial: Partial<UseFamilyTripWorkspaceGovernanceResult> = {}): UseFamilyTripWorkspaceGovernanceResult {
  return {
    layer: 'published',
    setLayer: vi.fn(),
    canMutate: false,
    canDraft: true,
    canEditPublished: false,
    canStageDraft: false,
    writeMode: 'nudge',
    writeModeFor: vi.fn((_key: string): WorkspaceWriteMode => 'nudge'),
    actionOutcomes: {},
    canUseEditors: false,
    changeDraft: null,
    draftOps: [],
    openChangeRequests: [],
    mySubmittedRequests: [],
    isChangeBusy: false,
    governanceError: null,
    mutateGateError: false,
    reloadChangeGovernance: vi.fn(),
    addDraftOp: vi.fn().mockResolvedValue(true),
    deleteDraftOp: vi.fn().mockResolvedValue(true),
    proposeDraftChanges: vi.fn().mockResolvedValue(true),
    withdrawRequest: vi.fn().mockResolvedValue(true),
    resolveOp: vi.fn().mockResolvedValue({ ok: true }),
    resolveRequest: vi.fn().mockResolvedValue({ ok: true, errorCodes: [] }),
    loadRequestOps: vi.fn().mockResolvedValue([]),
    nextSortOrder: 0,
    ...partial,
  }
}

function renderChrome(model: UseFamilyTripWorkspaceGovernanceResult) {
  return render(
    <>
      <ToastContainer />
      <WorkspaceGovernanceChrome gov={model} />
    </>,
  )
}

describe('WorkspaceGovernanceChrome', () => {
  it('labels the layer control and nudges non-HOF viewers to My draft', async () => {
    const user = userEvent.setup()
    const model = gov()
    renderChrome(model)
    expect(screen.getByRole('group', { name: 'Itinerary layer' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Expand draft controls' }))
    expect(screen.getByText(/Switch to My draft/)).toBeInTheDocument()
  })

  it('lists draft ops, deletes one, and proposes with a summary', async () => {
    const user = userEvent.setup()
    const model = gov({
      layer: 'myDraft',
      writeMode: 'draft',
      canStageDraft: true,
      canUseEditors: true,
      draftOps: [op()],
    })
    renderChrome(model)
    await user.click(screen.getByRole('button', { name: 'Expand draft controls' }))
    expect(screen.getByText('Add · Destination')).toBeInTheDocument()
    expect(screen.getByText('pl-1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove draft change' }))
    expect(model.deleteDraftOp).toHaveBeenCalledWith('op-1')
    await user.click(screen.getByRole('button', { name: 'Propose 1' }))
    expect(screen.getByRole('heading', { name: 'Propose changes to HOF?' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Optional summary'), 'Places')
    await user.click(screen.getByRole('button', { name: 'Propose' }))
    expect(model.proposeDraftChanges).toHaveBeenCalledWith('Places')
  })

  it('withdraws a submitted request and opens the HOF inbox', async () => {
    const user = userEvent.setup()
    const model = gov({
      canMutate: true,
      writeMode: 'direct',
      canEditPublished: true,
      canUseEditors: true,
      mySubmittedRequests: [request()],
      openChangeRequests: [request()],
      loadRequestOps: vi.fn().mockResolvedValue([{
        id: 'rop-1',
        requestId: 'req-1',
        module: 'expense',
        op: 'add',
        tripDayId: null,
        civilDate: null,
        targetTable: 'trip_expenses',
        targetId: null,
        payload: { schema_version: 1, name: 'Dinner' },
        sortOrder: 0,
        status: 'pending',
        hofNote: null,
        errorCode: null,
        createdAt: null,
      }]),
    })
    renderChrome(model)
    await user.click(screen.getByRole('button', { name: 'Expand draft controls' }))
    await user.click(screen.getByRole('button', { name: 'Withdraw' }))
    const confirms = await screen.findAllByRole('button', { name: 'Withdraw' })
    await user.click(confirms[confirms.length - 1])
    expect(model.withdrawRequest).toHaveBeenCalledWith('req-1')

    await user.click(screen.getByRole('button', { name: 'Review 1 change requests' }))
    expect(await screen.findByRole('heading', { name: 'Change requests' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Places' }))
    expect(await screen.findByText('Dinner')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(model.resolveOp).toHaveBeenCalledWith('rop-1', true)
    await user.click(screen.getByRole('button', { name: 'Apply all' }))
    const applyAll = screen.getAllByRole('button', { name: 'Apply all' })
    await user.click(applyAll[applyAll.length - 1])
    expect(model.resolveRequest).toHaveBeenCalledWith('req-1', true)
  })

  it('shows apply error codes and HOF notes instead of success', async () => {
    const user = userEvent.setup()
    const model = gov({
      canMutate: true,
      writeMode: 'direct',
      canEditPublished: true,
      canUseEditors: true,
      openChangeRequests: [request()],
      resolveOp: vi.fn().mockResolvedValue({ ok: false, errorCode: 'unsupported_schema_version' }),
      loadRequestOps: vi.fn().mockResolvedValue([{
        id: 'rop-1',
        requestId: 'req-1',
        module: 'plan_item',
        op: 'add',
        tripDayId: null,
        civilDate: null,
        targetTable: 'schedule_items',
        targetId: null,
        payload: { schema_version: 1, activity: 'Duomo' },
        sortOrder: 0,
        status: 'pending',
        hofNote: 'Needs a day',
        errorCode: 'apply_failed',
        createdAt: null,
      }]),
    })
    renderChrome(model)
    await user.click(screen.getByRole('button', { name: 'Expand draft controls' }))
    await user.click(screen.getByRole('button', { name: 'Review 1 change requests' }))
    await user.click(await screen.findByRole('button', { name: 'Places' }))
    expect(await screen.findByText('Could not apply this change (apply_failed)')).toBeInTheDocument()
    expect(screen.getByText('Note: Needs a day')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await screen.findByText('Could not apply this change (unsupported_schema_version)')).toBeInTheDocument()
  })
})
