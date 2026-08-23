import ReactDOM from 'react-dom'
import { useState, useEffect } from 'react'
import { UserPlus, Check, Loader2, Clock, X } from 'lucide-react'
import { useVacayChrome } from '../../pages/vacay/vacaySession'
import { useAuthStore } from '../../store/authStore'
import { useTranslation } from '../../i18n'
import { getApiErrorMessage } from '../../types'
import { useToast } from '../shared/Toast'
import CustomSelect from '../shared/CustomSelect'
import apiClient from '../../api/client'

const PRESET_COLORS = [
  '#6366f1', '#ec4899', '#14b8a6', '#8b5cf6', '#ef4444',
  '#3b82f6', '#22c55e', '#06b6d4', '#f43f5e', '#a855f7',
  '#10b981', '#0ea5e9', '#64748b', '#be185d', '#0d9488',
]

export default function VacayPersons() {
  const { t } = useTranslation()
  const toast = useToast()
  const {
    familyChrome, users, pendingInvites, invite, cancelInvite, updateColor,
    selectedUserId, setSelectedUserId, isFused, currentPersonId, canReview,
    overlayMode, overlayPresets, overlayPeople, pendingOutgoing,
    toggleOverlayPreset, addOverlayPerson, removeOverlayPerson,
    requestCalendarAccess, revokeCalendarAccess, loadOverlayPickerOptions,
  } = useVacayChrome()
  const { user: currentUser } = useAuthStore()

  // Default selectedUserId to current user (Nest numeric id). Family plane sets personId in useVacay.
  useEffect(() => {
    if (familyChrome) return
    if (!selectedUserId && currentUser) setSelectedUserId(currentUser.id)
  }, [currentUser, selectedUserId, familyChrome, setSelectedUserId])
  const [showInvite, setShowInvite] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorEditUserId, setColorEditUserId] = useState<string | number | null>(null)
  const [availableUsers, setAvailableUsers] = useState<{ id: number; username: string; email: string }[]>([])
  const [pickerOptions, setPickerOptions] = useState<{ value: string; label: string }[]>([])
  const [selectedInviteUser, setSelectedInviteUser] = useState<string | number | null>(null)
  const [inviting, setInviting] = useState(false)

  const youUser = familyChrome
    ? users.find(u => String(u.id) === String(currentPersonId))
    : null

  const loadAvailable = async () => {
    if (familyChrome) {
      try {
        setPickerOptions(await loadOverlayPickerOptions())
      } catch { /* */ }
      return
    }
    try {
      const data = await apiClient.get('/addons/vacay/available-users').then(r => r.data)
      setAvailableUsers(data.users)
    } catch { /* */ }
  }

  const handleInvite = async () => {
    if (!selectedInviteUser) return
    setInviting(true)
    try {
      if (familyChrome) {
        const raw = String(selectedInviteUser)
        if (overlayMode === 'request') {
          if (raw.startsWith('branch:')) {
            await requestCalendarAccess({ branchId: raw.slice(7) })
          } else {
            const personId = raw.startsWith('person:') ? raw.slice(7) : raw
            await requestCalendarAccess({ personId })
          }
          toast.success(t('vacay.requestSent'))
        } else {
          await addOverlayPerson(raw)
        }
        setShowInvite(false)
        setSelectedInviteUser(null)
        return
      }
      await invite(selectedInviteUser as number)
      toast.success(t('vacay.inviteSent'))
      setShowInvite(false)
      setSelectedInviteUser(null)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, familyChrome
        ? (overlayMode === 'request' ? t('vacay.requestError') : t('vacay.overlayAddError'))
        : t('vacay.inviteError')))
    } finally {
      setInviting(false)
    }
  }

  const handleColorChange = async (color) => {
    await updateColor(color, colorEditUserId)
    setShowColorPicker(false)
    setColorEditUserId(null)
  }

  const editingUserColor = (
    users.find(u => u.id === colorEditUserId)
    || overlayPeople.find(u => u.id === colorEditUserId)
  )?.color || '#6366f1'

  const modalTitle = !familyChrome
    ? t('vacay.inviteUser')
    : overlayMode === 'request'
      ? t('vacay.requestAccess')
      : t('vacay.addIndividual')
  const modalHint = !familyChrome
    ? t('vacay.inviteHint')
    : overlayMode === 'request'
      ? t('vacay.requestAccessHint')
      : t('vacay.addIndividualHint')
  const modalEmpty = familyChrome ? t('vacay.noPeopleToAdd') : t('vacay.noUsersAvailable')
  const modalPlaceholder = familyChrome ? t('vacay.selectPersonOrGroup') : t('vacay.selectUser')
  const modalConfirm = !familyChrome
    ? t('vacay.sendInvite')
    : overlayMode === 'request'
      ? t('vacay.requestAccess')
      : t('vacay.add')
  const familyPicker = familyChrome ? pickerOptions : availableUsers.map(u => ({
    value: u.id,
    label: `${u.username} (${u.email})`,
  }))

  return (
    <div className="rounded-xl border p-3 bg-surface-card border-edge">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-content-faint">{t('vacay.persons')}</span>
        <button onClick={() => { setShowInvite(true); void loadAvailable() }}
          className="p-0.5 rounded transition-colors text-content-faint">
          <UserPlus size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        {familyChrome && !youUser && users.length === 0 && (
          <p className="text-[11px] text-center py-3 text-content-faint">{t('vacay.emptyRoster')}</p>
        )}

        {familyChrome && youUser && (
          <PersonRow
            username={youUser.username}
            color={youUser.color}
            isYou
            isSelected={String(selectedUserId) === String(youUser.id)}
            canEditColor
            youLabel={t('vacay.you')}
            changeColorLabel={t('vacay.changeColor')}
            onSelect={() => setSelectedUserId(youUser.id)}
            onEditColor={() => { setColorEditUserId(youUser.id); setShowColorPicker(true) }}
          />
        )}

        {familyChrome && overlayPresets.map(preset => (
          <div key={preset.id}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-transparent">
            <button
              type="button"
              role="switch"
              aria-checked={preset.enabled}
              aria-label={preset.name}
              onClick={() => { void toggleOverlayPreset(preset.id, !preset.enabled) }}
              className={`w-3.5 h-3.5 rounded-sm shrink-0 border ${preset.enabled ? 'bg-content border-content' : 'bg-transparent border-edge'}`}
            />
            <span className="text-xs font-medium flex-1 truncate text-content">{preset.name}</span>
          </div>
        ))}

        {familyChrome && overlayPeople.map(u => {
          const isSelected = String(selectedUserId) === String(u.id)
          const canEditColor = canReview
          return (
            <div key={u.id}
              onClick={() => setSelectedUserId(u.id)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg group transition-all border ${isSelected ? 'bg-surface-hover border-edge' : 'bg-transparent border-transparent'}`}
              style={{ cursor: 'pointer' }}>
              {canEditColor ? (
                <button
                  onClick={(e) => { e.stopPropagation(); setColorEditUserId(u.id); setShowColorPicker(true) }}
                  className="w-3.5 h-3.5 rounded-full shrink-0 transition-transform hover:scale-125"
                  style={{ backgroundColor: u.color, cursor: 'pointer' }}
                  title={t('vacay.changeColor')}
                />
              ) : (
                <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: u.color }} />
              )}
              <span className="text-xs font-medium flex-1 truncate text-content">{u.username}</span>
              {isSelected && <Check size={12} className="text-content" />}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); void removeOverlayPerson(String(u.id)) }}
                className="opacity-0 group-hover:opacity-100 text-content-faint"
                aria-label={t('common.cancel')}
              >
                <X size={12} />
              </button>
            </div>
          )
        })}

        {familyChrome && pendingOutgoing.map(req => (
          <div key={req.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg group bg-surface-secondary"
            style={{ opacity: 0.7 }}>
            <Clock size={12} className="text-content-faint" />
            <span className="text-xs flex-1 truncate text-content-muted">
              {req.targetName} <span className="text-[10px]">({t('vacay.pending')})</span>
            </span>
            <button onClick={() => { void revokeCalendarAccess(req.id) }}
              className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded transition-all text-content-faint">
              {t('common.cancel')}
            </button>
          </div>
        ))}

        {!familyChrome && users.map(u => {
          const isSelected = selectedUserId === u.id
          const isYou = u.id === currentUser?.id
          return (
            <div key={u.id}
              onClick={() => { if (isFused) setSelectedUserId(u.id) }}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg group transition-all border ${isSelected ? 'bg-surface-hover border-edge' : 'bg-transparent border-transparent'}`}
              style={{ cursor: isFused ? 'pointer' : 'default' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setColorEditUserId(u.id); setShowColorPicker(true) }}
                className="w-3.5 h-3.5 rounded-full shrink-0 transition-transform hover:scale-125"
                style={{ backgroundColor: u.color, cursor: 'pointer' }}
                title={t('vacay.changeColor')}
              />
              <span className="text-xs font-medium flex-1 truncate text-content">
                {u.username}
                {isYou && <span className="text-content-faint"> ({t('vacay.you')})</span>}
              </span>
              {isSelected && isFused && (
                <Check size={12} className="text-content" />
              )}
            </div>
          )
        })}

        {/* Pending invites — Nest fusion only */}
        {!familyChrome && pendingInvites.map(inv => (
          <div key={inv.user_id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg group bg-surface-secondary"
            style={{ opacity: 0.7 }}>
            <Clock size={12} className="text-content-faint" />
            <span className="text-xs flex-1 truncate text-content-muted">
              {inv.username} <span className="text-[10px]">({t('vacay.pending')})</span>
            </span>
            <button onClick={() => cancelInvite(inv.user_id as number)}
              className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded transition-all text-content-faint">
              {t('common.cancel')}
            </button>
          </div>
        ))}
      </div>

      {showInvite && ReactDOM.createPortal(
        <div className="fixed inset-0 flex items-center justify-center px-4 trek-backdrop-enter bg-[rgba(15,23,42,0.5)]" style={{ zIndex: 99990, paddingTop: 70 }}
          onClick={() => setShowInvite(false)}>
          <div className="trek-modal-enter rounded-2xl shadow-2xl w-full max-w-sm bg-surface-card"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-edge-secondary">
              <h2 className="text-base font-semibold text-content">{modalTitle}</h2>
              <button onClick={() => setShowInvite(false)} className="p-1.5 rounded-lg transition-colors text-content-faint">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-content-muted">{modalHint}</p>
              {familyPicker.length === 0 ? (
                <p className="text-xs text-center py-4 text-content-faint">{modalEmpty}</p>
              ) : (
                <CustomSelect
                  value={selectedInviteUser ?? ''}
                  onChange={setSelectedInviteUser}
                  options={familyPicker}
                  placeholder={modalPlaceholder}
                  searchable
                />
              )}
              <div className="flex gap-3 justify-end pt-2">
                <button onClick={() => setShowInvite(false)} className="px-4 py-2 text-sm rounded-lg text-content-muted border border-edge">
                  {t('common.cancel')}
                </button>
                <button onClick={handleInvite} disabled={!selectedInviteUser || inviting}
                  className="px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-40 bg-content text-surface-card">
                  {inviting && <Loader2 size={13} className="animate-spin" />}
                  {modalConfirm}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showColorPicker && ReactDOM.createPortal(
        <div className="fixed inset-0 flex items-center justify-center px-4 trek-backdrop-enter bg-[rgba(15,23,42,0.5)]" style={{ zIndex: 99990, paddingTop: 70 }}
          onClick={() => { setShowColorPicker(false); setColorEditUserId(null) }}>
          <div className="trek-modal-enter rounded-2xl shadow-2xl w-full max-w-xs bg-surface-card"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-edge-secondary">
              <h2 className="text-base font-semibold text-content">{t('vacay.changeColor')}</h2>
              <button onClick={() => { setShowColorPicker(false); setColorEditUserId(null) }} className="p-1.5 rounded-lg transition-colors text-content-faint">
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              <div className="flex flex-wrap gap-2 justify-center">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => handleColorChange(c)}
                    className={`w-8 h-8 rounded-full transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] ${editingUserColor === c ? 'ring-2 ring-offset-2 scale-110' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function PersonRow({
  username,
  color,
  isYou,
  isSelected,
  canEditColor,
  youLabel,
  changeColorLabel,
  onSelect,
  onEditColor,
}: {
  username: string
  color: string
  isYou: boolean
  isSelected: boolean
  canEditColor: boolean
  youLabel: string
  changeColorLabel: string
  onSelect: () => void
  onEditColor: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg group transition-all border ${isSelected ? 'bg-surface-hover border-edge' : 'bg-transparent border-transparent'}`}
      style={{ cursor: 'pointer' }}>
      {canEditColor ? (
        <button
          onClick={(e) => { e.stopPropagation(); onEditColor() }}
          className="w-3.5 h-3.5 rounded-full shrink-0 transition-transform hover:scale-125"
          style={{ backgroundColor: color, cursor: 'pointer' }}
          title={changeColorLabel}
        />
      ) : (
        <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      )}
      <span className="text-xs font-medium flex-1 truncate text-content">
        {username}
        {isYou && <span className="text-content-faint"> ({youLabel})</span>}
      </span>
      {isSelected && <Check size={12} className="text-content" />}
    </div>
  )
}
