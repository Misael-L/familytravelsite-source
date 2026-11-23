import { useLayoutEffect, useRef, type ChangeEvent, type RefObject } from 'react';
import type { useAssistantAttach } from './useAssistantAttach';

type Attachment = ReturnType<typeof useAssistantAttach>;
/** A browser chooser result belongs to the input and context that opened it, not the latest render. */
export function useAssistantFilePicker(input: RefObject<HTMLInputElement | null>, attachment: Attachment) {
  const selected = useRef<{
    node: HTMLInputElement;
    token: number;
    current: () => boolean;
    take: Attachment['take'];
  } | null>(null);
  const token = attachment.scope.token;
  useLayoutEffect(() => {
    const node = input.current;
    const cancel = () => {
      if (selected.current?.node === node) selected.current = null;
    };
    node?.addEventListener('cancel', cancel);
    return () => {
      node?.removeEventListener('cancel', cancel);
      if (selected.current?.token !== token) return;
      selected.current.node.value = '';
      selected.current = null;
    };
  }, [input, token]);
  const open = () => {
    const node = input.current,
      action = attachment.scope.capture();
    if (!node || attachment.busy || !attachment.canAttach || !action.current()) return;
    selected.current = { node, token, current: action.current, take: attachment.take };
    node.click();
  };
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const node = event.currentTarget,
      original = selected.current;
    try {
      if (original?.node === node) {
        selected.current = null;
        if (original.current()) original.take(node.files);
      }
    } finally {
      node.value = '';
    }
  };
  return { key: token, open, change };
}
