import React, { useRef } from 'react'
import { Edit2, MapPin, Pipette, Plus, Trash2 } from 'lucide-react'
import ConfirmDialog from '../../components/shared/ConfirmDialog'
import { CATEGORY_ICON_MAP, ICON_LABELS, getCategoryIcon } from '../../components/shared/categoryIcons'
import { useTranslation } from '../../i18n'
import {
  isPresetPlaceCategoryColor,
  PLACE_CATEGORY_ICON_KEYS,
  PLACE_CATEGORY_PRESET_COLORS,
} from './familyPlaceCategoriesModel'
import { useFamilyPlaceCategories } from './useFamilyPlaceCategories'

export default function FamilyPlaceCategoryManager(): React.ReactElement {
  const { t } = useTranslation()
  const colorInputRef = useRef<HTMLInputElement>(null)
  const {
    categories, canManage, loading, error, saving,
    showForm, editingId, form, pendingDelete,
    reload, startCreate, startEdit, cancelForm, patchForm, saveCategory,
    setPendingDeleteId, confirmDelete,
  } = useFamilyPlaceCategories()

  const isPresetColor = isPresetPlaceCategoryColor(form.color)
  const PreviewIcon = getCategoryIcon(form.icon)

  const categoryForm = (
    <div className="bg-surface-secondary rounded-xl p-4 space-y-3 border border-edge">
      <input
        type="text"
        value={form.name}
        onChange={e => patchForm({ name: e.target.value })}
        placeholder={t('categories.namePlaceholder')}
        className="w-full border border-edge rounded-lg px-3 py-2 text-sm bg-surface-input text-content focus:outline-none focus:ring-2 focus:ring-accent"
        autoFocus
        disabled={!canManage || saving}
      />

      <div>
        <label className="block text-xs font-medium text-content-muted mb-2">{t('categories.icon')}</label>
        <div className="max-h-48 overflow-y-auto">
          <div className="flex flex-wrap gap-1.5 px-1.5 py-1.5">
            {PLACE_CATEGORY_ICON_KEYS.map(name => {
              const Icon = CATEGORY_ICON_MAP[name]
              const isSelected = form.icon === name
              return (
                <button
                  key={name}
                  type="button"
                  title={ICON_LABELS[name] || name}
                  onClick={() => patchForm({ icon: name })}
                  disabled={!canManage || saving}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg transition-all disabled:opacity-40 ${
                    isSelected
                      ? 'ring-2 ring-offset-1 ring-accent'
                      : 'hover:bg-surface-hover'
                  }`}
                  style={{ background: isSelected ? `${form.color}18` : undefined }}
                >
                  <Icon size={17} strokeWidth={1.8} color={isSelected ? form.color : undefined} className={isSelected ? undefined : 'text-content'} />
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-content-muted mb-1.5">{t('categories.color')}</label>
        <div className="flex items-center gap-2 flex-wrap">
          {PLACE_CATEGORY_PRESET_COLORS.map(color => (
            <button
              key={color}
              type="button"
              onClick={() => patchForm({ color })}
              disabled={!canManage || saving}
              className={`w-7 h-7 rounded-full transition-transform hover:scale-110 disabled:opacity-40 ${
                form.color.toLowerCase() === color ? 'ring-2 ring-offset-2 ring-edge-secondary scale-110' : ''
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
          <input
            ref={colorInputRef}
            type="color"
            value={form.color}
            onChange={e => patchForm({ color: e.target.value })}
            className="sr-only"
            tabIndex={-1}
          />
          <button
            type="button"
            title={t('categories.customColor')}
            onClick={() => colorInputRef.current?.click()}
            disabled={!canManage || saving}
            className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-transform hover:scale-110 disabled:opacity-40 ${
              !isPresetColor
                ? 'ring-2 ring-offset-2 ring-edge-secondary scale-110 border-transparent'
                : 'border-dashed border-edge hover:border-edge-secondary'
            }`}
            style={!isPresetColor ? { backgroundColor: form.color } : undefined}
          >
            {isPresetColor && <Pipette className="w-3 h-3 text-content-muted" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-content-muted">{t('categories.preview')}:</span>
        <span
          className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full font-medium"
          style={{ backgroundColor: `${form.color}20`, color: form.color }}
        >
          <PreviewIcon size={14} strokeWidth={1.8} />
          {form.name || t('categories.defaultName')}
        </span>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={cancelForm}
          className="px-3 py-1.5 text-sm text-content-muted border border-edge rounded-lg hover:bg-surface-hover"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => { void saveCategory() }}
          disabled={saving || !form.name.trim() || !canManage}
          className="px-4 py-1.5 text-sm rounded-lg bg-accent text-accent-text hover:bg-accent-hover disabled:opacity-40 font-medium"
        >
          {saving ? t('common.saving') : editingId ? t('categories.update') : t('categories.create')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="bg-surface-card rounded-xl border border-edge overflow-hidden">
      <div className="p-5 border-b border-edge flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MapPin size={18} className="text-content-muted" />
          <div>
            <h2 className="font-semibold text-content">{t('categories.title')}</h2>
            <p className="text-xs text-content-muted mt-0.5">{t('admin.placeCategories.subtitle')}</p>
          </div>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={startCreate}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-accent text-accent-text hover:bg-accent-hover transition-colors disabled:opacity-40"
          >
            <Plus size={14} /> {t('categories.new')}
          </button>
        ) : (
          <span className="text-xs text-content-muted">{t('admin.placeCategories.readOnly')}</span>
        )}
      </div>

      {showForm && canManage && (
        <div className="p-5 border-b border-edge">{categoryForm}</div>
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
      ) : categories.length === 0 && !showForm ? (
        <div className="p-8 text-center text-sm text-content-muted">{t('categories.empty')}</div>
      ) : (
        <div className="p-5 space-y-2">
          {categories.map(cat => {
            const Icon = getCategoryIcon(cat.iconKey)
            return (
              <div key={cat.id}>
                {editingId === cat.id ? (
                  <div className="mb-2">{categoryForm}</div>
                ) : (
                  <div className="flex items-center gap-3 p-3 border border-edge-faint rounded-xl hover:border-edge group">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${cat.colorHex}20` }}
                    >
                      <Icon size={18} strokeWidth={1.8} color={cat.colorHex} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-content text-sm">{cat.name}</span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${cat.colorHex}20`, color: cat.colorHex }}
                        >
                          {cat.colorHex}
                        </span>
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(cat)}
                          aria-label={t('admin.placeCategories.editCategory')}
                          className="p-1.5 text-content-muted hover:text-content hover:bg-surface-hover rounded-lg"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(cat.id)}
                          aria-label={t('admin.placeCategories.deleteCategory')}
                          className="p-1.5 text-content-muted hover:text-danger hover:bg-surface-hover rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => { void confirmDelete() }}
        title={t('admin.placeCategories.deleteConfirmTitle')}
        message={t('admin.placeCategories.deleteConfirmBody', { name: pendingDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
      />
    </div>
  )
}
