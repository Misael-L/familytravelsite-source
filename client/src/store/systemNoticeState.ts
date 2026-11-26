export interface SystemNoticeState<Notice> {
  notices: Notice[];
  loaded: boolean;
  fetching: boolean;
  fetch: () => Promise<void>;
  dismiss: (id: string) => void;
  reset: () => void;
}

interface NoticeTransport<Notice> {
  read: () => Promise<Notice[]>;
  dismiss: (id: string) => Promise<unknown>;
  available?: () => boolean;
}

export function createSystemNoticeState<Notice extends { id: string }>(transport: NoticeTransport<Notice>) {
  return (
    set: (change: Partial<SystemNoticeState<Notice>>) => void,
    get: () => SystemNoticeState<Notice>
  ): SystemNoticeState<Notice> => {
    let generation = 0;
    const retries = new Set<ReturnType<typeof setTimeout>>();

    const persistDismissal = async (id: string, owner: number) => {
      try {
        await transport.dismiss(id);
      } catch {
        if (generation !== owner) return;
        const retry = setTimeout(() => {
          retries.delete(retry);
          void transport.dismiss(id).catch((error: unknown) => {
            if (generation === owner) console.warn('[systemNotices] dismiss failed:', error);
          });
        }, 2000);
        retries.add(retry);
      }
    };

    return {
      notices: [],
      loaded: false,
      fetching: false,

      async fetch() {
        if (transport.available?.() === false) {
          set({ notices: [], loaded: true, fetching: false });
          return;
        }
        if (get().fetching || get().loaded) return;
        const owner = generation;
        set({ fetching: true });
        try {
          const notices = await transport.read();
          if (generation === owner) set({ notices, loaded: true, fetching: false });
        } catch (error) {
          if (generation !== owner) return;
          console.warn('[systemNotices] failed to fetch:', error);
          set({ loaded: true, fetching: false });
        }
      },

      reset() {
        generation++;
        for (const retry of retries) clearTimeout(retry);
        retries.clear();
        set({ notices: [], loaded: false, fetching: false });
      },

      dismiss(id) {
        const owner = generation;
        set({ notices: get().notices.filter((notice) => notice.id !== id) });
        if (generation === owner && transport.available?.() !== false) void persistDismissal(id, owner);
      },
    };
  };
}
