import { Edit2, MapPin, Pipette, Plus, Trash2 } from 'lucide-react';
import React, { useRef } from 'react';
import { withHexAlpha } from '../../../colorMix';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { CATEGORY_ICON_MAP, getCategoryIcon, ICON_LABELS } from '../../components/shared/categoryIcons';
import { useTranslation } from '../../i18n';
import {
  isPresetPlaceCategoryColor,
  PLACE_CATEGORY_ICON_KEYS,
  PLACE_CATEGORY_PRESET_COLORS,
} from './familyPlaceCategoriesModel';
import { useFamilyPlaceCategories } from './useFamilyPlaceCategories';

export default function FamilyPlaceCategoryManager(): React.ReactElement {
  const { t } = useTranslation();
  const colorInputRef = useRef<HTMLInputElement>(null);
  const {
    categories,
    canManage,
    loading,
    error,
    saving,
    showForm,
    editingId,
    form,
    pendingDelete,
    reload,
    startCreate,
    startEdit,
    cancelForm,
    patchForm,
    saveCategory,
    setPendingDeleteId,
    confirmDelete,
  } = useFamilyPlaceCategories();

  const isPresetColor = isPresetPlaceCategoryColor(form.color);
  const PreviewIcon = getCategoryIcon(form.icon);

  const categoryForm = (
    <div className="space-y-3 rounded-xl border border-edge bg-surface-secondary p-4">
      <input
        type="text"
        value={form.name}
        onChange={(e) => patchForm({ name: e.target.value })}
        placeholder={t('categories.namePlaceholder')}
        className="w-full rounded-lg border border-edge bg-surface-input px-3 py-2 text-body text-content focus:outline-none focus:ring-2 focus:ring-accent"
        autoFocus
        disabled={!canManage || saving}
      />

      <div>
        <label className="mb-2 block text-caption font-medium text-content-muted">{t('categories.icon')}</label>
        <div className="max-h-48 overflow-y-auto">
          <div className="flex flex-wrap gap-1.5 px-1.5 py-1.5">
            {PLACE_CATEGORY_ICON_KEYS.map((name) => {
              const Icon = CATEGORY_ICON_MAP[name];
              const isSelected = form.icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  title={ICON_LABELS[name] || name}
                  onClick={() => patchForm({ icon: name })}
                  disabled={!canManage || saving}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all disabled:opacity-40 ${
                    isSelected ? 'ring-2 ring-accent ring-offset-1' : 'hover:bg-surface-hover'
                  }`}
                  style={{ background: isSelected ? `${withHexAlpha(form.color, '18')}` : undefined }}
                >
                  <Icon
                    size={17}
                    strokeWidth={1.8}
                    color={isSelected ? form.color : undefined}
                    className={isSelected ? undefined : 'text-content'}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-caption font-medium text-content-muted">{t('categories.color')}</label>
        <div className="flex flex-wrap items-center gap-2">
          {PLACE_CATEGORY_PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => patchForm({ color })}
              disabled={!canManage || saving}
              className={`h-7 w-7 rounded-full transition-transform hover:scale-110 disabled:opacity-40 ${
                form.color.toLowerCase() === color ? 'scale-110 ring-2 ring-edge-secondary ring-offset-2' : ''
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
          <input
            ref={colorInputRef}
            type="color"
            value={form.color}
            onChange={(e) => patchForm({ color: e.target.value })}
            className="sr-only"
            tabIndex={-1}
          />
          <button
            type="button"
            title={t('categories.customColor')}
            onClick={() => colorInputRef.current?.click()}
            disabled={!canManage || saving}
            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-transform hover:scale-110 disabled:opacity-40 ${
              !isPresetColor
                ? 'scale-110 border-transparent ring-2 ring-edge-secondary ring-offset-2'
                : 'border-dashed border-edge hover:border-edge-secondary'
            }`}
            style={!isPresetColor ? { backgroundColor: form.color } : undefined}
          >
            {isPresetColor && <Pipette className="h-3 w-3 text-content-muted" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-caption text-content-muted">{t('categories.preview')}:</span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-body font-medium"
          style={{ backgroundColor: `${withHexAlpha(form.color, '20')}`, color: form.color }}
        >
          <PreviewIcon size={14} strokeWidth={1.8} />
          {form.name || t('categories.defaultName')}
        </span>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={cancelForm}
          className="rounded-lg border border-edge px-3 py-1.5 text-body text-content-muted hover:bg-surface-hover"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => {
            void saveCategory();
          }}
          disabled={saving || !form.name.trim() || !canManage}
          className="rounded-lg bg-accent px-4 py-1.5 text-body font-medium text-accent-text hover:bg-accent-hover disabled:opacity-40"
        >
          {saving ? t('common.saving') : editingId ? t('categories.update') : t('categories.create')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-edge bg-surface-card">
      <div className="flex items-center justify-between gap-3 border-b border-edge p-5">
        <div className="flex items-center gap-3">
          <MapPin size={18} className="text-content-muted" />
          <div>
            <h2 className="font-semibold text-content">{t('categories.title')}</h2>
            <p className="mt-0.5 text-caption text-content-muted">{t('admin.placeCategories.subtitle')}</p>
          </div>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={startCreate}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-body text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            <Plus size={14} /> {t('categories.new')}
          </button>
        ) : (
          <span className="text-caption text-content-muted">{t('admin.placeCategories.readOnly')}</span>
        )}
      </div>

      {showForm && canManage && <div className="border-b border-edge p-5">{categoryForm}</div>}

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
      ) : categories.length === 0 && !showForm ? (
        <div className="p-8 text-center text-body text-content-muted">{t('categories.empty')}</div>
      ) : (
        <div className="space-y-2 p-5">
          {categories.map((cat) => {
            const Icon = getCategoryIcon(cat.iconKey);
            return (
              <div key={cat.id}>
                {editingId === cat.id ? (
                  <div className="mb-2">{categoryForm}</div>
                ) : (
                  <div className="group flex items-center gap-3 rounded-xl border border-edge-faint p-3 hover:border-edge">
                    <div
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${withHexAlpha(cat.colorHex, '20')}` }}
                    >
                      <Icon size={18} strokeWidth={1.8} color={cat.colorHex} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-body font-medium text-content">{cat.name}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-caption"
                          style={{ backgroundColor: `${withHexAlpha(cat.colorHex, '20')}`, color: cat.colorHex }}
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
                          className="rounded-lg p-1.5 text-content-muted hover:bg-surface-hover hover:text-content"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(cat.id)}
                          aria-label={t('admin.placeCategories.deleteCategory')}
                          className="rounded-lg p-1.5 text-content-muted hover:bg-surface-hover hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
        title={t('admin.placeCategories.deleteConfirmTitle')}
        message={t('admin.placeCategories.deleteConfirmBody', { name: pendingDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
      />
    </div>
  );
}
