import React, { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { avatarSrc } from '../../utils/avatarSrc'
import { useTripStore } from '../../store/tripStore'
import { useSettingsStore } from '../../store/settingsStore'
import { useTranslation } from '../../i18n'
import { MapPin, Sparkles } from 'lucide-react'
import { fs } from '../shared/DialogShell'
import CollabPanelHead from './CollabPanelHead'
import EmptyState from '../shared/EmptyState'
import { localToday } from '../Planner/today'
import { useTripStays } from '../Planner/useTripStays'
import { upcomingStops, type WhatsNextMember } from './whatsNextVisits'

function formatTime(timeStr, is12h) {
  if (!timeStr) return ''
  const [h, m] = timeStr.split(':').map(Number)
  if (is12h) {
    const period = h >= 12 ? 'PM' : 'AM'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}:${String(m).padStart(2, '0')} ${period}`
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatDayLabel(date, t, locale, now: Date) {
  // Day dates are plain calendar strings, so "today"/"tomorrow" have to be
  // compared against the local calendar day, not the UTC one.
  const nowDate = localToday(now)
  const tomorrowDate = localToday(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))

  if (date === nowDate) return t('collab.whatsNext.today') || 'Today'
  if (date === tomorrowDate) return t('collab.whatsNext.tomorrow') || 'Tomorrow'

  return new Date(date + 'T00:00:00Z').toLocaleDateString(locale || undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

function useUpcomingClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    function update() {
      clearTimeout(timer)
      if (document.visibilityState === 'hidden') return
      const current = new Date()
      setNow(current)
      timer = setTimeout(update, 60000 - current.getTime() % 60000)
    }
    update()
    document.addEventListener('visibilitychange', update)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])
  return now
}

interface WhatsNextWidgetProps {
  tripId?: number
  tripMembers?: WhatsNextMember[]
}

export default function WhatsNextWidget({ tripId, tripMembers = [] }: WhatsNextWidgetProps) {
  const { days, assignments, loadedTripId } = useTripStore(useShallow(s => ({
    days: s.days, assignments: s.assignments, loadedTripId: s.trip?.id ?? 0,
  })))
  const { t, locale } = useTranslation()
  const title = t('collab.whatsNext.title') || "What's Next"
  const is12h = useSettingsStore(s => s.settings.time_format) === '12h'
  const now = useUpcomingClock()
  const belongsToTrip = tripId === undefined || tripId === loadedTripId
  const { tripAccommodations, loadAccommodations } = useTripStays(belongsToTrip ? loadedTripId : 0)
  useEffect(() => { loadAccommodations() }, [loadAccommodations])

  const upcoming = useMemo(() => belongsToTrip
    ? upcomingStops({ days, assignments, stays: tripAccommodations, members: tripMembers, now })
    : [], [belongsToTrip, days, assignments, tripAccommodations, tripMembers, now])

  return (
    <section aria-label={title} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <CollabPanelHead icon={Sparkles} title={title} count={upcoming.length} />

      {/* List: one card per stop, grouped under its day like the planner's days */}
      <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {upcoming.length === 0 ? (
          <EmptyState scene="guide" title={t('collab.whatsNext.empty')} />
        ) : (
          <div className="flex flex-col gap-1.5">
            {upcoming.map((item, idx) => {
              const prevItem = upcoming[idx - 1]
              const showDayHeader = !prevItem || prevItem.date !== item.date

              return (
                <React.Fragment key={item.id}>
                  {showDayHeader && (
                    <div className={`flex min-w-0 items-center gap-2 px-1 pb-0.5 ${idx === 0 ? '' : 'pt-2.5'}`}>
                      <span className="flex-none font-geist font-bold uppercase tracking-[.08em] text-content-faint" style={fs(9.5)}>
                        {formatDayLabel(item.date, t, locale, now)}
                      </span>
                      {item.dayTitle && <span className="truncate font-semibold text-content-muted" style={fs(11)}>{item.dayTitle}</span>}
                    </div>
                  )}

                  <div className="flex gap-3 rounded-[14px] border border-edge-faint bg-surface-card px-3 py-2.5 transition-shadow hover:shadow-md">
                    {/* Time column */}
                    <div className="flex min-w-[44px] flex-none flex-col items-center justify-center font-geist tabular-nums">
                      <span className="whitespace-nowrap font-bold leading-none text-content" style={fs(12, 'body')}>
                        {item.time ? formatTime(item.time, is12h) : 'TBD'}
                      </span>
                      {item.endTime && (
                        <>
                          <span className="my-[3px] font-bold uppercase tracking-[.06em] text-content-faint" style={fs(7.5)}>
                            {t('collab.whatsNext.until') || 'bis'}
                          </span>
                          <span className="whitespace-nowrap font-bold leading-none text-content" style={fs(12, 'body')}>
                            {formatTime(item.endTime, is12h)}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="my-0.5 w-px flex-none self-stretch bg-edge-faint" />

                    {/* Details */}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold leading-snug text-content" style={fs(13, 'body')}>
                        {item.name}
                      </div>
                      {item.address && (
                        <div className="mt-0.5 flex items-center gap-1">
                          <MapPin size={10} className="flex-none text-content-faint" />
                          <span className="truncate text-content-faint" style={fs(10.5)}>{item.address}</span>
                        </div>
                      )}

                      {/* Participants */}
                      {item.participants.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {item.participants.map(p => (
                            <span key={p.user_id} className="flex items-center gap-1 rounded-full border border-edge-faint bg-surface-secondary py-[2px] ps-[2px] pe-2">
                              <span className="grid h-4 w-4 flex-none place-items-center overflow-hidden rounded-full bg-surface-tertiary font-bold text-content-muted" style={fs(7)}>
                                {p.avatar
                                  ? <img src={avatarSrc(p.avatar) ?? undefined} alt="" className="h-full w-full object-cover" />
                                  : p.username?.[0]?.toUpperCase()
                                }
                              </span>
                              <span className="font-semibold text-content-muted" style={fs(10.5)}>{p.username}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
