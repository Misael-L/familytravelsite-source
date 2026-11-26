import { useCallback, useLayoutEffect, useState } from 'react';
import { useToast } from '../../components/shared/Toast';
import {
  deleteFamilyPlaceCategory,
  listFamilyPlaceCategories,
  upsertFamilyPlaceCategory,
  type FamilyPlaceCategory,
  type FamilyPlaceCategoryList,
} from '../../data/supabase/familyPlaceCategories';
import { useTranslation } from '../../i18n';
import { emptyPlaceCategoryForm, formFromCategory, type PlaceCategoryForm } from './familyPlaceCategoriesModel';
import { useFamilySettingsState } from './useFamilySettingsScope';

export function useFamilyPlaceCategories() {
  const toast = useToast();
  const { t } = useTranslation();
  const {
    scope,
    familyId,
    begin,
    beginRead,
    stored,
    setStored,
    loading,
    setLoading,
    error,
    setError,
    saving,
    setSaving,
  } = useFamilySettingsState<FamilyPlaceCategoryList>();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlaceCategoryForm>(emptyPlaceCategoryForm);
  const [pendingDeleteId, selectPendingDelete] = useState<string | null>(null);

  const cancelForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyPlaceCategoryForm());
  }, []);

  useLayoutEffect(() => {
    cancelForm();
    selectPendingDelete(null);
  }, [cancelForm, scope]);

  const reload = useCallback(async () => {
    const request = beginRead();
    if (!request) return;
    try {
      const snapshot = await listFamilyPlaceCategories(request.familyId);
      if (!request.current()) return;
      if (snapshot.familyId !== request.familyId) throw new Error(t('categories.toast.loadError'));
      setStored({ snapshot, scope: request.scope });
      setError(null);
    } catch (err) {
      if (!request.current()) return;
      setError(err instanceof Error ? err.message : t('categories.toast.loadError'));
      setStored(null);
    } finally {
      if (request.current()) setLoading(false);
    }
  }, [beginRead, setError, setLoading, setStored, t]);

  useLayoutEffect(() => {
    void reload();
  }, [reload, scope]);

  const beginManaging = useCallback(() => {
    const request = begin();
    if (!request || stored?.scope !== request.scope || !stored.snapshot.canManage) return null;
    return request;
  }, [begin, stored]);

  const startCreate = useCallback(() => {
    if (!beginManaging()) return;
    setEditingId(null);
    setForm(emptyPlaceCategoryForm());
    setShowForm(true);
  }, [beginManaging]);

  const startEdit = useCallback(
    (category: FamilyPlaceCategory) => {
      const request = beginManaging();
      if (!request || category.familyId !== request.familyId) return;
      setShowForm(false);
      setEditingId(category.id);
      setForm(formFromCategory(category));
    },
    [beginManaging]
  );

  const patchForm = useCallback(
    (patch: Partial<PlaceCategoryForm>) => {
      if (beginManaging()) setForm((prev) => ({ ...prev, ...patch }));
    },
    [beginManaging]
  );

  const setPendingDeleteId = useCallback(
    (id: string | null) => {
      if (beginManaging()) selectPendingDelete(id);
    },
    [beginManaging]
  );

  const updateList = useCallback(
    (scope: number, update: (categories: FamilyPlaceCategory[]) => FamilyPlaceCategory[]) => {
      setStored((prev) => {
        if (prev?.scope !== scope) return prev;
        return { ...prev, snapshot: { ...prev.snapshot, categories: update(prev.snapshot.categories) } };
      });
    },
    [setStored]
  );

  const saveCategory = useCallback(async () => {
    const request = beginManaging();
    if (!request || saving) return;
    const name = form.name.trim();
    if (!name) {
      toast.error(t('categories.toast.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const saved = await upsertFamilyPlaceCategory(request.familyId, editingId, {
        name,
        colorHex: form.color,
        iconKey: form.icon,
      });
      if (!request.current()) return;
      if (saved.familyId !== request.familyId || (editingId && saved.id !== editingId))
        throw new Error(t('categories.toast.saveError'));
      updateList(request.scope, (categories) => {
        const next = editingId ? categories.map((cat) => (cat.id === saved.id ? saved : cat)) : [...categories, saved];
        return next.sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
        );
      });
      cancelForm();
      toast.success(editingId ? t('categories.toast.updated') : t('categories.toast.created'));
    } catch (err) {
      if (request.current()) toast.error(err instanceof Error ? err.message : t('categories.toast.saveError'));
    } finally {
      if (request.current()) setSaving(false);
    }
  }, [beginManaging, cancelForm, editingId, form, saving, setSaving, t, toast, updateList]);

  const confirmDelete = useCallback(async () => {
    const request = beginManaging();
    if (!request || !pendingDeleteId || saving) return;
    const id = pendingDeleteId;
    setSaving(true);
    try {
      await deleteFamilyPlaceCategory(request.familyId, id);
      if (!request.current()) return;
      updateList(request.scope, (categories) => categories.filter((cat) => cat.id !== id));
      if (editingId === id) cancelForm();
      selectPendingDelete(null);
      toast.success(t('categories.toast.deleted'));
    } catch (err) {
      if (request.current()) toast.error(err instanceof Error ? err.message : t('categories.toast.deleteError'));
    } finally {
      if (request.current()) setSaving(false);
    }
  }, [beginManaging, cancelForm, editingId, pendingDeleteId, saving, setSaving, t, toast, updateList]);

  const categories = stored?.snapshot.categories ?? [];
  const canManage = stored?.snapshot.canManage ?? false;
  const pendingDelete = canManage ? (categories.find((cat) => cat.id === pendingDeleteId) ?? null) : null;

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
  };
}
