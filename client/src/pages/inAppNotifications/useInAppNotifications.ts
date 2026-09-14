import { useEffect, useRef, useState } from 'react'
import { useInAppNotificationStore } from '../../store/inAppNotificationStore.ts'

/**
 * In-app notifications data hook — owns the store wiring, the unread-only
 * filter, the initial + filter-change fetches and the infinite-scroll observer.
 * InAppNotificationsPage is a pure wiring container. Behaviour is identical to
 * the previous in-component logic.
 */
export function useInAppNotifications() {
  const { notifications, unreadCount, total, isLoading, hasMore, fetchNotifications, markAllRead, deleteAll, inboxStale, setInboxPageActive } = useInAppNotificationStore()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const loaderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setInboxPageActive(true)
    return () => setInboxPageActive(false)
  }, [setInboxPageActive])

  useEffect(() => {
    fetchNotifications(true)
  }, [])

  // Reload when filter changes
  useEffect(() => {
    fetchNotifications(true)
  }, [unreadOnly])

  useEffect(() => {
    if (inboxStale && !isLoading) void fetchNotifications(true)
  }, [inboxStale, isLoading, fetchNotifications])

  // Infinite scroll
  useEffect(() => {
    if (!loaderRef.current) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !isLoading) {
        fetchNotifications(false)
      }
    }, { threshold: 0.1 })
    observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [hasMore, isLoading])

  const displayed = unreadOnly ? notifications.filter(n => !n.is_read) : notifications

  return {
    notifications, unreadCount, total, isLoading, hasMore,
    unreadOnly, setUnreadOnly, loaderRef, displayed,
    markAllRead, deleteAll,
  }
}
