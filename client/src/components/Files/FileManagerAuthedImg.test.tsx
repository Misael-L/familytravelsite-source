import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '../../../tests/helpers/render';
import { invalidateOfflineSession } from '../../db/offlineDb';
import { AuthedImg } from './FileManagerAuthedImg';

const resolveUrl = vi.hoisted(() => vi.fn<(url: string) => Promise<string>>());
vi.mock('../../api/authUrl', () => ({ getAuthUrl: resolveUrl }));

function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  resolveUrl.mockReset();
  invalidateOfflineSession();
});

describe('native attachment preview ownership', () => {
  it('does not let the older image overwrite a newer selection', async () => {
    const a = held<string>(),
      b = held<string>();
    resolveUrl.mockImplementation((url) => (url === '/a' ? a.promise : b.promise));
    const view = render(<AuthedImg src="/a" />);
    view.rerender(<AuthedImg src="/b" />);
    await act(async () => {
      b.resolve('/b?signed');
    });
    expect(screen.getByRole('presentation')).toHaveAttribute('src', '/b?signed');
    await act(async () => {
      a.resolve('/a?signed');
    });
    expect(screen.getByRole('presentation')).toHaveAttribute('src', '/b?signed');
  });

  it('hides the previous image while the next selection is unresolved', async () => {
    resolveUrl.mockResolvedValueOnce('/a?signed').mockImplementation(() => new Promise(() => {}));
    const view = render(<AuthedImg src="/a" />);
    await screen.findByRole('presentation');
    view.rerender(<AuthedImg src="/b" />);
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
  });

  it('clears a resolved preview on private-session retirement without rebinding the old selection', async () => {
    resolveUrl.mockResolvedValue('/a?signed');
    render(<AuthedImg src="/a" />);
    await screen.findByRole('presentation');
    act(() => {
      invalidateOfflineSession();
    });
    await waitFor(() => expect(screen.queryByRole('presentation')).not.toBeInTheDocument());
    expect(resolveUrl).toHaveBeenCalledTimes(1);
  });
});
