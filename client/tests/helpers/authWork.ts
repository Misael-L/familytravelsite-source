import { useAuthStore } from '../../src/store/authStore';

/** Drain real auth actions before resetting the fixture owner or MSW handlers. */
export function trackAuthWork(): () => Promise<void> {
  const original = useAuthStore.getState();
  const pending = new Set<Promise<unknown>>();
  const track = <T>(work: Promise<T>): Promise<T> => {
    pending.add(work);
    void work.then(
      () => pending.delete(work),
      () => pending.delete(work)
    );
    return work;
  };
  useAuthStore.setState({
    loadUser: (options) => track(original.loadUser(options)),
    updateProfile: (data) => track(original.updateProfile(data)),
    uploadAvatar: (file) => track(original.uploadAvatar(file)),
    deleteAvatar: () => track(original.deleteAvatar()),
  });
  return async () => {
    while (pending.size) await Promise.allSettled([...pending]);
  };
}
