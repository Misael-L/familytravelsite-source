import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, ChevronUp, ImagePlus, Loader2, Reply, Trash2 } from 'lucide-react'
import MDancingTrek from '../../../components/MDancingTrek'
import { edgeFadeClass, useEdgeFade } from '../../../components/useEdgeFade'
import CollabAssistantBadge from '../../../../components/Collab/CollabAssistantBadge'
import { useCollabChatData } from '../../../../components/Collab/useCollabChatData'
import { usePreviewChatImage } from '../../../../components/Collab/usePreviewChatImage'
import { PreviewChatRefresh } from '../../../../components/Collab/PreviewChatRefresh'
import { CollabRecovery } from '../../../../components/Collab/CollabRecovery'
import { useAuthStore } from '../../../../store/authStore'
import { useKeyboardInset } from '../../../../hooks/useKeyboardInset'
import MImageViewer from '../../../components/MImageViewer'
import { useTranslation } from '../../../../i18n'
import type { TripPlanner } from '../MTripShell'
import { pressHaptic } from '../../../../native/haptics'
import {
  OTHER_BUBBLE_RADIUS,
  OWN_BUBBLE_RADIUS,
  QUICK_REACTIONS,
  formatChatClockTime,
  formatChatDateSeparator,
  isEmojiOnlyText,
  isFromAssistant,
  isSameSender,
  shouldShowChatDateSeparator,
  type ChatMessage,
  type ChatAttachment,
} from '../../../../components/Collab/collabModel'

const LONG_PRESS_MS = 500
const DOUBLE_TAP_MS = 300
const MOVE_CANCEL_PX = 10
const POPOVER_WIDTH = 224
// Emoji grid + reply row, plus the delete row when it is shown — used to keep
// the popover inside the viewport.
const POPOVER_HEIGHT = 150
const POPOVER_DELETE_ROW = 37
const POPOVER_MARGIN = 8

interface MCollabChatProps {
  planner: TripPlanner
  previewChat?: boolean
  chatVisible?: boolean
}

/**
 * Trip-tab Collab / Chat. Messages, the WebSocket listener and the draft come
 * from useCollabChatData, the hook the desktop panel's useCollabChat.ts reads
 * too (10-tab-databindings.md §8.2: chat never touches `planner.tripActions`);
 * this tab keeps its long-press popover.
 *
 * Layout deviates from the other tabs on purpose (spec 03 §6.1): its own
 * flex-column, not TabScroller, so the composer can sit flush above the dock.
 */
export default function MCollabChat({ planner, previewChat = false, chatVisible = true }: MCollabChatProps) {
  const { t, tripId, toast } = planner
  const { locale } = useTranslation()
  const { user } = useAuthStore()
  const canEdit = !previewChat && planner.can('collab_edit', planner.trip)
  const is12h = planner.settings.time_format === '12h'
  const currentUserId = user?.id ?? null

  const {
    messages, loading, loadFailed, previewCanSend, refresh, recovery, hasMore, loadingMore, text, replyTo, setReplyTo, sending, images,
    scrollRef, textareaRef, isAtBottom, scrollToBottom, checkAtBottom, handleLoadMore, handleTextChange, addImageFiles, removeImageFile, handleSend,
    deleteMessage, reactToMessage,
  } = useCollabChatData({ tripId, t, toast, toastLoadMoreErrors: true, canSend: canEdit, previewChat, chatVisible })
  const canSend = previewChat ? !loading && previewCanSend : canEdit
  const canReact = previewChat ? canSend : canEdit
  const canReply = previewChat && canSend && !sending
  const showReadOnly = !previewChat || (!loading && !loadFailed)
  // The trip shell is a fixed layer the app's keyboard does not shrink, so the
  // composer is lifted by the keyboard itself; reading the latest message, the
  // list follows it up.
  const keyboard = useKeyboardInset()
  useEffect(() => {
    if (keyboard > 0 && isAtBottom.current) scrollToBottom()
  }, [keyboard, isAtBottom, scrollToBottom])
  const [popover, setPopover] = useState<{ msg: ChatMessage; x: number; y: number } | null>(null)
  const popoverMessage = popover && messages.find(row => row.id === popover.msg.id && !row._deleted)
  const [list, setList] = useState<HTMLDivElement | null>(null)
  const listFade = useEdgeFade(list, 'y')
  const imageInputRef = useRef<HTMLInputElement>(null)

  const handleDelete = useCallback(async (msgId: number) => {
    setPopover(null)
    await deleteMessage(msgId)
  }, [deleteMessage])

  const handleReact = useCallback(async (msgId: number, emoji: string) => {
    setPopover(null)
    await reactToMessage(msgId, emoji)
  }, [reactToMessage])

  const openReply = (msg: ChatMessage) => {
    setPopover(null)
    setReplyTo(msg)
    textareaRef.current?.focus()
  }

  return (
    <div
      className="flex h-full flex-col px-4 pb-[var(--bottom-nav-h,84px)] pt-[calc(var(--m-safe-top,12px)+58px)] wide:mx-auto wide:w-full wide:max-w-[808px] wide:px-6 wide:pb-[calc(var(--bottom-nav-h,0px)+12px)]"
      style={keyboard > 0 ? { paddingBottom: keyboard + 8 } : undefined}
    >
      {previewChat && !loading && <PreviewChatRefresh failed={loadFailed} busy={sending || loadingMore} onRefresh={refresh}
        onOpenTrash={recovery.enabled ? recovery.openTrash : undefined} />}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 size={22} strokeWidth={2} className="animate-spin text-m-faint" />
        </div>
      ) : loadFailed ? <div className="flex-1" /> : messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 py-10 text-center">
          <MDancingTrek scene="chat" className="mb-2" />
          <p className="font-geist text-[0.8125rem] font-medium text-m-muted">{t('collab.chat.empty')}</p>
        </div>
      ) : (
        // The list ends under the floating controls, and a message scrolled past that
        // edge fades out there instead of being cut through a line of its text or
        // left as a sliver of a bubble under the controls.
        <div
          ref={el => { scrollRef.current = el; setList(el) }}
          data-chat-scroll
          onScroll={checkAtBottom}
          className={`mt-3 min-h-0 flex-1 overflow-y-auto [--m-fade-reach-y:32px] ${edgeFadeClass(listFade, 'y')}`}
        >
          {hasMore && (
            <div className="flex justify-center pb-[10px]">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-1 rounded-full border border-[color:var(--m-rowbr)] bg-[color:var(--m-ic)] px-[14px] py-[5px] font-geist text-[0.6875rem] font-bold text-m-muted"
              >
                {loadingMore ? <Loader2 size={13} strokeWidth={2.2} className="animate-spin" /> : <ChevronUp size={13} strokeWidth={2.2} />}
                {t('collab.chat.loadMore')}
              </button>
            </div>
          )}

          {messages.map((msg, idx) => {
            const prevMsg = messages[idx - 1]
            const nextMsg = messages[idx + 1]
            const isNewGroup = !isSameSender(msg, prevMsg) || shouldShowChatDateSeparator(msg, prevMsg)
            const isLastInGroup = !nextMsg || !isSameSender(msg, nextMsg) || shouldShowChatDateSeparator(nextMsg, msg)
            const own = msg.viewer_owned ?? (currentUserId != null && String(msg.user_id) === String(currentUserId))

            return (
              <div key={msg.id}>
                {shouldShowChatDateSeparator(msg, prevMsg) && (
                  <div className="flex justify-center pb-[6px] pt-[14px]">
                    <span className="rounded-full bg-[color:var(--m-ic)] px-3 py-1 font-geist text-[0.625rem] font-bold uppercase tracking-[.03em] text-m-faint">
                      {formatChatDateSeparator(msg.created_at, t, locale)}
                    </span>
                  </div>
                )}
                {msg._deleted ? (
                  <div className="flex justify-center py-1">
                    <span className="font-geist text-[0.6875rem] italic text-m-faint">
                      {msg.username} {t('collab.chat.deletedMessage')} · {formatChatClockTime(msg.created_at, is12h)}
                    </span>
                  </div>
                ) : (
                  <ChatBubbleRow
                    msg={msg}
                    own={own}
                    showHeader={!own && isNewGroup}
                    isLastInGroup={isLastInGroup}
                    marginTop={isNewGroup ? 10 : 2}
                    is12h={is12h}
                    canReact={canReact}
                    previewChat={previewChat}
                    t={t}
                    onOpenActions={(x, y) => setPopover({ msg, x, y })}
                    onReactBadgeTap={emoji => canReact && handleReact(msg.id, emoji)}
                    onReply={canReply ? () => openReply(msg) : undefined}
                    onTrash={recovery.enabled && own ? () => recovery.requestTrash(msg) : undefined}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-[10px] flex flex-none flex-col gap-2">
        {replyTo && (!previewChat || canSend) && (
          <div className="flex items-center gap-2 rounded-[12px] border-s-[3px] border-m-act bg-[color:var(--m-ic)] px-[10px] py-[6px]">
            <Reply size={12} strokeWidth={2} className="flex-none text-m-faint" />
            <span className="min-w-0 flex-1 truncate font-geist text-[0.71875rem] text-m-muted">
              {previewChat && replyTo._deleted ? 'Original message moved to Trash.' :
                <><strong className="text-m-ink">{replyTo.username}</strong>: {(replyTo.text || replyTo.attachments?.[0]?.original_name || '').slice(0, 60)}</>}
            </span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              disabled={previewChat && sending}
              aria-label={previewChat ? 'Cancel reply' : t('common.close')}
              className="flex-none font-geist text-[0.75rem] font-bold text-m-faint"
            >
              ×
            </button>
          </div>
        )}

        {canSend ? (
          <>
            {images.previews.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {images.previews.map((url, i) => (
                  <div key={url} className="relative">
                    <img src={url} alt="" className="h-14 w-14 rounded-lg object-cover" />
                    <button type="button" aria-label={t('places.removeImage')} disabled={previewChat && sending} onClick={() => removeImageFile(i)} className="absolute -end-1 -top-1 h-4 w-4 rounded-full bg-m-ink text-[10px] text-m-bg">×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
            <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple hidden onChange={e => { if (e.target.files) addImageFiles(e.target.files); e.currentTarget.value = '' }} />
              <button type="button" aria-label={t('collab.chat.attachImages')} disabled={previewChat && sending} onClick={() => imageInputRef.current?.click()} className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full text-m-muted">
                <ImagePlus size={18} strokeWidth={2.2} />
              </button>
            <textarea
              ref={textareaRef}
              dir="auto"
              rows={1}
              value={text}
              readOnly={previewChat && sending}
              onChange={handleTextChange}
              onPaste={e => { if (e.clipboardData.files.length) addImageFiles(e.clipboardData.files) }}
              placeholder={t('collab.chat.placeholder')}
              maxLength={5000}
              className="max-h-[100px] min-w-0 flex-1 resize-none rounded-full border border-[color:var(--m-rowbr)] bg-[color:var(--m-ic)] px-[14px] py-[11px] font-[inherit] text-[0.8125rem] text-m-ink outline-none placeholder:text-m-faint"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={(!text.trim() && !images.files.length) || sending || Boolean(previewChat && replyTo?._deleted)}
              aria-label={t('collab.chat.send')}
              className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full bg-m-act text-m-actfg disabled:opacity-40"
            >
              <ArrowUp size={17} strokeWidth={2.4} />
            </button>
          </div>
          </>
        ) : showReadOnly && (
          <div className="rounded-full border border-[color:var(--m-rowbr)] bg-[color:var(--m-ic)] px-[14px] py-[11px] text-center font-geist text-[0.75rem] text-m-faint">
            {t('collab.chat.readOnly')}
          </div>
        )}
      </div>

      {previewChat && <CollabRecovery board="chat" {...recovery.dialog} />}
      {popover && (!previewChat || (canReact && popoverMessage)) && (
        <MessageActionsPopover
          x={popover.x}
          y={popover.y}
          canDeleteOwn={canEdit && currentUserId != null && String(popover.msg.user_id) === String(currentUserId)}
          t={t}
          onReact={emoji => handleReact(popover.msg.id, emoji)}
          onReply={() => openReply(popoverMessage || popover.msg)}
          onDelete={() => handleDelete(popover.msg.id)}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function ChatBubbleRow({ msg, own, showHeader, isLastInGroup, marginTop, is12h, canReact, previewChat, t, onOpenActions, onReactBadgeTap, onReply, onTrash }: {
  msg: ChatMessage
  own: boolean
  showHeader: boolean
  isLastInGroup: boolean
  marginTop: number
  is12h: boolean
  canReact: boolean
  previewChat: boolean
  t: TripPlanner['t']
  onOpenActions: (x: number, y: number) => void
  onReactBadgeTap: (emoji: string) => void
  onReply?: () => void
  onTrash?: () => void
}) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const firedRef = useRef(false)
  const startRef = useRef({ x: 0, y: 0 })
  const lastTapRef = useRef(0)

  const clearPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!canReact) return
    firedRef.current = false
    startRef.current = { x: e.clientX, y: e.clientY }
    pressTimer.current = setTimeout(() => {
      firedRef.current = true
      pressHaptic()
      if (!previewChat) onOpenActions(e.clientX, e.clientY)
    }, LONG_PRESS_MS)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pressTimer.current) return
    const dx = e.clientX - startRef.current.x
    const dy = e.clientY - startRef.current.y
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) clearPress()
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (!canReact) return
    const wasLongPress = firedRef.current
    clearPress()
    if (previewChat || wasLongPress) return
    const now = Date.now()
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0
      onOpenActions(e.clientX, e.clientY)
    } else {
      lastTapRef.current = now
    }
  }
  const onPreviewBubbleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!canReact) return
    if (event.detail === 0) {
      const rect = event.currentTarget.getBoundingClientRect()
      onOpenActions(rect.left + rect.width / 2, rect.top)
      return
    }
    const now = Date.now()
    const open = firedRef.current || now - lastTapRef.current < DOUBLE_TAP_MS
    lastTapRef.current = open ? 0 : now
    if (open) onOpenActions(event.clientX, event.clientY)
  }

  // A reply to a since-deleted message keeps reply_to but loses the quoted
  // text — no quote box then instead of an empty one.
  const hasReply = !!msg.reply_text
  const bigEmoji = isEmojiOnlyText(msg.text) && !(previewChat && hasReply)
  const initial = (msg.username || '?')[0]?.toUpperCase() || '?'

  return (
    <div
      className={`flex gap-2 ${own ? 'flex-row-reverse ps-10' : 'flex-row pe-10'}`}
      style={{ marginTop }}
    >
      {!own && (
        <div className="w-7 flex-none self-end">
          {showHeader && (
            msg.avatar_url ? (
              <img src={msg.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--m-ic)] font-geist text-[0.6875rem] font-bold text-m-muted">
                {initial}
              </div>
            )
          )}
        </div>
      )}

      <div className={`flex min-w-0 max-w-[78%] flex-col ${own ? 'items-end' : 'items-start'}`}>
        {showHeader && (
          <span className="mb-[2px] ps-1 font-geist text-[0.59375rem] font-bold text-m-faint">{msg.username}</span>
        )}
        {isFromAssistant(msg) && (
          <span className="mb-[2px] ps-1">
            <CollabAssistantBadge name={msg.username} phone />
          </span>
        )}

        {bubbleShown(msg, bigEmoji, hasReply) && <button
          type="button"
          aria-label={canReact ? t('collab.chat.messageOptions') : undefined}
          onClick={previewChat ? onPreviewBubbleClick : undefined}
          onContextMenu={previewChat && canReact ? event => event.preventDefault() : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={clearPress}
          className={`max-w-full text-start ${previewChat && canReact ? 'touch-manipulation' : ''}`}
        >
          {bigEmoji ? (
            <div className="py-[2px] text-[2.5rem] leading-[1.15]">{msg.text}</div>
          ) : (
            <div
              className={`px-[13px] py-[9px] text-[0.8125rem] leading-[1.45] ${
                own ? 'bg-m-act text-m-actfg' : 'border border-[color:var(--m-rowbr)] bg-[color:var(--m-ic)] text-m-ink'
              }`}
              style={own ? OWN_BUBBLE_RADIUS : OTHER_BUBBLE_RADIUS}
            >
              {hasReply && (
                <div className="mb-1 rounded-[10px] bg-[color:var(--m-card)] px-[10px] py-[5px]">
                  <div className="font-geist text-[0.625rem] font-bold opacity-70">{msg.reply_username}</div>
                  <div dir="auto" className="line-clamp-2 text-[0.71875rem] opacity-80">{msg.reply_text?.slice(0, 80)}</div>
                </div>
              )}
              <span dir="auto" className="whitespace-pre-wrap break-words">{msg.text}</span>
            </div>
          )}
        </button>}

        {/* Below the bubble rather than in it: the bubble is the long-press target,
            and an image is tapped to be seen large (MImageViewer). */}
        <ChatImages
          attachments={msg.attachments}
          t={t}
          press={{ onPointerDown, onPointerMove, clearPress, fired: firedRef, onOpenActions }}
        />

        {msg.reactions.length > 0 && (
          <div className="mt-[-4px] flex flex-wrap gap-[3px] px-1">
            {msg.reactions.map(r => (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReactBadgeTap(r.emoji)}
                aria-disabled={previewChat && !canReact ? true : undefined}
                aria-pressed={previewChat && canReact ? r.selected : undefined}
                aria-label={previewChat ? `${r.emoji}, ${r.count}` : undefined}
                data-selected={previewChat && r.selected ? true : undefined}
                className="inline-flex items-center gap-1 rounded-full border border-[color:var(--m-rowbr)] bg-m-card px-[7px] py-[2px] text-[0.75rem] data-[selected]:border-m-act"
              >
                <span>{r.emoji}</span>
                {r.count > 1 && <span className="font-geist text-[0.625rem] font-bold text-m-muted">{r.count}</span>}
              </button>
            ))}
          </div>
        )}

        {isLastInGroup && (
          <span className="mt-[2px] px-1 font-geist text-[0.5625rem] text-m-faint">
            {formatChatClockTime(msg.created_at, is12h)}
          </span>
        )}
      </div>
      {(onReply || onTrash) && (
        <div className="flex flex-none flex-col self-end gap-1">
          {onReply && (
            <button type="button" aria-label={t('collab.chat.reply')} onClick={onReply}
              className="grid size-8 place-items-center rounded-full bg-[color:var(--m-ic)] text-m-muted">
              <Reply size={14} aria-hidden="true" />
            </button>
          )}
          {onTrash && (
            <button type="button" aria-label="Move to Trash" onClick={onTrash}
              className="grid size-8 place-items-center rounded-full bg-[color:var(--m-ic)] text-m-muted">
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** A message has a bubble unless it is a picture alone. */
function bubbleShown(msg: ChatMessage, bigEmoji: boolean, hasReply: boolean): boolean {
  return bigEmoji || hasReply || !!msg.text?.trim()
}

type ImagePress = {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  clearPress: () => void
  fired: React.RefObject<boolean>
  onOpenActions: (x: number, y: number) => void
}

function ChatImages({ attachments, t, press }: { attachments: ChatMessage['attachments']; t: TripPlanner['t']; press: ImagePress }) {
  return attachments?.map(attachment => <ChatImage key={attachment.id} attachment={attachment} t={t} press={press} />)
}

function ChatImage({ attachment, t, press }: { attachment: ChatAttachment; t: TripPlanner['t']; press: ImagePress }) {
  const { placeholder, src, failed, retry } = usePreviewChatImage(attachment)
  const [open, setOpen] = useState(false)
  const alt = attachment.original_name || t('collab.chat.attachedImage')
  if (attachment.privatePath && !src) return <span ref={placeholder} className="mt-1 grid h-36 w-[248px] max-w-full place-items-center text-sm">
    {failed ? <button type="button" onClick={retry}>{t('trip.load.retry')}</button> : t('common.loading')}
  </span>
  return <>
    <button type="button" onPointerDown={press.onPointerDown} onPointerMove={press.onPointerMove}
      onPointerUp={press.clearPress} onPointerCancel={press.clearPress}
      onContextMenu={attachment.privatePath ? event => event.preventDefault() : undefined}
      onClick={event => {
        if (!press.fired.current || event.detail === 0) setOpen(true)
        else if (attachment.privatePath) press.onOpenActions(event.clientX, event.clientY)
      }}
      aria-label={alt} className={`mt-1 block overflow-hidden rounded-[12px] ${attachment.privatePath ? 'h-36 w-[248px] max-w-full' : 'w-full max-w-[260px]'}`}>
      <img src={src} alt="" className={`w-full object-cover ${attachment.privatePath ? 'h-full' : 'max-h-52'}`} />
    </button>
    {open && <MImageViewer src={src} alt={alt} onClose={() => setOpen(false)} />}
  </>
}

function MessageActionsPopover({ x, y, canDeleteOwn, t, onReact, onReply, onDelete, onClose }: {
  x: number
  y: number
  canDeleteOwn: boolean
  t: TripPlanner['t']
  onReact: (emoji: string) => void
  onReply: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [onClose])

  const width = POPOVER_WIDTH
  const left = Math.max(width / 2 + POPOVER_MARGIN, Math.min(x, window.innerWidth - width / 2 - POPOVER_MARGIN))
  const height = POPOVER_HEIGHT + (canDeleteOwn ? POPOVER_DELETE_ROW : 0)
  const top = Math.max(64, Math.min(y - 96, window.innerHeight - height - POPOVER_MARGIN))

  return createPortal(
    <div className="m-root fixed inset-0 z-[55]">
      <div
        ref={ref}
        style={{ top, left, width }}
        className="fixed -translate-x-1/2 rounded-[18px] border border-[color:var(--m-shbr)] bg-[color:var(--m-sheetop)] p-2 shadow-[0_12px_32px_rgba(0,0,0,.28)]"
      >
        <div className="grid grid-cols-4 gap-1">
          {QUICK_REACTIONS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(emoji)}
              aria-label={emoji}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[1.15rem] active:bg-[color:var(--m-ic)]"
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="mt-1 border-t border-[color:var(--m-rowbr)] pt-1">
          <button
            type="button"
            onClick={onReply}
            className="flex w-full items-center gap-2 rounded-[10px] px-2 py-[8px] text-start text-[0.8125rem] font-semibold text-m-ink"
          >
            <Reply size={14} strokeWidth={2} /> {t('collab.chat.reply')}
          </button>
          {canDeleteOwn && (
            <button
              type="button"
              onClick={onDelete}
              className="flex w-full items-center gap-2 rounded-[10px] px-2 py-[8px] text-start text-[0.8125rem] font-semibold text-[color:var(--m-st-danger)]"
            >
              <Trash2 size={14} strokeWidth={2} /> {t('common.delete')}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
