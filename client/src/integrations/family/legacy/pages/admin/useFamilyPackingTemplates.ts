import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../components/shared/Toast';
import {
  deleteFamilyPackingTemplate,
  listFamilyPackingTemplates,
  upsertFamilyPackingTemplate,
  type FamilyPackingTemplateDocument,
  type FamilyPackingTemplateList,
} from '../../data/supabase/familyPackingTemplates';
import { useTranslation } from '../../i18n';
import {
  documentToDraft,
  flattenDraft,
  isDraftDirty,
  newClientKey,
  type TemplateDraft,
} from './familyPackingTemplatesModel';
import { useFamilySettingsState } from './useFamilySettingsScope';

type PackingTemplateSnapshot = FamilyPackingTemplateList & { drafts: Record<string, TemplateDraft> };
const EMPTY_TEMPLATES: FamilyPackingTemplateDocument[] = [];
const EMPTY_DRAFTS: Record<string, TemplateDraft> = {};

function compareNames(a: FamilyPackingTemplateDocument, b: FamilyPackingTemplateDocument) {
  return a.name.localeCompare(b.name);
}

function cloneDraft(draft: TemplateDraft): TemplateDraft {
  return {
    id: draft.id,
    name: draft.name,
    groups: draft.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item })),
    })),
  };
}

export function useFamilyPackingTemplates() {
  const toast = useToast();
  const { t } = useTranslation();
  const {
    familyId,
    scope,
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
  } = useFamilySettingsState<PackingTemplateSnapshot>();
  const templates = stored?.snapshot.templates ?? EMPTY_TEMPLATES;
  const drafts = stored?.snapshot.drafts ?? EMPTY_DRAFTS;
  const canManage = stored?.snapshot.canManage ?? false;
  const mutationScope = useRef<number | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useLayoutEffect(() => {
    setExpandedId(null);
    setShowCreate(false);
    setCreateName('');
    setPendingDeleteId(null);
  }, [scope]);

  const reload = useCallback(async () => {
    const request = beginRead();
    if (!request) return;
    try {
      const result = await listFamilyPackingTemplates(request.familyId);
      if (!request.current()) return;
      if (result.familyId !== request.familyId) throw new Error(t('admin.packingTemplates.loadError'));
      setStored((prev) => {
        const existingDrafts = result.canManage && prev?.scope === request.scope ? prev.snapshot.drafts : EMPTY_DRAFTS;
        const nextDrafts: Record<string, TemplateDraft> = {};
        for (const template of result.templates) {
          const existing = existingDrafts[template.id];
          nextDrafts[template.id] = existing && isDraftDirty(existing, template) ? existing : documentToDraft(template);
        }
        return { scope: request.scope, snapshot: { ...result, drafts: nextDrafts } };
      });
      setError(null);
    } catch (err) {
      if (!request.current()) return;
      setStored(null);
      setError(err instanceof Error ? err.message : t('admin.packingTemplates.loadError'));
    } finally {
      if (request.current()) setLoading(false);
    }
  }, [beginRead, setError, setLoading, setStored, t]);

  useLayoutEffect(() => {
    void reload();
  }, [reload, scope]);

  const beginManaging = useCallback(() => {
    const request = begin();
    return request && stored?.scope === request.scope && canManage ? request : null;
  }, [begin, canManage, stored?.scope]);

  const updateSnapshot = useCallback(
    (requestScope: number, update: (snapshot: PackingTemplateSnapshot) => PackingTemplateSnapshot) => {
      setStored((prev) =>
        prev?.scope === requestScope ? { scope: requestScope, snapshot: update(prev.snapshot) } : prev
      );
    },
    [setStored]
  );

  const updateDraft = useCallback(
    (templateId: string, updater: (draft: TemplateDraft) => TemplateDraft) => {
      const request = beginManaging();
      if (!request) return;
      updateSnapshot(request.scope, (snapshot) => {
        const current = snapshot.drafts[templateId];
        if (!current) return snapshot;
        return { ...snapshot, drafts: { ...snapshot.drafts, [templateId]: updater(cloneDraft(current)) } };
      });
    },
    [beginManaging, updateSnapshot]
  );

  const mutate = useCallback(
    async (
      errorKey:
        | 'admin.packingTemplates.createError'
        | 'admin.packingTemplates.saveError'
        | 'admin.packingTemplates.deleteError',
      action: (request: NonNullable<ReturnType<typeof beginManaging>>) => Promise<void>
    ) => {
      const request = beginManaging();
      if (!request || mutationScope.current === request.scope) return;
      mutationScope.current = request.scope;
      setSaving(true);
      try {
        await action(request);
      } catch (err) {
        if (request.current()) toast.error(err instanceof Error ? err.message : t(errorKey));
      } finally {
        if (mutationScope.current === request.scope) mutationScope.current = null;
        if (request.current()) setSaving(false);
      }
    },
    [beginManaging, setSaving, t, toast]
  );

  const createTemplate = useCallback(async () => {
    const name = createName.trim();
    if (!name) return;
    await mutate('admin.packingTemplates.createError', async (request) => {
      const created = await upsertFamilyPackingTemplate(request.familyId, null, name, []);
      if (!request.current()) return;
      if (created.familyId !== request.familyId) throw new Error(t('admin.packingTemplates.createError'));
      updateSnapshot(request.scope, (snapshot) => ({
        ...snapshot,
        templates: [...snapshot.templates, created].sort(compareNames),
        drafts: { ...snapshot.drafts, [created.id]: documentToDraft(created) },
      }));
      setCreateName('');
      setShowCreate(false);
      setExpandedId(created.id);
      toast.success(t('admin.packingTemplates.created'));
    });
  }, [createName, mutate, t, toast, updateSnapshot]);

  const saveTemplate = useCallback(
    async (templateId: string) => {
      const draft = drafts[templateId];
      if (!draft) return;
      await mutate('admin.packingTemplates.saveError', async (request) => {
        const saved = await upsertFamilyPackingTemplate(request.familyId, templateId, draft.name, flattenDraft(draft));
        if (!request.current()) return;
        if (saved.familyId !== request.familyId || saved.id !== templateId) {
          throw new Error(t('admin.packingTemplates.saveError'));
        }
        updateSnapshot(request.scope, (snapshot) => ({
          ...snapshot,
          templates: snapshot.templates
            .map((template) => (template.id === saved.id ? saved : template))
            .sort(compareNames),
          drafts: { ...snapshot.drafts, [saved.id]: documentToDraft(saved) },
        }));
        toast.success(t('admin.packingTemplates.saved'));
      });
    },
    [drafts, mutate, t, toast, updateSnapshot]
  );

  const confirmDelete = useCallback(async () => {
    const id = pendingDeleteId;
    if (!id || !templates.some((template) => template.id === id)) return;
    await mutate('admin.packingTemplates.deleteError', async (request) => {
      await deleteFamilyPackingTemplate(request.familyId, id);
      if (!request.current()) return;
      updateSnapshot(request.scope, (snapshot) => {
        const nextDrafts = { ...snapshot.drafts };
        delete nextDrafts[id];
        return {
          ...snapshot,
          templates: snapshot.templates.filter((template) => template.id !== id),
          drafts: nextDrafts,
        };
      });
      setExpandedId((prev) => (prev === id ? null : prev));
      setPendingDeleteId((prev) => (prev === id ? null : prev));
      toast.success(t('admin.packingTemplates.deleted'));
    });
  }, [mutate, pendingDeleteId, t, templates, toast, updateSnapshot]);

  const toggleExpand = useCallback((templateId: string) => {
    setExpandedId((prev) => (prev === templateId ? null : templateId));
  }, []);

  const setDraftName = useCallback(
    (templateId: string, name: string) => {
      updateDraft(templateId, (draft) => ({ ...draft, name }));
    },
    [updateDraft]
  );

  const addGroup = useCallback(
    (templateId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      updateDraft(templateId, (draft) => {
        if (draft.groups.some((group) => group.name.trim().toLowerCase() === trimmed.toLowerCase())) {
          return draft;
        }
        return {
          ...draft,
          groups: [...draft.groups, { clientKey: newClientKey('cat'), name: trimmed, items: [] }],
        };
      });
    },
    [updateDraft]
  );

  const renameGroup = useCallback(
    (templateId: string, groupKey: string, name: string) => {
      updateDraft(templateId, (draft) => ({
        ...draft,
        groups: draft.groups.map((group) => (group.clientKey === groupKey ? { ...group, name } : group)),
      }));
    },
    [updateDraft]
  );

  const deleteGroup = useCallback(
    (templateId: string, groupKey: string) => {
      updateDraft(templateId, (draft) => ({
        ...draft,
        groups: draft.groups.filter((group) => group.clientKey !== groupKey),
      }));
    },
    [updateDraft]
  );

  const addItem = useCallback(
    (templateId: string, groupKey: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      updateDraft(templateId, (draft) => ({
        ...draft,
        groups: draft.groups.map((group) =>
          group.clientKey !== groupKey
            ? group
            : {
                ...group,
                items: [
                  ...group.items,
                  {
                    clientKey: newClientKey('item'),
                    id: null,
                    name: trimmed,
                    quantity: 1,
                    weightGrams: null,
                  },
                ],
              }
        ),
      }));
    },
    [updateDraft]
  );

  const updateItem = useCallback(
    (
      templateId: string,
      groupKey: string,
      itemKey: string,
      patch: Partial<Pick<TemplateDraft['groups'][number]['items'][number], 'name' | 'quantity' | 'weightGrams'>>
    ) => {
      updateDraft(templateId, (draft) => ({
        ...draft,
        groups: draft.groups.map((group) =>
          group.clientKey !== groupKey
            ? group
            : {
                ...group,
                items: group.items.map((item) => (item.clientKey !== itemKey ? item : { ...item, ...patch })),
              }
        ),
      }));
    },
    [updateDraft]
  );

  const deleteItem = useCallback(
    (templateId: string, groupKey: string, itemKey: string) => {
      updateDraft(templateId, (draft) => ({
        ...draft,
        groups: draft.groups.map((group) =>
          group.clientKey !== groupKey
            ? group
            : {
                ...group,
                items: group.items.filter((item) => item.clientKey !== itemKey),
              }
        ),
      }));
    },
    [updateDraft]
  );

  const dirtyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const tmpl of templates) {
      const draft = drafts[tmpl.id];
      if (draft && isDraftDirty(draft, tmpl)) ids.add(tmpl.id);
    }
    return ids;
  }, [drafts, templates]);

  return {
    familyId,
    scope,
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
  };
}
