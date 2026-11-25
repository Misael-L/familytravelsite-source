vi.unmock('../../api/websocket');
import { waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/helpers/msw/server';
import { connect, disconnect, joinTrip, setPreReconnectHook, setRefetchCallback } from '../../api/websocket';
class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = Socket.OPEN;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor() {
    Socket.instances.push(this);
  }
}
let release = () => {};
beforeEach(() => {
  disconnect();
  Socket.instances = [];
  vi.stubGlobal('WebSocket', Socket);
  server.use(http.post('/api/auth/ws-token', () => HttpResponse.json({ token: 'fixture-token' })));
});
afterEach(() => {
  release();
  disconnect();
  setRefetchCallback(null);
  setPreReconnectHook(null);
  vi.unstubAllGlobals();
});
async function open() {
  const count = Socket.instances.length;
  connect();
  await waitFor(() => expect(Socket.instances.length).toBe(count + 1));
  return Socket.instances[count];
}
describe('P04x real WebSocket reconnect completion ownership', () => {
  it('a previous socket flush cannot invoke the replacement account callback', async () => {
    const pending = new Promise<void>((r) => {
        release = r;
      }),
      old = vi.fn(),
      next = vi.fn();
    setPreReconnectHook(() => pending);
    setRefetchCallback(old);
    joinTrip(91);
    const socket = await open();
    socket.onopen?.();
    disconnect();
    setPreReconnectHook(() => Promise.resolve());
    setRefetchCallback(next);
    joinTrip(92);
    const replacement = await open();
    replacement.onopen?.();
    await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
    release();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(next).toHaveBeenCalledTimes(1);
    expect(old).not.toHaveBeenCalled();
  });
  it('unregistering a callback during its flush prevents later invocation', async () => {
    const pending = new Promise<void>((r) => {
        release = r;
      }),
      refetch = vi.fn();
    setPreReconnectHook(() => pending);
    setRefetchCallback(refetch);
    joinTrip(91);
    const socket = await open();
    socket.onopen?.();
    setRefetchCallback(null);
    release();
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(refetch).not.toHaveBeenCalled();
  });
});

it('does not refetch canonical state after a failed replay hook', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {}),
    refetch = vi.fn();
  setPreReconnectHook(() => Promise.reject(new Error('Synthetic replay failure')));
  setRefetchCallback(refetch);
  joinTrip(91);
  const socket = await open();
  socket.onopen?.();
  await waitFor(() => expect(error).toHaveBeenCalled());
  expect(refetch).not.toHaveBeenCalled();
  error.mockRestore();
});
