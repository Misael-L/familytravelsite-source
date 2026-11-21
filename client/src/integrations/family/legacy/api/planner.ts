import {
  type AccommodationCreateRequest,
  type AccommodationUpdateRequest,
  type AssignmentCreateRequest,
  type AssignmentParticipantsRequest,
  type AssignmentReorderRequest,
  type AssignmentTimeRequest,
  type BookingImportConfirmResponse,
  type BookingImportMode,
  type BookingImportPreviewItem,
  type BookingImportPreviewResponse,
  type BudgetCreateItemRequest,
  type BudgetReorderCategoriesRequest,
  type BudgetToggleMemberPaidRequest,
  type BudgetUpdateItemRequest,
  type BudgetUpdateMembersRequest,
  type DayCreateRequest,
  type DayNoteCreateRequest,
  type DayNoteUpdateRequest,
  type DayReorderRequest,
  type DayUpdateRequest,
  type FileLinkRequest,
  type FileUpdateRequest,
  type PackingApplyTemplateRequest,
  type PackingBagMembersRequest,
  type PackingCategoryAssigneesRequest,
  type PackingCreateBagRequest,
  type PackingCreateItemRequest,
  type PackingImportRequest,
  type PackingReorderRequest,
  type PackingSetSharingRequest,
  type PackingUpdateBagRequest,
  type PackingUpdateItemRequest,
  type PlaceBulkDeleteRequest,
  type PlaceBulkUpdateRequest,
  type PlaceCreateRequest,
  type PlaceImportListRequest,
  type PlaceUpdateRequest,
  type ReservationCreateRequest,
  type ReservationUpdateRequest,
  type TodoCategoryAssigneesRequest,
  type TodoCreateItemRequest,
  type TodoReorderRequest,
  type TodoUpdateItemRequest,
  type TripAddMemberRequest,
  type TripCopyRequest,
  type TripCreateGuestRequest,
  type TripCreateRequest,
  type TripRenameGuestRequest,
  type TripTransferOwnershipRequest,
  type TripUpdateRequest,
} from '@family/shared-compat';

import { apiClient, postMultipart, type UploadOptions } from './transport';

export const tripsApi = {
  list: (params?: Record<string, unknown>) => apiClient.get('/trips', { params }).then((r) => r.data),
  create: (data: TripCreateRequest) => apiClient.post('/trips', data).then((r) => r.data),
  get: (id: number | string) => apiClient.get(`/trips/${id}`).then((r) => r.data),
  update: (id: number | string, data: TripUpdateRequest) => apiClient.put(`/trips/${id}`, data).then((r) => r.data),
  delete: (id: number | string) => apiClient.delete(`/trips/${id}`).then((r) => r.data),
  uploadCover: (id: number | string, formData: FormData) => postMultipart(`/trips/${id}/cover`, formData),
  searchCoverImages: (query: string) =>
    apiClient.get('/trips/cover-images/search', { params: { query } }).then((r) => r.data),
  archive: (id: number | string) => apiClient.put(`/trips/${id}`, { is_archived: true }).then((r) => r.data),
  unarchive: (id: number | string) => apiClient.put(`/trips/${id}`, { is_archived: false }).then((r) => r.data),
  getMembers: (id: number | string) => apiClient.get(`/trips/${id}/members`).then((r) => r.data),
  addMember: (id: number | string, identifier: string) =>
    apiClient.post(`/trips/${id}/members`, { identifier } satisfies TripAddMemberRequest).then((r) => r.data),
  removeMember: (id: number | string, userId: number) =>
    apiClient.delete(`/trips/${id}/members/${userId}`).then((r) => r.data),
  transferOwnership: (id: number | string, newOwnerId: number) =>
    apiClient.post(`/trips/${id}/transfer`, { newOwnerId } satisfies TripTransferOwnershipRequest).then((r) => r.data),
  createGuest: (id: number | string, name: string) =>
    apiClient.post(`/trips/${id}/guests`, { name } satisfies TripCreateGuestRequest).then((r) => r.data),
  renameGuest: (id: number | string, userId: number, name: string) =>
    apiClient.put(`/trips/${id}/guests/${userId}`, { name } satisfies TripRenameGuestRequest).then((r) => r.data),
  deleteGuest: (id: number | string, userId: number) =>
    apiClient.delete(`/trips/${id}/guests/${userId}`).then((r) => r.data),
  copy: (id: number | string, data?: TripCopyRequest) =>
    apiClient.post(`/trips/${id}/copy`, data || {}).then((r) => r.data),
  bundle: (id: number | string) => apiClient.get(`/trips/${id}/bundle`).then((r) => r.data),
};

export const daysApi = {
  list: (tripId: number | string) => apiClient.get(`/trips/${tripId}/days`).then((r) => r.data),
  create: (tripId: number | string, data: DayCreateRequest) =>
    apiClient.post(`/trips/${tripId}/days`, data).then((r) => r.data),
  update: (tripId: number | string, dayId: number | string, data: DayUpdateRequest) =>
    apiClient.put(`/trips/${tripId}/days/${dayId}`, data).then((r) => r.data),
  delete: (tripId: number | string, dayId: number | string) =>
    apiClient.delete(`/trips/${tripId}/days/${dayId}`).then((r) => r.data),
  reorder: (tripId: number | string, orderedIds: number[]) =>
    apiClient.put(`/trips/${tripId}/days/reorder`, { orderedIds } satisfies DayReorderRequest).then((r) => r.data),
};

export const placesApi = {
  list: (tripId: number | string, params?: Record<string, unknown>) =>
    apiClient.get(`/trips/${tripId}/places`, { params }).then((r) => r.data),
  create: (tripId: number | string, data: PlaceCreateRequest) =>
    apiClient.post(`/trips/${tripId}/places`, data).then((r) => r.data),
  get: (tripId: number | string, id: number | string) =>
    apiClient.get(`/trips/${tripId}/places/${id}`).then((r) => r.data),
  update: (tripId: number | string, id: number | string, data: PlaceUpdateRequest) =>
    apiClient.put(`/trips/${tripId}/places/${id}`, data).then((r) => r.data),
  delete: (tripId: number | string, id: number | string) =>
    apiClient.delete(`/trips/${tripId}/places/${id}`).then((r) => r.data),
  searchImage: (tripId: number | string, id: number | string) =>
    apiClient.get(`/trips/${tripId}/places/${id}/image`).then((r) => r.data),
  importGpx: (
    tripId: number | string,
    file: File,
    opts?: { waypoints?: boolean; routes?: boolean; tracks?: boolean }
  ) => {
    const fd = new FormData();
    fd.append('file', file);
    if (opts?.waypoints !== undefined) fd.append('importWaypoints', String(opts.waypoints));
    if (opts?.routes !== undefined) fd.append('importRoutes', String(opts.routes));
    if (opts?.tracks !== undefined) fd.append('importTracks', String(opts.tracks));
    return postMultipart(`/trips/${tripId}/places/import/gpx`, fd);
  },
  importMapFile: (tripId: number | string, file: File, opts?: { points?: boolean; paths?: boolean }) => {
    const fd = new FormData();
    fd.append('file', file);
    if (opts?.points !== undefined) fd.append('importPoints', String(opts.points));
    if (opts?.paths !== undefined) fd.append('importPaths', String(opts.paths));
    return postMultipart(`/trips/${tripId}/places/import/map`, fd);
  },
  importGoogleList: (tripId: number | string, url: string, enrich?: boolean) =>
    apiClient
      .post(`/trips/${tripId}/places/import/google-list`, { url, enrich } satisfies PlaceImportListRequest)
      .then((r) => r.data),
  importNaverList: (tripId: number | string, url: string, enrich?: boolean) =>
    apiClient
      .post(`/trips/${tripId}/places/import/naver-list`, { url, enrich } satisfies PlaceImportListRequest)
      .then((r) => r.data),
  bulkDelete: (tripId: number | string, ids: number[]) =>
    apiClient.post(`/trips/${tripId}/places/bulk-delete`, { ids } satisfies PlaceBulkDeleteRequest).then((r) => r.data),
  bulkUpdate: (tripId: number | string, ids: number[], data: Omit<PlaceBulkUpdateRequest, 'ids'>) =>
    apiClient
      .post(`/trips/${tripId}/places/bulk-update`, { ids, ...data } satisfies PlaceBulkUpdateRequest)
      .then((r) => r.data),
};

export const assignmentsApi = {
  list: (tripId: number | string, dayId: number | string) =>
    apiClient.get(`/trips/${tripId}/days/${dayId}/assignments`).then((r) => r.data),
  create: (tripId: number | string, dayId: number | string, data: AssignmentCreateRequest) =>
    apiClient.post(`/trips/${tripId}/days/${dayId}/assignments`, data).then((r) => r.data),
  delete: (tripId: number | string, dayId: number | string, id: number) =>
    apiClient.delete(`/trips/${tripId}/days/${dayId}/assignments/${id}`).then((r) => r.data),
  reorder: (tripId: number | string, dayId: number | string, orderedIds: number[]) =>
    apiClient
      .put(`/trips/${tripId}/days/${dayId}/assignments/reorder`, { orderedIds } satisfies AssignmentReorderRequest)
      .then((r) => r.data),
  move: (tripId: number | string, assignmentId: number, newDayId: number | string, orderIndex: number | null) =>
    apiClient
      .put(`/trips/${tripId}/assignments/${assignmentId}/move`, { new_day_id: newDayId, order_index: orderIndex })
      .then((r) => r.data),
  update: (tripId: number | string, dayId: number | string, id: number, data: Record<string, unknown>) =>
    apiClient.put(`/trips/${tripId}/days/${dayId}/assignments/${id}`, data).then((r) => r.data),
  getParticipants: (tripId: number | string, id: number) =>
    apiClient.get(`/trips/${tripId}/assignments/${id}/participants`).then((r) => r.data),
  setParticipants: (tripId: number | string, id: number, userIds: number[]) =>
    apiClient
      .put(`/trips/${tripId}/assignments/${id}/participants`, {
        user_ids: userIds,
      } satisfies AssignmentParticipantsRequest)
      .then((r) => r.data),
  updateTime: (tripId: number | string, id: number, times: AssignmentTimeRequest) =>
    apiClient.put(`/trips/${tripId}/assignments/${id}/time`, times).then((r) => r.data),
};

export const packingApi = {
  list: (tripId: number | string) => apiClient.get(`/trips/${tripId}/packing`).then((r) => r.data),
  create: (tripId: number | string, data: PackingCreateItemRequest) =>
    apiClient.post(`/trips/${tripId}/packing`, data).then((r) => r.data),
  bulkImport: (tripId: number | string, items: { name: string; category?: string; quantity?: number }[]) =>
    apiClient.post(`/trips/${tripId}/packing/import`, { items } satisfies PackingImportRequest).then((r) => r.data),
  update: (tripId: number | string, id: number, data: PackingUpdateItemRequest) =>
    apiClient.put(`/trips/${tripId}/packing/${id}`, data).then((r) => r.data),
  delete: (tripId: number | string, id: number) =>
    apiClient.delete(`/trips/${tripId}/packing/${id}`).then((r) => r.data),
  reorder: (tripId: number | string, orderedIds: number[]) =>
    apiClient
      .put(`/trips/${tripId}/packing/reorder`, { orderedIds } satisfies PackingReorderRequest)
      .then((r) => r.data),
  setSharing: (tripId: number | string, id: number, data: PackingSetSharingRequest) =>
    apiClient.put(`/trips/${tripId}/packing/${id}/sharing`, data).then((r) => r.data),
  clone: (tripId: number | string, id: number) =>
    apiClient.post(`/trips/${tripId}/packing/${id}/clone`).then((r) => r.data),
  addContributor: (tripId: number | string, id: number) =>
    apiClient.post(`/trips/${tripId}/packing/${id}/contributors`).then((r) => r.data),
  removeContributor: (tripId: number | string, id: number, userId: number) =>
    apiClient.delete(`/trips/${tripId}/packing/${id}/contributors/${userId}`).then((r) => r.data),
  getCategoryAssignees: (tripId: number | string) =>
    apiClient.get(`/trips/${tripId}/packing/category-assignees`).then((r) => r.data),
  setCategoryAssignees: (tripId: number | string, categoryName: string, userIds: number[]) =>
    apiClient
      .put(`/trips/${tripId}/packing/category-assignees/${encodeURIComponent(categoryName)}`, {
        user_ids: userIds,
      } satisfies PackingCategoryAssigneesRequest)
      .then((r) => r.data),
  listTemplates: (tripId: number | string) => apiClient.get(`/trips/${tripId}/packing/templates`).then((r) => r.data),
  applyTemplate: (tripId: number | string, templateId: number, visibility: 'common' | 'personal' = 'common') =>
    apiClient
      .post(`/trips/${tripId}/packing/apply-template/${templateId}`, {
        visibility,
      } satisfies PackingApplyTemplateRequest)
      .then((r) => r.data),
  saveAsTemplate: (tripId: number | string, name: string) =>
    apiClient.post(`/trips/${tripId}/packing/save-as-template`, { name }).then((r) => r.data),
  setBagMembers: (tripId: number | string, bagId: number, userIds: number[]) =>
    apiClient
      .put(`/trips/${tripId}/packing/bags/${bagId}/members`, { user_ids: userIds } satisfies PackingBagMembersRequest)
      .then((r) => r.data),
  listBags: (tripId: number | string) => apiClient.get(`/trips/${tripId}/packing/bags`).then((r) => r.data),
  createBag: (tripId: number | string, data: PackingCreateBagRequest) =>
    apiClient.post(`/trips/${tripId}/packing/bags`, data).then((r) => r.data),
  updateBag: (tripId: number | string, bagId: number, data: PackingUpdateBagRequest) =>
    apiClient.put(`/trips/${tripId}/packing/bags/${bagId}`, data).then((r) => r.data),
  deleteBag: (tripId: number | string, bagId: number) =>
    apiClient.delete(`/trips/${tripId}/packing/bags/${bagId}`).then((r) => r.data),
};

export const todoApi = {
  list: (tripId: number | string) => apiClient.get(`/trips/${tripId}/todo`).then((r) => r.data),
  create: (tripId: number | string, data: TodoCreateItemRequest) =>
    apiClient.post(`/trips/${tripId}/todo`, data).then((r) => r.data),
  update: (tripId: number | string, id: number, data: TodoUpdateItemRequest) =>
    apiClient.put(`/trips/${tripId}/todo/${id}`, data).then((r) => r.data),
  delete: (tripId: number | string, id: number) => apiClient.delete(`/trips/${tripId}/todo/${id}`).then((r) => r.data),
  reorder: (tripId: number | string, orderedIds: number[]) =>
    apiClient.put(`/trips/${tripId}/todo/reorder`, { orderedIds } satisfies TodoReorderRequest).then((r) => r.data),
  getCategoryAssignees: (tripId: number | string) =>
    apiClient.get(`/trips/${tripId}/todo/category-assignees`).then((r) => r.data),
  setCategoryAssignees: (tripId: number | string, categoryName: string, userIds: number[]) =>
    apiClient
      .put(`/trips/${tripId}/todo/category-assignees/${encodeURIComponent(categoryName)}`, {
        user_ids: userIds,
      } satisfies TodoCategoryAssigneesRequest)
      .then((r) => r.data),
};

export const budgetApi = {
  list: (tripId: number | string) => apiClient.get(`/trips/${tripId}/budget`).then((r) => r.data),
  create: (tripId: number | string, data: BudgetCreateItemRequest) =>
    apiClient.post(`/trips/${tripId}/budget`, data).then((r) => r.data),
  update: (tripId: number | string, id: number, data: BudgetUpdateItemRequest) =>
    apiClient.put(`/trips/${tripId}/budget/${id}`, data).then((r) => r.data),
  delete: (tripId: number | string, id: number) =>
    apiClient.delete(`/trips/${tripId}/budget/${id}`).then((r) => r.data),
  setMembers: (tripId: number | string, id: number, userIds: number[]) =>
    apiClient
      .put(`/trips/${tripId}/budget/${id}/members`, { user_ids: userIds } satisfies BudgetUpdateMembersRequest)
      .then((r) => r.data),
  togglePaid: (tripId: number | string, id: number, userId: number, paid: boolean) =>
    apiClient
      .put(`/trips/${tripId}/budget/${id}/members/${userId}/paid`, { paid } satisfies BudgetToggleMemberPaidRequest)
      .then((r) => r.data),
  setPayers: (tripId: number | string, id: number, payers: { user_id: number; amount: number }[]) =>
    apiClient.put(`/trips/${tripId}/budget/${id}/payers`, { payers }).then((r) => r.data),
  perPersonSummary: (tripId: number | string) =>
    apiClient.get(`/trips/${tripId}/budget/summary/per-person`).then((r) => r.data),
  settlement: (tripId: number | string, base?: string) =>
    apiClient.get(`/trips/${tripId}/budget/settlement`, base ? { params: { base } } : undefined).then((r) => r.data),
  createSettlement: (
    tripId: number | string,
    data: { from_user_id: number; to_user_id: number; amount: number; currency?: string }
  ) => apiClient.post(`/trips/${tripId}/budget/settlements`, data).then((r) => r.data),
  updateSettlement: (
    tripId: number | string,
    settlementId: number,
    data: { from_user_id: number; to_user_id: number; amount: number; currency?: string }
  ) => apiClient.put(`/trips/${tripId}/budget/settlements/${settlementId}`, data).then((r) => r.data),
  deleteSettlement: (tripId: number | string, settlementId: number) =>
    apiClient.delete(`/trips/${tripId}/budget/settlements/${settlementId}`).then((r) => r.data),
  reorderItems: (tripId: number | string, orderedIds: number[]) =>
    apiClient.put(`/trips/${tripId}/budget/reorder/items`, { orderedIds }).then((r) => r.data),
  reorderCategories: (tripId: number | string, orderedCategories: string[]) =>
    apiClient
      .put(`/trips/${tripId}/budget/reorder/categories`, { orderedCategories } satisfies BudgetReorderCategoriesRequest)
      .then((r) => r.data),
};

export const filesApi = {
  list: (tripId: number | string, trash?: boolean) =>
    apiClient.get(`/trips/${tripId}/files`, { params: trash ? { trash: 'true' } : {} }).then((r) => r.data),
  upload: (tripId: number | string, formData: FormData, opts?: UploadOptions) =>
    postMultipart(`/trips/${tripId}/files`, formData, opts),
  update: (tripId: number | string, id: number, data: FileUpdateRequest) =>
    apiClient.put(`/trips/${tripId}/files/${id}`, data).then((r) => r.data),
  delete: (tripId: number | string, id: number) => apiClient.delete(`/trips/${tripId}/files/${id}`).then((r) => r.data),
  toggleStar: (tripId: number | string, id: number) =>
    apiClient.patch(`/trips/${tripId}/files/${id}/star`).then((r) => r.data),
  restore: (tripId: number | string, id: number) =>
    apiClient.post(`/trips/${tripId}/files/${id}/restore`).then((r) => r.data),
  permanentDelete: (tripId: number | string, id: number) =>
    apiClient.delete(`/trips/${tripId}/files/${id}/permanent`).then((r) => r.data),
  emptyTrash: (tripId: number | string) => apiClient.delete(`/trips/${tripId}/files/trash/empty`).then((r) => r.data),
  addLink: (tripId: number | string, fileId: number, data: FileLinkRequest) =>
    apiClient.post(`/trips/${tripId}/files/${fileId}/link`, data).then((r) => r.data),
  removeLink: (tripId: number | string, fileId: number, linkId: number) =>
    apiClient.delete(`/trips/${tripId}/files/${fileId}/link/${linkId}`).then((r) => r.data),
  getLinks: (tripId: number | string, fileId: number) =>
    apiClient.get(`/trips/${tripId}/files/${fileId}/links`).then((r) => r.data),
};

export const reservationsApi = {
  list: (tripId: number | string) => apiClient.get(`/trips/${tripId}/reservations`).then((r) => r.data),
  upcoming: () => apiClient.get('/reservations/upcoming').then((r) => r.data),
  create: (tripId: number | string, data: ReservationCreateRequest) =>
    apiClient.post(`/trips/${tripId}/reservations`, data).then((r) => r.data),
  update: (tripId: number | string, id: number, data: ReservationUpdateRequest) =>
    apiClient.put(`/trips/${tripId}/reservations/${id}`, data).then((r) => r.data),
  delete: (tripId: number | string, id: number) =>
    apiClient.delete(`/trips/${tripId}/reservations/${id}`).then((r) => r.data),
  updatePositions: (tripId: number | string, positions: { id: number; day_plan_position: number }[], dayId?: number) =>
    apiClient.put(`/trips/${tripId}/reservations/positions`, { positions, day_id: dayId }).then((r) => r.data),
  importBookingPreview: (
    tripId: number | string,
    files: File[],
    mode: BookingImportMode = 'no-ai'
  ): Promise<BookingImportPreviewResponse> => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    fd.append('mode', mode);
    // No client-side timeout: kitinerary + LLM extraction routinely exceeds the
    // global 8s default (a cold local model alone can take ~45s).
    return postMultipart(`/trips/${tripId}/reservations/import/booking`, fd);
  },
  importBookingConfirm: (
    tripId: number | string,
    items: BookingImportPreviewItem[]
  ): Promise<BookingImportConfirmResponse> =>
    apiClient.post(`/trips/${tripId}/reservations/import/booking/confirm`, { items }).then((r) => r.data),
  // Start a background parse: returns a job id at once; progress + result arrive
  // over the WebSocket (import:progress / import:done / import:error).
  importBookingAsync: (
    tripId: number | string,
    files: File[],
    mode: BookingImportMode = 'no-ai'
  ): Promise<{ jobId: string }> => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    fd.append('mode', mode);
    return postMultipart(`/trips/${tripId}/reservations/import/booking/async`, fd);
  },
  // Poll a background job — recovery path when a WebSocket push was missed.
  importJobStatus: (
    tripId: number | string,
    jobId: string
  ): Promise<{
    status: 'running' | 'done' | 'error';
    done: number;
    total: number;
    result?: BookingImportPreviewResponse;
    error?: string;
  }> => apiClient.get(`/trips/${tripId}/reservations/import/jobs/${jobId}`).then((r) => r.data),
};

export const accommodationsApi = {
  list: (tripId: number | string) => apiClient.get(`/trips/${tripId}/accommodations`).then((r) => r.data),
  create: (tripId: number | string, data: AccommodationCreateRequest) =>
    apiClient.post(`/trips/${tripId}/accommodations`, data).then((r) => r.data),
  update: (tripId: number | string, id: number, data: AccommodationUpdateRequest) =>
    apiClient.put(`/trips/${tripId}/accommodations/${id}`, data).then((r) => r.data),
  delete: (tripId: number | string, id: number) =>
    apiClient.delete(`/trips/${tripId}/accommodations/${id}`).then((r) => r.data),
};

export const dayNotesApi = {
  list: (tripId: number | string, dayId: number | string) =>
    apiClient.get(`/trips/${tripId}/days/${dayId}/notes`).then((r) => r.data),
  create: (tripId: number | string, dayId: number | string, data: DayNoteCreateRequest) =>
    apiClient.post(`/trips/${tripId}/days/${dayId}/notes`, data).then((r) => r.data),
  update: (tripId: number | string, dayId: number | string, id: number, data: DayNoteUpdateRequest) =>
    apiClient.put(`/trips/${tripId}/days/${dayId}/notes/${id}`, data).then((r) => r.data),
  delete: (tripId: number | string, dayId: number | string, id: number) =>
    apiClient.delete(`/trips/${tripId}/days/${dayId}/notes/${id}`).then((r) => r.data),
};
