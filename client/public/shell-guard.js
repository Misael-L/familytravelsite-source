/*
 * Boot guard for the app shell (#2524).
 *
 * Loaded as an external classic script in <head> (NOT a module), like
 * theme-boot.js, so it runs before the entry module and complies with the
 * production CSP (script-src 'self').
 *
 * The entry module and every chunk it imports statically have to load before
 * any of the app's own code runs. When one of them does not (a service worker
 * precache that keeps index.html under a chunk's name, a proxy that hands out a
 * stale file), the module script fails as a whole: nothing renders, and no error
 * screen or reload button of the app is there to help. A reload changes nothing
 * either, since the same precache answers it. This notices exactly that failure
 * and, while the server answers, loads the page again from the server under a
 * URL no cache has seen. When a service worker served the page, the app shell
 * it keeps (the Workbox precache and the worker itself) is thrown away first,
 * since that is what answered with the broken file. A Web Push subscription
 * ends with the worker and has to be switched on again, the price of an app
 * that starts again. Once per session, so a build that is broken on the server
 * cannot put the page in a reload loop. Offline nothing happens: the precache
 * is then the only way the app can start at all.
 *
 * It also strips the query parameter such a reload carries, before the app
 * reads the URL. Keep the parameter and the cache filter in sync with
 * src/utils/chunkReload.ts and src/utils/serviceWorkerShell.ts.
 *
 * It must never throw.
 */
(function () {
  var PARAM = 'trek-reload';
  var MARKER = 'trek:shell-reload';
  var HEALTH_TIMEOUT_MS = 3000;
  var failedEntry = false;
  var fallback = null;
  var retrying = false;
  var recoveryEpoch = 0;

  try {
    var here = new URL(window.location.href);
    if (here.searchParams.has(PARAM)) {
      here.searchParams.delete(PARAM);
      window.history.replaceState(window.history.state, '', here.pathname + here.search + here.hash);
    }
  } catch (e) {
    /* the parameter stays in the address bar, which is harmless */
  }

  // The built entry lives under /assets/. The dev server's /src/main.tsx does
  // not, so a syntax error while developing is left to Vite's own overlay.
  function isEntry(el) {
    return !!el && el.tagName === 'SCRIPT' && el.type === 'module' && /\/assets\//.test(el.src || '');
  }

  function alreadyTried() {
    try {
      return !!sessionStorage.getItem(MARKER);
    } catch (e) {
      // Without the marker there is no loop protection, so do nothing.
      return true;
    }
  }

  function markTried() {
    try {
      sessionStorage.setItem(MARKER, String(Date.now()));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Same test as probeNow() in src/sync/connectivity.ts: TREK's own health JSON,
  // not an edge proxy's login page and not a request that never came back.
  function serverAnswers() {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl
      ? setTimeout(function () {
          ctrl.abort();
        }, HEALTH_TIMEOUT_MS)
      : null;
    return fetch('/api/health', {
      credentials: 'include',
      cache: 'no-store',
      redirect: 'manual',
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(
        function (res) {
          var type = res.headers.get('content-type') || '';
          return res.ok && type.indexOf('application/json') !== -1;
        },
        function () {
          return false;
        }
      )
      .then(function (ok) {
        if (timer) clearTimeout(timer);
        return ok;
      });
  }

  function servedByWorker() {
    try {
      return !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    } catch (e) {
      return false;
    }
  }

  function dropAppShell(stillCurrent) {
    return navigator.serviceWorker.getRegistration().then(function (reg) {
      if (!reg || !stillCurrent()) return;
      var here = new URL(window.location.href);
      var scope = new URL(reg.scope);
      var controller = navigator.serviceWorker.controller;
      if (
        scope.origin !== here.origin ||
        !here.href.startsWith(scope.href) ||
        !controller ||
        new URL(controller.scriptURL, here).href !== new URL('sw.js', scope).href
      )
        return;
      var cacheName = 'workbox-precache-v2-' + scope.href;
      var dropped =
        typeof caches === 'undefined'
          ? Promise.resolve()
          : caches.keys().then(function (names) {
              if (stillCurrent() && names.indexOf(cacheName) !== -1) return caches.delete(cacheName);
            });
      return dropped.then(function () {
        if (stillCurrent()) return reg.unregister();
      });
    });
  }

  function reloadFresh() {
    var url = new URL(window.location.href);
    url.searchParams.set(PARAM, Date.now().toString(36));
    window.location.replace(url.href);
  }

  // Entry imports can fail before React (and its error boundary) exists. Keep
  // a non-destructive way back even offline or on a static host without /api/health.
  // This never touches IndexedDB, retained commands, files or the worker cache.
  function showRetry() {
    if (fallback || !document.body) return;
    var root = document.getElementById('root');
    if (root && root.childElementCount) return;
    fallback = document.createElement('main');
    fallback.id = 'trek-shell-recovery';
    fallback.setAttribute('role', 'alert');
    var title = document.createElement('h1');
    title.textContent = 'Could not start the app';
    var detail = document.createElement('p');
    detail.textContent =
      navigator.onLine === false
        ? 'You appear to be offline'
        : 'The app could not finish loading. Reconnect and try again.';
    var retained = document.createElement('p');
    retained.textContent = 'Your saved work has not been removed.';
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Try again';
    button.addEventListener('click', function () {
      if (retrying) return;
      var epoch = recoveryEpoch;
      var contract = window.FamilyBuildContract;
      if (!contract || !servedByWorker()) {
        markTried();
        reloadFresh();
        return;
      }
      retrying = true;
      button.disabled = true;
      var current = function () {
        return failedEntry && recoveryEpoch === epoch;
      };
      // Only verified public network bytes permit retiring this app's public shell.
      contract
        .read(window.fetch.bind(window), new URL(window.location.href).origin, { verifyEntry: true })
        .then(function (build) {
          if (!current()) return;
          markTried();
          var dropped = build ? dropAppShell(current) : Promise.resolve();
          return dropped.then(function () {
            if (current()) reloadFresh();
          });
        })
        .catch(function () {
          /* keep all local state if validation/cleanup fails */
        })
        .finally(function () {
          retrying = false;
          button.disabled = false;
        });
    });
    fallback.appendChild(title);
    fallback.appendChild(detail);
    fallback.appendChild(retained);
    fallback.appendChild(button);
    document.body.appendChild(fallback);
  }

  function retryAfterReconnect() {
    if (!failedEntry || alreadyTried() || !markTried()) return;
    // A reconnect is not evidence of a sound backend or permission to delete a
    // cache. Just retry this document once, preserving all local state.
    reloadFresh();
  }

  function recover() {
    failedEntry = true;
    var epoch = ++recoveryEpoch;
    showRetry();
    if (alreadyTried()) return;
    // Read now: a page the worker did not serve failed on the network, and its
    // precache has nothing to do with it.
    var fromWorker = servedByWorker();
    serverAnswers()
      .then(function (ok) {
        if (!failedEntry || recoveryEpoch !== epoch || !ok || alreadyTried() || !markTried()) return;
        var current = function () {
          return failedEntry && recoveryEpoch === epoch;
        };
        var dropped = fromWorker ? dropAppShell(current) : Promise.resolve();
        return dropped
          .then(null, function () {
            /* reload regardless, the server has the current build */
          })
          .then(function () {
            if (current()) reloadFresh();
          });
      })
      .then(null, function () {
        /* never block boot */
      });
  }

  try {
    window.addEventListener('online', retryAfterReconnect);
    // Error and load events of a script do not bubble, so both are caught on
    // their way down. On the document, since a load event never reaches window.
    document.addEventListener(
      'error',
      function (event) {
        if (isEntry(event.target)) recover();
      },
      true
    );
    // The shell started, so a later update in this session may recover too.
    document.addEventListener(
      'load',
      function (event) {
        if (!isEntry(event.target)) return;
        failedEntry = false;
        recoveryEpoch++;
        if (fallback) {
          fallback.remove();
          fallback = null;
        }
        try {
          sessionStorage.removeItem(MARKER);
        } catch (e) {
          /* nothing to clear */
        }
      },
      true
    );
  } catch (e) {
    /* never block boot */
  }
})();
