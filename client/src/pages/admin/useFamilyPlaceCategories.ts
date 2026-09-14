import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../components/shared/Toast'
import { useTranslation } from '../../i18n'
import {
  deleteFamilyPlaceCategory,
  listFamilyPlaceCategories,
  upsertFamilyPlaceCategory,
  type FamilyPlaceCategory,
} from '../../data/supabase/familyPlaceCategories'
import {
  emptyPlaceCategoryForm,
  formFromCategory,
  type PlaceCategoryForm,
} from './familyPlaceCategoriesModel'

export function useFamilyPlaceCategories() {
  const familyId = useAuthStore(s => s.familyId)
  const toast = useToast()
  const { t } = useTranslation()
  const [categories, setCategories] = useState<FamilyPlaceCategory[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PlaceCategoryForm>(emptyPlaceCategoryForm)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!familyId) {
      setCategories([])
      setCanManage(false)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    try {
      const result = await listFamilyPlaceCategories(familyId)
      setCategories(result.categories)
      setCanManage(result.canManage)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('categories.toast.loadError'))
      setCategories([])
    } finally {
      setLoading(false)
    }
  }, [familyId, t])

  useEffect(() => {
    void reload()
  }, [reload])

  const startCreate = useCallback(() => {
    if (!canManage) return
    setEditingId(null)
    setForm(emptyPlaceCategoryForm())
    setShowForm(true)
  }, [canManage])

  const startEdit = useCallback((category: FamilyPlaceCategory) => {
    if (!canManage) return
    setShowForm(false)
    setEditingId(category.id)
    setForm(formFromCategory(category))
  }, [canManage])

  const cancelForm = useCallback(() => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyPlaceCategoryForm())
  }, [])

  const patchForm = useCallback((patch: Partial<PlaceCategoryForm>) => {
    setForm(prev => ({ ...prev, ...patch }))
  }, [])

  const saveCategory = useCallback(async () => {
    if (!familyId || !canManage) return
    const name = form.name.trim()
    if (!name) {
      toast.error(t('categories.toast.nameRequired'))
      return
    }
    setSaving(true)
    try {
      const saved = await upsertFamilyPlaceCategory(familyId, editingId, {
        name,
        colorHex: form.color,
        iconKey: form.icon,
      })
      setCategories(prev => {
        const next = editingId
          ? prev.map(cat => cat.id === saved.id ? saved : cat)
          : [...prev, saved]
        return next.slice().sort((a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
        )
      })
      cancelForm()
      toast.success(editingId ? t('categories.toast.updated') : t('categories.toast.created'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('categories.toast.saveError'))
    } finally {
      setSaving(false)
    }
  }, [canManage, cancelForm, editingId, familyId, form, t, toast])

  const confirmDelete = useCallback(async () => {
    if (!familyId || !canManage || !pendingDeleteId) return
    const id = pendingDeleteId
    setSaving(true)
    try {
      await deleteFamilyPlaceCategory(familyId, id)
      setCategories(prev => prev.filter(cat => cat.id !== id))
      if (editingId === id) cancelForm()
      setPendingDeleteId(null)
      toast.success(t('categories.toast.deleted'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('categories.toast.deleteError'))
    } finally {
      setSaving(false)
    }
  }, [canManage, cancelForm, editingId, familyId, pendingDeleteId, t, toast])

  const pendingDelete = categories.find(cat => cat.id === pendingDeleteId) ?? null

  return {
    familyId,
    categories,
    canManage,
    loading,
    error,
    saving,
    showForm,
    editingId,
    form,
    pendingDeleteId,
    pendingDelete,
    reload,
    startCreate,
    startEdit,
    cancelForm,
    patchForm,
    saveCategory,
    setPendingDeleteId,
    confirmDelete,
  }
}
