import React, { useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Edit2,
  FolderPlus,
  Luggage,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import { useTranslation } from '../../i18n'
import { categoryCount, itemCount } from './familyPackingTemplatesModel'
import { useFamilyPackingTemplates } from './useFamilyPackingTemplates'

const iconBtn =
  'p-1.5 rounded-lg text-content-muted hover:text-content hover:bg-surface-hover transition-colors disabled:opacity-40'

export default function FamilyPackingTemplateManager(): React.ReactElement {
  const { t } = useTranslation()
  const {
    templates, drafts, canManage, loading, error, saving,
    expandedId, showCreate, createName, pendingDeleteId, dirtyIds,
    reload, setShowCreate, setCreateName, createTemplate, saveTemplate,
    toggleExpand, setDraftName, addGroup, renameGroup, deleteGroup,
    addItem, updateItem, deleteItem, setPendingDeleteId, confirmDelete,
  } = useFamilyPackingTemplates()

  const [addingCategoryFor, setAddingCategoryFor] = useState<string | null>(null)
  const [newCatName, setNewCatName] = useState('')
  const [addingItemGroup, setAddingItemGroup] = useState<string | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null)
  const [editGroupName, setEditGroupName] = useState('')
  const addItemRef = useRef<HTMLInputElement>(null)

  const pendingDelete = templates.find(tmpl => tmpl.id === pendingDeleteId)

  return (
    <div className="bg-surface-card rounded-xl border border-edge overflow-hidden">
      <div className="p-5 border-b border-edge flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Luggage size={18} className="text-content-muted" />
          <div>
            <h2 className="font-semibold text-content">{t('admin.packingTemplates.title')}</h2>
            <p className="text-xs text-content-muted mt-0.5">{t('admin.packingTemplates.subtitle')}</p>
          </div>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-accent text-accent-text hover:bg-accent-hover transition-colors disabled:opacity-40"
          >
            <Plus size={14} /> {t('admin.packingTemplates.create')}
          </button>
        ) : (
          <span className="text-xs text-content-muted">{t('admin.packingTemplates.readOnly')}</span>
        )}
      </div>

      {showCreate && canManage && (
        <div className="px-5 py-3 border-b border-edge flex items-center gap-2 bg-surface-secondary">
          <input
            autoFocus
            value={createName}
            onChange={e => setCreateName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void createTemplate()
              if (e.key === 'Escape') { setShowCreate(false); setCreateName('') }
            }}
            placeholder={t('admin.packingTemplates.namePlaceholder')}
            className="flex-1 px-3 py-1.5 border border-edge rounded-lg text-sm bg-surface-input text-content"
          />
          <button
            type="button"
            onClick={() => { void createTemplate() }}
            disabled={!createName.trim() || saving}
            className={`${iconBtn} text-content`}
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            onClick={() => { setShowCreate(false); setCreateName('') }}
            className={iconBtn}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center">
          <div className="w-8 h-8 border-2 border-edge border-t-content rounded-full animate-spin mx-auto" />
        </div>
      ) : error ? (
        <div className="p-6 text-sm text-danger">
          {error}
          <button type="button" className="ml-3 underline" onClick={() => { void reload() }}>
            {t('dashboard.retry')}
          </button>
        </div>
      ) : templates.length === 0 ? (
        <div className="p-8 text-center text-sm text-content-muted">{t('admin.packingTemplates.empty')}</div>
      ) : (
        <div className="divide-y divide-edge-faint">
          {templates.map(tmpl => {
            const draft = drafts[tmpl.id]
            const dirty = dirtyIds.has(tmpl.id)
            const groups = draft?.groups ?? []
            const cats = draft ? categoryCount(draft) : 0
            const items = draft ? itemCount(draft) : tmpl.items.length
            return (
              <div key={tmpl.id}>
                <div className="px-5 py-3 flex items-center gap-3 hover:bg-surface-hover transition-colors">
                  <button
                    type="button"
                    onClick={() => toggleExpand(tmpl.id)}
                    className="text-content-muted flex-shrink-0 p-0 bg-transparent border-none cursor-pointer"
                    aria-expanded={expandedId === tmpl.id}
                    aria-label={tmpl.name}
                  >
                    {expandedId === tmpl.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                  {canManage ? (
                    <input
                      value={draft?.name ?? tmpl.name}
                      onChange={e => setDraftName(tmpl.id, e.target.value)}
                      className="flex-1 min-w-0 px-2 py-0.5 border border-transparent hover:border-edge focus:border-edge rounded text-sm bg-transparent text-content font-medium"
                    />
                  ) : (
                    <span className="flex-1 text-sm font-medium text-content">{tmpl.name}</span>
                  )}
                  {dirty && (
                    <span className="text-[10px] uppercase tracking-wider text-warning bg-warning-soft px-1.5 py-0.5 rounded">
                      {t('admin.packingTemplates.unsaved')}
                    </span>
                  )}
                  <span className="text-xs text-content-muted px-2 py-0.5 bg-surface-secondary rounded-full">
                    {cats} {t('admin.packingTemplates.categories')} · {items} {t('admin.packingTemplates.items')}
                  </span>
                  {canManage && (
                    <>
                      <button
                        type="button"
                        disabled={saving || !dirty}
                        onClick={() => { void saveTemplate(tmpl.id) }}
                        className="px-2.5 py-1 text-xs rounded-lg bg-accent text-accent-text disabled:opacity-40"
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
                  <div className="px-5 pb-4 ml-8 space-y-3">
                    {groups.map(group => (
                      <div key={group.clientKey} className="border border-edge rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-secondary">
                          {editingGroupKey === group.clientKey && canManage ? (
                            <input
                              autoFocus
                              value={editGroupName}
                              onChange={e => setEditGroupName(e.target.value)}
                              onBlur={() => {
                                renameGroup(tmpl.id, group.clientKey, editGroupName)
                                setEditingGroupKey(null)
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  renameGroup(tmpl.id, group.clientKey, editGroupName)
                                  setEditingGroupKey(null)
                                }
                                if (e.key === 'Escape') setEditingGroupKey(null)
                              }}
                              className="flex-1 px-2 py-0.5 border border-edge rounded text-sm font-semibold bg-surface-input text-content"
                            />
                          ) : (
                            <span className="flex-1 text-xs font-bold text-content-secondary uppercase tracking-wider">
                              {group.name.trim() || t('admin.packingTemplates.uncategorized')}
                            </span>
                          )}
                          <span className="text-xs text-content-muted">{group.items.length}</span>
                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setAddingItemGroup(addingItemGroup === group.clientKey ? null : group.clientKey)
                                  setNewItemName('')
                                  setTimeout(() => addItemRef.current?.focus(), 30)
                                }}
                                className={iconBtn}
                                aria-label={t('admin.packingTemplates.addItem')}
                              >
                                <Plus size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingGroupKey(group.clientKey)
                                  setEditGroupName(group.name)
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
                            {group.items.map(item => (
                              <div key={item.clientKey} className="flex items-center gap-2 px-4 py-2">
                                {canManage ? (
                                  <>
                                    <input
                                      value={item.name}
                                      onChange={e => updateItem(tmpl.id, group.clientKey, item.clientKey, { name: e.target.value })}
                                      className="flex-1 min-w-0 px-2 py-1 border border-edge rounded-lg text-sm bg-surface-input text-content"
                                    />
                                    <input
                                      type="number"
                                      min={1}
                                      max={99}
                                      value={item.quantity}
                                      aria-label={t('admin.packingTemplates.quantity')}
                                      onChange={e => updateItem(tmpl.id, group.clientKey, item.clientKey, {
                                        quantity: Number(e.target.value),
                                      })}
                                      className="w-14 px-1.5 py-1 border border-edge rounded-lg text-sm bg-surface-input text-content"
                                    />
                                    <input
                                      type="number"
                                      min={0}
                                      max={100000}
                                      value={item.weightGrams ?? ''}
                                      placeholder="g"
                                      aria-label={t('admin.packingTemplates.weightGrams')}
                                      onChange={e => updateItem(tmpl.id, group.clientKey, item.clientKey, {
                                        weightGrams: e.target.value === '' ? null : Number(e.target.value),
                                      })}
                                      className="w-20 px-1.5 py-1 border border-edge rounded-lg text-sm bg-surface-input text-content"
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
                                    <span className="flex-1 text-sm text-content">{item.name}</span>
                                    <span className="text-xs text-content-muted">×{item.quantity}</span>
                                    {item.weightGrams != null && (
                                      <span className="text-xs text-content-muted">{item.weightGrams}g</span>
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
                                  onChange={e => setNewItemName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && newItemName.trim()) {
                                      addItem(tmpl.id, group.clientKey, newItemName)
                                      setNewItemName('')
                                    }
                                    if (e.key === 'Escape') {
                                      setAddingItemGroup(null)
                                      setNewItemName('')
                                    }
                                  }}
                                  placeholder={t('admin.packingTemplates.itemName')}
                                  className="flex-1 px-2 py-1 border border-edge rounded-lg text-sm bg-surface-input text-content"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    addItem(tmpl.id, group.clientKey, newItemName)
                                    setNewItemName('')
                                  }}
                                  disabled={!newItemName.trim()}
                                  className="p-1.5 rounded-lg bg-accent text-accent-text disabled:opacity-40"
                                >
                                  <Plus size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setAddingItemGroup(null); setNewItemName('') }}
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

                    {canManage && (
                      addingCategoryFor === tmpl.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={newCatName}
                            onChange={e => setNewCatName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                addGroup(tmpl.id, newCatName)
                                setNewCatName('')
                                setAddingCategoryFor(null)
                              }
                              if (e.key === 'Escape') {
                                setAddingCategoryFor(null)
                                setNewCatName('')
                              }
                            }}
                            placeholder={t('admin.packingTemplates.categoryName')}
                            className="flex-1 px-3 py-2 border border-edge rounded-lg text-sm bg-surface-input text-content"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              addGroup(tmpl.id, newCatName)
                              setNewCatName('')
                              setAddingCategoryFor(null)
                            }}
                            className={iconBtn}
                          >
                            <Check size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => { setAddingCategoryFor(null); setNewCatName('') }}
                            className={iconBtn}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setAddingCategoryFor(tmpl.id); setNewCatName('') }}
                          className="flex items-center gap-2 px-3 py-2.5 w-full text-sm text-content-muted hover:text-content border border-dashed border-edge rounded-lg hover:border-edge-secondary transition-colors"
                        >
                          <FolderPlus size={14} /> {t('admin.packingTemplates.addCategory')}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!pendingDeleteId}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => { void confirmDelete() }}
        title={t('admin.packingTemplates.deleteConfirmTitle')}
        message={t('admin.packingTemplates.deleteConfirmBody', { name: pendingDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
      />
    </div>
  )
}
