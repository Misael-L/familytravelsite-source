import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { collabApi } from '../../api/client';
import { addListener, removeListener } from '../../api/websocket';
import type { useTranslation } from '../../i18n';
import { captureReadSession } from '../../sync/readSession';
import { offlineOr } from '../../utils/needsConnection';
import type { useToast } from '../shared/Toast';
import type { ChatMessage, ChatReaction } from './collabModel';
import { MAX_CHAT_IMAGES, useChatImages } from './useChatImages';
import { usePreviewChatSend } from './usePreviewChatSend';
import { mergeChatUpdates, reconcileChatChanges, usePreviewChatUpdates, type ChatReadHead, type ChatUpdatePage } from './usePreviewChatUpdates';
import { usePreviewChatRecovery } from './usePreviewChatRecovery';
import { usePreviewChatReaction } from './usePreviewChatReaction';

/** A full page of messages; a shorter page means there is nothing older to load. */
const PAGE_SIZE = 100;

type MessagesResponse = ChatMessage[] | { messages?: ChatMessage[]; has_more?: boolean; can_send?: boolean; change_cursor?: string };

function readMessages(data: MessagesResponse): ChatMessage[] {
  return (Array.isArray(data) ? data : data.messages || []).map((m) => (m.deleted ? { ...m, _deleted: true } : m));
}

function hasEarlierMessages(data: MessagesResponse, messageCount: number) {
  return (!Array.isArray(data) ? data.has_more : undefined) ?? messageCount >= PAGE_SIZE;
}

function sendChatWithOptionalImages(tripId: number | string, { body, replyTo, files, onProgress }: {
  body: string;
  replyTo: ChatMessage | null;
  files: File[];
  onProgress?: (percent: number) => void;
}) {
  if (!files.length) {
    const payload: { text: string; reply_to?: number } = { text: body };
    if (replyTo) payload.reply_to = replyTo.id;
    return collabApi.sendMessage(tripId, payload);
  }
  const form = new FormData();
  if (body) form.append('text', body);
  if (replyTo) form.append('reply_to', String(replyTo.id));
  files.forEach(file => form.append('images', file));
  return onProgress
    ? collabApi.sendMessage(tripId, form, {
        onUploadProgress: event => onProgress(event.total ? Math.round((event.loaded / event.total) * 100) : 0),
      })
    : collabApi.sendMessage(tripId, form);
}

export interface CollabChatDataOptions {
  tripId: number | string;
  t: ReturnType<typeof useTranslation>['t'];
  toast: ReturnType<typeof useToast>;
  /** The phone toasts a failed older page; the desktop panel stays quiet. */
  toastLoadMoreErrors?: boolean;
  /** The desktop panel scrolls down after a remote delete as it does after a new message. */
  scrollOnRemoteDelete?: boolean;
  /** The desktop panel reports how far an image upload got. */
  trackUploadProgress?: boolean;
  /** The phone refuses to send without the collab edit permission. */
  canSend?: boolean;
  previewChat?: boolean;
  chatVisible?: boolean;
  /** Runs once a message went out, next to clearing the draft. */
  onSent?: () => void;
}

/**
 * The trip chat behind the desktop Collab panel and the phone's chat tab, which draw their
 * own message list and composer over it: the newest page on mount, older pages on demand,
 * the live WebSocket updates, the draft with its images and reply, and sending, deleting
 * and reacting. Collab has no store slice, so the messages live here.
 */
export function useCollabChatData({
  tripId,
  t,
  toast,
  toastLoadMoreErrors = false,
  scrollOnRemoteDelete = false,
  trackUploadProgress = false,
  canSend = true,
  previewChat = false,
  chatVisible = true,
  onSent,
}: CollabChatDataOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewCanSend, setPreviewCanSend] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [readHead, setReadHead] = useState<ChatReadHead | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const images = useChatImages();
  const { sendPreviewDraft, clearSendOperation } = usePreviewChatSend(tripId);
  const refresh = useCallback(() => {
    setReadHead(null);
    setLoadAttempt(count => count + 1);
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isAtBottom = useRef(true);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior }));
  }, []);

  const checkAtBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  const hidePreviewChat = useCallback(() => {
    setMessages([]);
    setReplyTo(null);
    setReadHead(null);
    setHasMore(false);
    setPreviewCanSend(false);
    setLoadFailed(true);
  }, []);

  const applyMessageChange = useCallback((message: ChatMessage) => {
    setMessages(previous => reconcileChatChanges(previous, [message]));
    setReplyTo(current => current?.id === message.id ? reconcileChatChanges([current], [message])[0] : current);
  }, []);
  const recovery = usePreviewChatRecovery({
    tripId, enabled: previewChat && previewCanSend && !loading && !loadingMore && !sending,
    onChange: applyMessageChange, refresh,
  });
  const setPreviewReaction = usePreviewChatReaction(tripId);

  const receiveChatUpdates = useCallback((after: number | null, page: ChatUpdatePage) => {
    setPreviewCanSend(page.can_send);
    if (page.changes.length) setReplyTo(current => current ? reconcileChatChanges([current], page.changes)[0] : current);
    if (!page.messages.length && !page.changes.length) return;
    setMessages(previous => {
      const merged = page.messages.length ? mergeChatUpdates(previous, after, page.messages) : previous;
      return reconcileChatChanges(merged, page.changes);
    });
    if (page.messages.length) setTimeout(() => { if (isAtBottom.current) scrollToBottom('smooth'); }, 30);
  }, [scrollToBottom]);

  usePreviewChatUpdates({
    tripId, enabled: previewChat && chatVisible && !loading && !loadingMore, head: readHead, onPage: receiveChatUpdates,
    onAccessLost: hidePreviewChat, onExpiredCursor: refresh,
  });

  // A list that sat at its newest message stays there when its box changes size (a
  // rotation, a fold, a pane opening beside it): the messages wrap anew and the list
  // grows, which left the newest ones below the composer. Both views draw the list
  // only once there are messages to show, so the observer attaches when it appears,
  // not at mount, when there is nothing yet to observe.
  const listShown = !loading && messages.length > 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (!listShown || !el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (isAtBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [listShown]);

  useEffect(() => {
    let cancelled = false;
    const scope = previewChat ? captureReadSession() : null;
    const current = () => !cancelled && (scope?.contextCurrent() ?? true);
    setLoading(true);
    setLoadFailed(false);
    collabApi
      .getMessages(tripId)
      .then((data: MessagesResponse) => {
        if (!current()) return;
        const msgs = readMessages(data);
        setMessages(msgs);
        setHasMore(hasEarlierMessages(data, msgs.length));
        if (previewChat) {
          setPreviewCanSend(!Array.isArray(data) && data.can_send === true);
          setReadHead({ id: msgs[msgs.length - 1]?.id ?? null, change: Array.isArray(data) ? '0' : data.change_cursor ?? '0' });
        }
        setLoading(false);
        setTimeout(() => scrollToBottom(), 30);
      })
      .catch(() => {
        if (!current()) return;
        if (previewChat) hidePreviewChat();
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId, scrollToBottom, previewChat, loadAttempt, hidePreviewChat]);

  useEffect(() => {
    if (previewChat) return;
    const handler = (event: Record<string, unknown>) => {
      if (String(event.tripId) !== String(tripId)) return;
      if (event.type === 'collab:message:created') {
        const message = event.message as ChatMessage;
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
        if (isAtBottom.current) setTimeout(() => scrollToBottom('smooth'), 30);
      }
      if (event.type === 'collab:message:deleted') {
        const messageId = event.messageId as number;
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, _deleted: true } : m)));
        if (scrollOnRemoteDelete && isAtBottom.current) setTimeout(() => scrollToBottom('smooth'), 50);
      }
      if (event.type === 'collab:message:reacted') {
        const messageId = event.messageId as number;
        const reactions = event.reactions as ChatReaction[];
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)));
      }
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [tripId, scrollToBottom, scrollOnRemoteDelete, previewChat]);

  const handleLoadMore = useCallback(async () => {
    const current = messagesRef.current;
    if (loadingMore || current.length === 0) return;
    const scope = previewChat ? captureReadSession() : null;
    setLoadingMore(true);
    const el = scrollRef.current;
    const prevHeight = el ? el.scrollHeight : 0;
    try {
      const beforeId = current[0]?.id;
      const data: MessagesResponse = await collabApi.getMessages(
        tripId,
        beforeId != null ? String(beforeId) : undefined
      );
      if (scope && !scope.contextCurrent()) return;
      const older = readMessages(data);
      if (older.length === 0) {
        setHasMore(false);
      } else {
        setMessages((prev) => {
          if (!previewChat) return [...older, ...prev];
          const loadedIds = new Set(prev.map(message => message.id));
          return reconcileChatChanges([...older.filter(row => !loadedIds.has(row.id)), ...prev], []);
        });
        setHasMore(hasEarlierMessages(data, older.length));
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - prevHeight;
        });
      }
    } catch {
      if ((previewChat || toastLoadMoreErrors) && (scope?.contextCurrent() ?? true)) toast.error(offlineOr(t, t('common.error')));
    } finally {
      setLoadingMore(false);
    }
  }, [tripId, loadingMore, toastLoadMoreErrors, toast, t, previewChat]);

  /** Keeps the draft box as tall as its text, up to 100px, then scrolls inside it. */
  const handleTextChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    if (previewChat && !e.target.value.trim() && !images.files.length) clearSendOperation();
    setText(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      const h = Math.min(ta.scrollHeight, 100);
      ta.style.height = `${h}px`;
      ta.style.overflowY = ta.scrollHeight > 100 ? 'auto' : 'hidden';
    }
  }, [previewChat, clearSendOperation, images.files.length]);

  const addImageFiles = useCallback(
    (incoming: File[] | FileList) => {
      if (previewChat && (!previewCanSend || loading || sending)) return;
      images.add(incoming, ({ rejected, overflow }) => {
        if (rejected) toast.error(t('collab.chat.imageRejected'));
        if (overflow) toast.error(t('collab.chat.imageLimit', { count: MAX_CHAT_IMAGES }));
      });
    },
    [images, toast, t, previewChat, previewCanSend, loading, sending]
  );

  const removeImageFile = useCallback((index: number) => {
    if (previewChat && sending) return;
    images.remove(index);
    if (previewChat && images.files.length === 1 && !text.trim()) clearSendOperation();
  }, [images, previewChat, sending, text, clearSendOperation]);

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (sending || (!body && !images.files.length) || !(previewChat ? previewCanSend && !loading && !replyTo?._deleted : canSend)) return;
    const scope = previewChat ? captureReadSession() : null;
    setSending(true);
    try {
      const data: { message?: ChatMessage } | undefined = previewChat
        ? await sendPreviewDraft(body, replyTo?.id, images.files)
        : await sendChatWithOptionalImages(tripId, { body, replyTo, files: images.files,
            onProgress: trackUploadProgress ? setUploadProgress : undefined });
      const sent = data?.message;
      if (sent) {
        setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      }
      setText('');
      setReplyTo(null);
      onSent?.();
      images.clear();
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      isAtBottom.current = true;
      setTimeout(() => scrollToBottom('smooth'), 50);
    } catch (error) {
      if (scope?.contextCurrent() ?? true) {
        const detail = previewChat ? (error as { response?: { data?: { error?: string } } })?.response?.data?.error : null;
        toast.error(detail ?? offlineOr(t, t('common.error')));
      }
    } finally {
      setSending(false);
      setUploadProgress(0);
    }
  }, [text, sending, canSend, replyTo, tripId, trackUploadProgress, onSent, scrollToBottom, toast, t, images, loading, previewChat, previewCanSend, sendPreviewDraft]);

  /** Deletes a message on the server and leaves its "deleted" placeholder in the list. */
  const deleteMessage = useCallback(
    async (msgId: number) => {
      try {
        await collabApi.deleteMessage(tripId, msgId);
        setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, _deleted: true } : m)));
      } catch {
        toast.error(offlineOr(t, t('common.error')));
      }
    },
    [tripId, toast, t]
  );

  const reactToMessage = useCallback(
    async (msgId: number, emoji: string) => {
      if (previewChat) {
        const message = messagesRef.current.find(row => row.id === msgId);
        if (!previewCanSend || loading || !message || message._deleted) return;
        const changed = await setPreviewReaction(message, emoji, detail => toast.error(detail));
        if (changed) applyMessageChange(changed);
        return;
      }
      try {
        const data = (await collabApi.reactMessage(tripId, msgId, emoji)) as { reactions: ChatReaction[] };
        setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, reactions: data.reactions } : m)));
      } catch {
        toast.error(offlineOr(t, t('common.error')));
      }
    },
    [tripId, toast, t, previewChat, previewCanSend, loading, setPreviewReaction, applyMessageChange]
  );

  // The setters, messagesRef and isAtBottom are only here because useCollabChat hands them
  // on in the return shape the desktop chat panel has always had; nothing writes them.
  return {
    messages,
    setMessages,
    loading,
    loadFailed,
    previewCanSend,
    recovery,
    refresh,
    setLoading,
    hasMore,
    setHasMore,
    loadingMore,
    setLoadingMore,
    text,
    setText,
    replyTo,
    setReplyTo,
    sending,
    setSending,
    uploadProgress,
    images,
    scrollRef,
    textareaRef,
    isAtBottom,
    messagesRef,
    scrollToBottom,
    checkAtBottom,
    handleLoadMore,
    handleTextChange,
    addImageFiles,
    removeImageFile,
    handleSend,
    deleteMessage,
    reactToMessage,
  };
}
