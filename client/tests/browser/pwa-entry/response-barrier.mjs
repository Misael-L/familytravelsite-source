// Qualification transport scheduling only: pause a genuine marked API response, never replace its bytes or authority.
import assert from 'node:assert/strict';
import { clearTimeout, setTimeout } from 'node:timers';
const api = 'http://127.0.0.1:55331';
const paths = {
  planner: (p) => p === '/rest/v1/rpc/get_family_trip_planner_view_v1',
  media: (p) => p.startsWith('/storage/v1/object/sign/trip-files/'),
};
export function responseBarrier() {
  let pending = null;
  const observations = [];
  return {
    hold(kind, phase = 'body') {
      assert.ok(Object.hasOwn(paths, kind));
      assert.ok(['headers', 'body'].includes(phase));
      assert.equal(pending, null, 'Release the previous response before arming another.');
      let arrived;
      const reached = new Promise((resolve) => {
        arrived = resolve;
      });
      const row = { kind, phase, arrived: false, released: false, timedOut: false, status: null };
      observations.push(row);
      const item = { kind, phase, row, arrived, release: null, timer: null };
      pending = item;
      const release = () => {
        if (row.released) return;
        row.released = true;
        clearTimeout(item.timer);
        if (pending === item) pending = null;
        item.release?.();
      };
      item.timer = setTimeout(() => {
        row.timedOut = true;
        release();
      }, 45000);
      return { reached, release, observation: row };
    },
    intercept(url, upstream, downstream) {
      const item = pending;
      if (!item || item.row.arrived || url.origin !== api || !paths[item.kind](url.pathname)) return false;
      upstream.pause();
      item.row.arrived = true;
      item.row.status = upstream.statusCode;
      const headers = () => {
        if (!downstream.destroyed && !downstream.headersSent)
          downstream.writeHead(upstream.statusCode, upstream.headers);
      };
      if (item.phase === 'body') {
        headers();
        downstream.flushHeaders();
      }
      item.release = () => {
        if (downstream.destroyed) {
          upstream.destroy();
          return;
        }
        headers();
        upstream.pipe(downstream);
      };
      downstream.once('close', () => {
        if (!downstream.writableEnded) upstream.destroy();
      });
      upstream.on('error', () => downstream.destroy());
      item.arrived({ status: upstream.statusCode, headersDelivered: item.phase === 'body' });
      return true;
    },
    observations,
    close() {
      if (!pending) return;
      clearTimeout(pending.timer);
      pending.row.released = true;
      pending.release?.();
      pending = null;
    },
  };
}
