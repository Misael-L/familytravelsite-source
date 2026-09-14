import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import {
  deleteFamilyPackingTemplate,
  listFamilyPackingTemplates,
  upsertFamilyPackingTemplate,
  type FamilyPackingTemplateDocument,
} from '../../data/supabase/familyPackingTemplates'
import {
  documentToDraft,
  flattenDraft,
  isDraftDirty,
  newClientKey,
  type TemplateDraft,
} from './familyPackingTemplatesModel'

function cloneDraft(draft: TemplateDraft): TemplateDraft {
  return {
    id: draft.id,
    name: draft.name,
    groups: draft.groups.map(group => ({
      ...group,
      items: group.items.map(item => ({ ...item })),
    })),
  }
}

export function useFamilyPackingTemplates() {
  const familyId = useAuthStore(s => s.familyId)
  const toast = useToast()
  const { t } = useTranslation()
  const [templates, setTemplates] = useState<FamilyPackingTemplateDocument[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, TemplateDraft>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!familyId) {
      setTemplates([])
      setCanManage(false)
      setDrafts({})
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    try {
      const result = await listFamilyPackingTemplates(familyId)
      setTemplates(result.templates)
      setCanManage(result.canManage)
      setDrafts(prev => {
        const next: Record<string, TemplateDraft> = {}
        for (const tmpl of result.templates) {
          const existing = prev[tmpl.id]
          next[tmpl.id] = existing && isDraftDirty(existing, tmpl)
            ? existing
            : documentToDraft(tmpl)
        }
        return next
      })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.packingTemplates.loadError'))
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [familyId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  const updateDraft = useCallback((templateId: string, updater: (draft: TemplateDraft) => TemplateDraft) => {
    setDrafts(prev => {
      const current = prev[templateId]
      if (!current) return prev
      return { ...prev, [templateId]: updater(cloneDraft(current)) }
    })
  }, [])

  const createTemplate = useCallback(async () => {
    if (!familyId || !canManage) return
    const name = createName.trim()
    if (!name) return
    setSaving(true)
    try {
      const created = await upsertFamilyPackingTemplate(familyId, null, name, [])
      setTemplates(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setDrafts(prev => ({ ...prev, [created.id]: documentToDraft(created) }))
      setCreateName('')
      setShowCreate(false)
      setExpandedId(created.id)
      toast.success(t('admin.packingTemplates.created'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.packingTemplates.createError'))
    } finally {
      setSaving(false)
    }
  }, [canManage, createName, familyId, t, toast])

  const saveTemplate = useCallback(async (templateId: string) => {
    if (!familyId || !canManage) return
    const draft = drafts[templateId]
    if (!draft) return
    setSaving(true)
    try {
      const saved = await upsertFamilyPackingTemplate(
        familyId,
        templateId,
        draft.name,
        flattenDraft(draft),
      )
      setTemplates(prev => prev.map(tmpl => tmpl.id === saved.id ? saved : tmpl)
        .sort((a, b) => a.name.localeCompare(b.name)))
      setDrafts(prev => ({ ...prev, [saved.id]: documentToDraft(saved) }))
      toast.success(t('admin.packingTemplates.saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.packingTemplates.saveError'))
    } finally {
      setSaving(false)
    }
  }, [canManage, drafts, familyId, t, toast])

  const confirmDelete = useCallback(async () => {
    if (!familyId || !canManage || !pendingDeleteId) return
    const id = pendingDeleteId
    setSaving(true)
    try {
      await deleteFamilyPackingTemplate(familyId, id)
      setTemplates(prev => prev.filter(tmpl => tmpl.id !== id))
      setDrafts(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      if (expandedId === id) setExpandedId(null)
      setPendingDeleteId(null)
      toast.success(t('admin.packingTemplates.deleted'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.packingTemplates.deleteError'))
    } finally {
      setSaving(false)
    }
  }, [canManage, expandedId, familyId, pendingDeleteId, t, toast])

  const toggleExpand = useCallback((templateId: string) => {
    setExpandedId(prev => prev === templateId ? null : templateId)
  }, [])

  const setDraftName = useCallback((templateId: string, name: string) => {
    updateDraft(templateId, draft => ({ ...draft, name }))
  }, [updateDraft])

  const addGroup = useCallback((templateId: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    updateDraft(templateId, draft => {
      if (draft.groups.some(group => group.name.trim().toLowerCase() === trimmed.toLowerCase())) {
        return draft
      }
      return {
        ...draft,
        groups: [...draft.groups, { clientKey: newClientKey('cat'), name: trimmed, items: [] }],
      }
    })
  }, [updateDraft])

  const renameGroup = useCallback((templateId: string, groupKey: string, name: string) => {
    updateDraft(templateId, draft => ({
      ...draft,
      groups: draft.groups.map(group => group.clientKey === groupKey ? { ...group, name } : group),
    }))
  }, [updateDraft])

  const deleteGroup = useCallback((templateId: string, groupKey: string) => {
    updateDraft(templateId, draft => ({
      ...draft,
      groups: draft.groups.filter(group => group.clientKey !== groupKey),
    }))
  }, [updateDraft])

  const addItem = useCallback((templateId: string, groupKey: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    updateDraft(templateId, draft => ({
      ...draft,
      groups: draft.groups.map(group => group.clientKey !== groupKey ? group : {
        ...group,
        items: [...group.items, {
          clientKey: newClientKey('item'),
          id: null,
          name: trimmed,
          quantity: 1,
          weightGrams: null,
        }],
      }),
    }))
  }, [updateDraft])

  const updateItem = useCallback((
    templateId: string,
    groupKey: string,
    itemKey: string,
    patch: Partial<Pick<TemplateDraft['groups'][number]['items'][number], 'name' | 'quantity' | 'weightGrams'>>,
  ) => {
    updateDraft(templateId, draft => ({
      ...draft,
      groups: draft.groups.map(group => group.clientKey !== groupKey ? group : {
        ...group,
        items: group.items.map(item => item.clientKey !== itemKey ? item : { ...item, ...patch }),
      }),
    }))
  }, [updateDraft])

  const deleteItem = useCallback((templateId: string, groupKey: string, itemKey: string) => {
    updateDraft(templateId, draft => ({
      ...draft,
      groups: draft.groups.map(group => group.clientKey !== groupKey ? group : {
        ...group,
        items: group.items.filter(item => item.clientKey !== itemKey),
      }),
    }))
  }, [updateDraft])

  const dirtyIds = useMemo(() => {
    const ids = new Set<string>()
    for (const tmpl of templates) {
      const draft = drafts[tmpl.id]
      if (draft && isDraftDirty(draft, tmpl)) ids.add(tmpl.id)
    }
    return ids
  }, [drafts, templates])

  return {
    familyId,
    templates,
    drafts,
    canManage,
    loading,
    error,
    saving,
    expandedId,
    showCreate,
    createName,
    pendingDeleteId,
    dirtyIds,
    reload,
    setShowCreate,
    setCreateName,
    createTemplate,
    saveTemplate,
    toggleExpand,
    setDraftName,
    addGroup,
    renameGroup,
    deleteGroup,
    addItem,
    updateItem,
    deleteItem,
    setPendingDeleteId,
    confirmDelete,
  }
}
