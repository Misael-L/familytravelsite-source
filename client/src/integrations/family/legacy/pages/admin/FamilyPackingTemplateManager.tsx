import { Check, ChevronDown, ChevronRight, Edit2, FolderPlus, Luggage, Plus, Trash2, X } from 'lucide-react';
import React, { useLayoutEffect, useRef, useState } from 'react';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { useTranslation } from '../../i18n';
import { categoryCount, itemCount } from './familyPackingTemplatesModel';
import { useFamilyPackingTemplates } from './useFamilyPackingTemplates';

const iconBtn =
  'p-1.5 rounded-lg text-content-muted hover:text-content hover:bg-surface-hover transition-colors disabled:opacity-40';

export default function FamilyPackingTemplateManager(): React.ReactElement {
  const { t } = useTranslation();
  const {
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
  } = useFamilyPackingTemplates();

  const [addingCategoryFor, setAddingCategoryFor] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [addingItemGroup, setAddingItemGroup] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const addItemRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    setAddingCategoryFor(null);
    setNewCatName('');
    setAddingItemGroup(null);
    setNewItemName('');
    setEditingGroupKey(null);
    setEditGroupName('');
  }, [scope]);

  const pendingDelete = templates.find((tmpl) => tmpl.id === pendingDeleteId);

  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-surface-card">
      <div className="flex items-center justify-between gap-3 border-b border-edge p-5">
        <div className="flex items-center gap-3">
          <Luggage size={18} className="text-content-muted" />
          <div>
            <h2 className="font-semibold text-content">{t('admin.packingTemplates.title')}</h2>
            <p className="mt-0.5 text-caption text-content-muted">{t('admin.packingTemplates.subtitle')}</p>
          </div>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-body text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            <Plus size={14} /> {t('admin.packingTemplates.create')}
          </button>
        ) : (
          <span className="text-caption text-content-muted">{t('admin.packingTemplates.readOnly')}</span>
        )}
      </div>

      {showCreate && canManage && (
        <div className="flex items-center gap-2 border-b border-edge bg-surface-secondary px-5 py-3">
          <input
            autoFocus
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void createTemplate();
              if (e.key === 'Escape') {
                setShowCreate(false);
                setCreateName('');
              }
            }}
            placeholder={t('admin.packingTemplates.namePlaceholder')}
            className="flex-1 rounded-lg border border-edge bg-surface-input px-3 py-1.5 text-body text-content"
          />
          <button
            type="button"
            onClick={() => {
              void createTemplate();
            }}
            disabled={!createName.trim() || saving}
            className={`${iconBtn} text-content`}
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCreate(false);
              setCreateName('');
            }}
            className={iconBtn}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-edge border-t-content" />
        </div>
      ) : error ? (
        <div className="p-6 text-body text-danger">
          {error}
          <button
            type="button"
            className="ms-3 underline"
            onClick={() => {
              void reload();
            }}
          >
            {t('dashboard.retry')}
          </button>
        </div>
      ) : templates.length === 0 ? (
        <div className="p-8 text-center text-body text-content-muted">{t('admin.packingTemplates.empty')}</div>
      ) : (
        <div className="divide-y divide-edge-faint">
          {templates.map((tmpl) => {
            const draft = drafts[tmpl.id];
            const dirty = dirtyIds.has(tmpl.id);
            const groups = draft?.groups ?? [];
            const cats = draft ? categoryCount(draft) : 0;
            const items = draft ? itemCount(draft) : tmpl.items.length;
            return (
              <div key={tmpl.id}>
                <div className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-hover">
                  <button
                    type="button"
                    onClick={() => toggleExpand(tmpl.id)}
                    className="flex-shrink-0 cursor-pointer border-none bg-transparent p-0 text-content-muted"
                    aria-expanded={expandedId === tmpl.id}
                    aria-label={tmpl.name}
                  >
                    {expandedId === tmpl.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                  {canManage ? (
                    <input
                      value={draft?.name ?? tmpl.name}
                      onChange={(e) => setDraftName(tmpl.id, e.target.value)}
                      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-0.5 text-body font-medium text-content hover:border-edge focus:border-edge"
                    />
                  ) : (
                    <span className="flex-1 text-body font-medium text-content">{tmpl.name}</span>
                  )}
                  {dirty && (
                    <span className="rounded bg-warning-soft px-1.5 py-0.5 text-caption uppercase tracking-wider text-warning">
                      {t('admin.packingTemplates.unsaved')}
                    </span>
                  )}
                  <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-caption text-content-muted">
                    {cats} {t('admin.packingTemplates.categories')} · {items} {t('admin.packingTemplates.items')}
                  </span>
                  {canManage && (
                    <>
                      <button
                        type="button"
                        disabled={saving || !dirty}
                        onClick={() => {
                          void saveTemplate(tmpl.id);
                        }}
                        className="rounded-lg bg-accent px-2.5 py-1 text-caption text-accent-text disabled:opacity-40"
                      >
                        {t('admin.packingTemplates.save')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(tmpl.id)}
                        className={`${iconBtn} hover:text-danger`}
                        aria-label={t('admin.packingTemplates.deleteTemplate')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>

                {expandedId === tmpl.id && draft && (
                  <div className="ms-8 space-y-3 px-5 pb-4">
                    {groups.map((group) => (
                      <div key={group.clientKey} className="overflow-hidden rounded-lg border border-edge">
                        <div className="flex items-center gap-2 bg-surface-secondary px-4 py-2.5">
                          {editingGroupKey === group.clientKey && canManage ? (
                            <input
                              autoFocus
                              value={editGroupName}
                              onChange={(e) => setEditGroupName(e.target.value)}
                              onBlur={() => {
                                renameGroup(tmpl.id, group.clientKey, editGroupName);
                                setEditingGroupKey(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  renameGroup(tmpl.id, group.clientKey, editGroupName);
                                  setEditingGroupKey(null);
                                }
                                if (e.key === 'Escape') setEditingGroupKey(null);
                              }}
                              className="flex-1 rounded border border-edge bg-surface-input px-2 py-0.5 text-body font-semibold text-content"
                            />
                          ) : (
                            <span className="flex-1 text-caption font-bold uppercase tracking-wider text-content-secondary">
                              {group.name.trim() || t('admin.packingTemplates.uncategorized')}
                            </span>
                          )}
                          <span className="text-caption text-content-muted">{group.items.length}</span>
                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setAddingItemGroup(addingItemGroup === group.clientKey ? null : group.clientKey);
                                  setNewItemName('');
                                  setTimeout(() => addItemRef.current?.focus(), 30);
                                }}
                                className={iconBtn}
                                aria-label={t('admin.packingTemplates.addItem')}
                              >
                                <Plus size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingGroupKey(group.clientKey);
                                  setEditGroupName(group.name);
                                }}
                                className={iconBtn}
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteGroup(tmpl.id, group.clientKey)}
                                className={`${iconBtn} hover:text-danger`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                        {(group.items.length > 0 || addingItemGroup === group.clientKey) && (
                          <div className="divide-y divide-edge-faint">
                            {group.items.map((item) => (
                              <div key={item.clientKey} className="flex items-center gap-2 px-4 py-2">
                                {canManage ? (
                                  <>
                                    <input
                                      value={item.name}
                                      onChange={(e) =>
                                        updateItem(tmpl.id, group.clientKey, item.clientKey, { name: e.target.value })
                                      }
                                      className="min-w-0 flex-1 rounded-lg border border-edge bg-surface-input px-2 py-1 text-body text-content"
                                    />
                                    <input
                                      type="number"
                                      min={1}
                                      max={99}
                                      value={item.quantity}
                                      aria-label={t('admin.packingTemplates.quantity')}
                                      onChange={(e) =>
                                        updateItem(tmpl.id, group.clientKey, item.clientKey, {
                                          quantity: Number(e.target.value),
                                        })
                                      }
                                      className="w-14 rounded-lg border border-edge bg-surface-input px-1.5 py-1 text-body text-content"
                                    />
                                    <input
                                      type="number"
                                      min={0}
                                      max={100000}
                                      value={item.weightGrams ?? ''}
                                      placeholder="g"
                                      aria-label={t('admin.packingTemplates.weightGrams')}
                                      onChange={(e) =>
                                        updateItem(tmpl.id, group.clientKey, item.clientKey, {
                                          weightGrams: e.target.value === '' ? null : Number(e.target.value),
                                        })
                                      }
                                      className="w-20 rounded-lg border border-edge bg-surface-input px-1.5 py-1 text-body text-content"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => deleteItem(tmpl.id, group.clientKey, item.clientKey)}
                                      className={`${iconBtn} hover:text-danger`}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span className="flex-1 text-body text-content">{item.name}</span>
                                    <span className="text-caption text-content-muted">×{item.quantity}</span>
                                    {item.weightGrams != null && (
                                      <span className="text-caption text-content-muted">{item.weightGrams}g</span>
                                    )}
                                  </>
                                )}
                              </div>
                            ))}
                            {addingItemGroup === group.clientKey && canManage && (
                              <div className="flex items-center gap-2 px-4 py-2">
                                <input
                                  ref={addItemRef}
                                  value={newItemName}
                                  onChange={(e) => setNewItemName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newItemName.trim()) {
                                      addItem(tmpl.id, group.clientKey, newItemName);
                                      setNewItemName('');
                                    }
                                    if (e.key === 'Escape') {
                                      setAddingItemGroup(null);
                                      setNewItemName('');
                                    }
                                  }}
                                  placeholder={t('admin.packingTemplates.itemName')}
                                  className="flex-1 rounded-lg border border-edge bg-surface-input px-2 py-1 text-body text-content"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    addItem(tmpl.id, group.clientKey, newItemName);
                                    setNewItemName('');
                                  }}
                                  disabled={!newItemName.trim()}
                                  className="rounded-lg bg-accent p-1.5 text-accent-text disabled:opacity-40"
                                >
                                  <Plus size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAddingItemGroup(null);
                                    setNewItemName('');
                                  }}
                                  className={iconBtn}
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}

                    {canManage &&
                      (addingCategoryFor === tmpl.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={newCatName}
                            onChange={(e) => setNewCatName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                addGroup(tmpl.id, newCatName);
                                setNewCatName('');
                                setAddingCategoryFor(null);
                              }
                              if (e.key === 'Escape') {
                                setAddingCategoryFor(null);
                                setNewCatName('');
                              }
                            }}
                            placeholder={t('admin.packingTemplates.categoryName')}
                            className="flex-1 rounded-lg border border-edge bg-surface-input px-3 py-2 text-body text-content"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              addGroup(tmpl.id, newCatName);
                              setNewCatName('');
                              setAddingCategoryFor(null);
                            }}
                            className={iconBtn}
                          >
                            <Check size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAddingCategoryFor(null);
                              setNewCatName('');
                            }}
                            className={iconBtn}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingCategoryFor(tmpl.id);
                            setNewCatName('');
                          }}
                          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-edge px-3 py-2.5 text-body text-content-muted transition-colors hover:border-edge-secondary hover:text-content"
                        >
                          <FolderPlus size={14} /> {t('admin.packingTemplates.addCategory')}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={canManage && !!pendingDelete}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
        title={t('admin.packingTemplates.deleteConfirmTitle')}
        message={t('admin.packingTemplates.deleteConfirmBody', { name: pendingDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
      />
    </div>
  );
}
