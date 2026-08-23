import React, { useState } from 'react'
import { PackageCheck, ListTodo, Upload, Plus, Trash2, FolderPlus } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useAuthStore } from '../../store/authStore'
import PackingListPanel from '../Packing/PackingListPanel'
import ApplyTemplateButton from '../Packing/ApplyTemplateButton'
import type { PackingEntityId, PackingListItem, PackingListOps } from '../Packing/packingListOps'
import TodoListPanel from './TodoListPanel'
import type { TodoListOps } from './todoListOps'
import type { TodoItem } from '../../types'

export type ListsContainerProps = {
  tripId: PackingEntityId
  packingItems: PackingListItem[]
  todoItems: TodoItem[]
  packingOps?: PackingListOps
  todoOps?: TodoListOps
  canMutate?: boolean
  canMutatePacking?: boolean
  canMutateTodos?: boolean
  canSaveTemplate?: boolean
  bagTrackingEnabled?: boolean
  currentUserId?: PackingEntityId | null
  enablePlugins?: boolean
}

export default function ListsContainer({
  tripId,
  packingItems,
  todoItems,
  packingOps,
  todoOps,
  canMutate,
  canMutatePacking,
  canMutateTodos,
  canSaveTemplate,
  bagTrackingEnabled,
  currentUserId,
  enablePlugins = true,
}: ListsContainerProps) {
  const [subTab, setSubTab] = useState<'packing' | 'todo'>(() => {
    return (sessionStorage.getItem(`trip-lists-subtab-${tripId}`) as 'packing' | 'todo') || 'packing'
  })
  const setSubTabPersist = (tab: 'packing' | 'todo') => { setSubTab(tab); sessionStorage.setItem(`trip-lists-subtab-${tripId}`, tab) }
  const [importPackingSignal, setImportPackingSignal] = useState(0)
  const [clearCheckedSignal, setClearCheckedSignal] = useState(0)
  const [saveTemplateSignal, setSaveTemplateSignal] = useState(0)
  const [addTodoSignal, setAddTodoSignal] = useState(0)
  const [packingView, setPackingView] = useState<'common' | 'personal'>('common')
  const { t } = useTranslation()
  const nestIsAdmin = useAuthStore(s => s.user?.role === 'admin')
  const canSave = canSaveTemplate !== undefined ? canSaveTemplate : nestIsAdmin
  const packingWrites = (canMutatePacking ?? canMutate) !== false
  const todoWrites = (canMutateTodos ?? canMutate) !== false

  const tabs = [
    { id: 'packing' as const, label: t('todo.subtab.packing'), icon: PackageCheck, count: packingItems.length },
    { id: 'todo' as const, label: t('todo.subtab.todo'), icon: ListTodo, count: todoItems.length },
  ]

  return (
    <div>
      <div style={{ padding: '24px 28px 0' }} className="max-md:!px-4 max-md:!pt-4">
        <div className="bg-surface-tertiary" style={{
          borderRadius: 18,
          padding: '14px 16px 14px 22px',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <h2 className="text-content" style={{ margin: 0, fontSize: 'calc(18px * var(--fs-scale-subtitle, 1))', fontWeight: 600, letterSpacing: '-0.01em', flexShrink: 0 }}>
            {t('trip.tabs.lists')}
          </h2>
          <div className="hidden md:block bg-edge-faint" style={{ width: 1, height: 22, flexShrink: 0 }} />
          <div style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            {tabs.map(tab => {
              const active = subTab === tab.id
              const Icon = tab.icon
              return (
                <button key={tab.id} onClick={() => setSubTabPersist(tab.id)}
                  className={active ? 'bg-surface-card text-content' : 'bg-transparent text-content-muted'}
                  style={{
                    appearance: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 99, fontSize: 'calc(13px * var(--fs-scale-body, 1))', whiteSpace: 'nowrap',
                    fontWeight: active ? 500 : 400,
                    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                    transition: 'background 180ms cubic-bezier(0.23,1,0.32,1), color 180ms cubic-bezier(0.23,1,0.32,1), box-shadow 180ms cubic-bezier(0.23,1,0.32,1)',
                  }}
                >
                  <Icon size={13} className={active ? 'text-content' : 'text-content-faint'} />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className={`text-content-faint ${active ? 'bg-surface-tertiary' : 'bg-[rgba(0,0,0,0.06)]'}`} style={{
                    fontSize: 'calc(10px * var(--fs-scale-caption, 1))', fontWeight: 600,
                    padding: '1px 6px', borderRadius: 99, minWidth: 16, textAlign: 'center',
                  }}>{tab.count}</span>
                </button>
              )
            })}
          </div>

          {subTab === 'packing' && packingWrites && (() => {
            const packingAbgehakt = packingItems.filter(i => i.checked).length
            const sharedBtnClass = 'inline-flex items-center gap-1.5 px-2.5 sm:px-[14px] py-[7px] sm:py-[9px] hover:opacity-[0.88]'
            const sharedBtnStyle: React.CSSProperties = {
              appearance: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              borderRadius: 10, fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500,
            }
            return (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 'auto', flexWrap: 'wrap' }}>
                {packingAbgehakt > 0 && (
                  <button onClick={() => setClearCheckedSignal(s => s + 1)}
                    className={`hidden sm:inline-flex items-center gap-1.5 px-[14px] py-[9px] hover:opacity-[0.88] bg-[rgba(239,68,68,0.14)] text-[#ef4444]`}
                    style={sharedBtnStyle}
                  >
                    <Trash2 size={14} strokeWidth={2.5} />
                    <span>{t('packing.clearChecked', { count: packingAbgehakt })}</span>
                  </button>
                )}
                <ApplyTemplateButton
                  tripId={tripId}
                  visibility={packingView}
                  className={`${sharedBtnClass} bg-accent text-accent-text`}
                  style={sharedBtnStyle}
                  ops={packingOps}
                />
                {canSave && packingItems.length > 0 && (
                  <button onClick={() => setSaveTemplateSignal(s => s + 1)}
                    className={`${sharedBtnClass} bg-accent text-accent-text`}
                    style={sharedBtnStyle}
                  >
                    <FolderPlus size={14} strokeWidth={2.5} />
                    <span className="hidden sm:inline">{t('packing.saveAsTemplate')}</span>
                  </button>
                )}
                <button onClick={() => setImportPackingSignal(s => s + 1)}
                  className={`${sharedBtnClass} bg-accent text-accent-text`}
                  style={sharedBtnStyle}
                >
                  <Upload size={14} strokeWidth={2.5} />
                  <span className="hidden sm:inline">{t('packing.import')}</span>
                </button>
              </div>
            )
          })()}
          {subTab === 'todo' && todoWrites && (
            <button onClick={() => setAddTodoSignal(s => s + 1)}
              className="hover:opacity-[0.88] bg-accent text-accent-text"
              style={{
                appearance: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '9px 14px', borderRadius: 10, fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 500,
                flexShrink: 0,
                marginLeft: 'auto',
              }}
            >
              <Plus size={14} strokeWidth={2.5} />
              <span className="hidden sm:inline">{t('todo.addItem')}</span>
            </button>
          )}
        </div>
      </div>
      <div style={{ padding: '16px 28px 0' }} className="max-md:!px-4">
        {subTab === 'packing' && (
          <PackingListPanel
            tripId={tripId}
            items={packingItems}
            openImportSignal={importPackingSignal}
            clearCheckedSignal={clearCheckedSignal}
            saveTemplateSignal={saveTemplateSignal}
            inlineHeader={false}
            view={packingView}
            onViewChange={setPackingView}
            ops={packingOps}
            canMutate={packingWrites}
            canSaveTemplate={canSaveTemplate}
            bagTrackingEnabled={bagTrackingEnabled}
            currentUserId={currentUserId ?? undefined}
            enablePlugins={enablePlugins}
          />
        )}
        {subTab === 'todo' && (
          <TodoListPanel
            tripId={tripId}
            items={todoItems}
            addItemSignal={addTodoSignal}
            ops={todoOps}
            canMutate={todoWrites}
            currentUserId={currentUserId}
            enablePlugins={enablePlugins}
          />
        )}
      </div>
    </div>
  )
}
