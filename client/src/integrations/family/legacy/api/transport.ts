import axios, { AxiosInstance } from 'axios';

import type { z } from 'zod';

import type { UploadOptions } from '../../../../api/client';

import { probeNow } from '../sync/connectivity';

import { getSocketId } from './websocket';

/**
 * Validate a response payload against its @trek/shared Zod schema — but only in
 * dev, and never throwing. A drift between the server contract and the client's
 * expected shape is surfaced as a console warning during development; in
 * production (and on any mismatch) the data passes through untouched, so adding
 * validation can never break a working call. This is the typed-request helper
 * the FE adopts per domain as each backend module lands on @trek/shared.
 */
const API_DEV = Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

export function parseInDev<S extends z.ZodTypeAny>(schema: S, data: unknown, label: string): z.infer<S> {
  if (API_DEV) {
    const result = schema.safeParse(data);
    if (!result.success) {
      console.warn(`[api] ${label}: response did not match the @trek/shared schema`, result.error.issues);
    }
  }
  return data as z.infer<S>;
}

/**
 * Same dev-only drift check as parseInDev, but passes the payload straight
 * through with its original inferred type instead of the schema type. Use this
 * for endpoints whose existing consumers rely on the loose `r.data` type — it
 * adds the development contract-drift warning without retyping the public
 * surface (so it can never break a consumer that worked before).
 */
export function checkInDev<T>(schema: z.ZodTypeAny, data: T, label: string): T {
  if (API_DEV) {
    const result = schema.safeParse(data);
    if (!result.success) {
      console.warn(`[api] ${label}: response did not match the @trek/shared schema`, result.error.issues);
    }
  }
  return data;
}

const RATE_LIMIT_MESSAGES: Record<string, string> = {
  en: 'Too many attempts. Please try again later.',
  de: 'Zu viele Versuche. Bitte versuchen Sie es später erneut.',
  es: 'Demasiados intentos. Inténtelo de nuevo más tarde.',
  fr: 'Trop de tentatives. Veuillez réessayer plus tard.',
  hu: 'Túl sok próbálkozás. Kérjük, próbálja újra később.',
  nl: 'Te veel pogingen. Probeer het later opnieuw.',
  br: 'Muitas tentativas. Tente novamente mais tarde.',
  cs: 'Příliš mnoho pokusů. Zkuste to prosím znovu.',
  pl: 'Zbyt wiele prób. Spróbuj ponownie później.',
  ru: 'Слишком много попыток. Попробуйте позже.',
  zh: '尝试次数过多，请稍后再试。',
  'zh-TW': '嘗試次數過多，請稍後再試。',
  it: 'Troppi tentativi. Riprova più tardi.',
  tr: 'Çok fazla deneme. Lütfen daha sonra tekrar deneyin.',
  ar: 'محاولات كثيرة جدًا. يرجى المحاولة لاحقًا.',
  id: 'Terlalu banyak percobaan. Coba lagi nanti.',
  ja: '試行回数が多すぎます。時間をおいて再度お試しください。',
  ko: '시도 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  uk: 'Занадто багато спроб. Спробуйте пізніше.',
  sv: 'För många försök. Prova igen senare.',
};

function translateRateLimit(): string {
  const fallback = RATE_LIMIT_MESSAGES['en']!;
  try {
    const lang = localStorage.getItem('app_language') || 'en';
    return RATE_LIMIT_MESSAGES[lang] ?? fallback;
  } catch {
    return fallback;
  }
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 8000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

// Request interceptor - add socket ID + idempotency key for mutating requests
apiClient.interceptors.request.use(
  (config) => {
    const sid = getSocketId();
    if (sid) {
      config.headers['X-Socket-Id'] = sid;
    }
    // Attach a per-request idempotency key to all write operations so the
    // server can deduplicate retried requests (e.g. network blips).
    // The mutation queue sets its own pre-generated key; skip if already set.
    const method = (config.method ?? '').toLowerCase();
    if (MUTATING_METHODS.has(method) && !config.headers['X-Idempotency-Key']) {
      const key =
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      config.headers['X-Idempotency-Key'] = key;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export function isAuthPublicPath(pathname: string): boolean {
  const publicPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
  const publicPrefixes = ['/shared/', '/public/'];
  return publicPaths.includes(pathname) || publicPrefixes.some((p) => pathname.startsWith(p));
}

// Unregisters the SW before reloading so the navigation reaches the network.
// Without this, WorkBox's NavigationRoute serves the cached SPA shell and the
// upstream proxy (CF Access / Pangolin) never gets to challenge the user.
async function unregisterSWAndReload(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.unregister();
  } catch {
    /* ignore */
  }
  window.location.reload();
}

// Response interceptor - handle 401, 403 MFA, 429 rate limit, proxy auth challenges
apiClient.interceptors.response.use(
  (response) => {
    sessionStorage.removeItem('proxy_reauth_attempted');
    return response;
  },
  async (error) => {
    // CF Access / Pangolin / similar: cross-origin redirect from /api/* surfaces
    // as a CORS error with no response object. Probe the health endpoint to
    // distinguish a proxy auth challenge from a genuine outage. If the server
    // is reachable, a top-level reload lets the edge proxy run its auth flow.
    if (!error.response && navigator.onLine) {
      // Only an actual edge-proxy auth wall warrants tearing down the SW to
      // reauth: a reachable proxy (CF Access / Pangolin) that intercepts /api
      // with a cross-origin redirect or an HTML login page. A genuine offline
      // boot ALSO lands here — navigator.onLine reflects a network interface,
      // not reachability, and is routinely true on mobile while offline. So
      // gate strictly on a positive proxy signal; on plain offline do nothing
      // and let the request reject so the cached shell + IndexedDB serve the
      // app. Unregistering the SW here reloaded into a dead network and broke
      // PWA offline mode (#1346).
      const state = await probeNow();
      if (state === 'proxy-wall') {
        const { pathname } = window.location;
        if (!isAuthPublicPath(pathname) && !sessionStorage.getItem('proxy_reauth_attempted')) {
          sessionStorage.setItem('proxy_reauth_attempted', '1');
          await unregisterSWAndReload();
          return Promise.reject(error);
        }
      }
    }
    // Pangolin header-auth extended compatibility mode: returns 401 with an
    // HTML body (a JS redirect page) instead of a 302. TREK's own 401s are
    // always application/json, so checking for text/html is unambiguous.
    if (error.response?.status === 401) {
      const ct = (error.response.headers?.['content-type'] as string | undefined) ?? '';
      if (ct.includes('text/html')) {
        const { pathname } = window.location;
        if (!isAuthPublicPath(pathname) && !sessionStorage.getItem('proxy_reauth_attempted')) {
          sessionStorage.setItem('proxy_reauth_attempted', '1');
          await unregisterSWAndReload();
          return Promise.reject(error);
        }
      }
    }
    if (
      error.response?.status === 401 &&
      (error.response?.data as { code?: string } | undefined)?.code === 'AUTH_REQUIRED'
    ) {
      const { pathname } = window.location;
      if (!isAuthPublicPath(pathname)) {
        const currentPath = pathname + window.location.search + window.location.hash;
        window.location.href = '/login?redirect=' + encodeURIComponent(currentPath);
      }
    }
    if (
      error.response?.status === 403 &&
      (error.response?.data as { code?: string } | undefined)?.code === 'MFA_REQUIRED' &&
      !window.location.pathname.startsWith('/settings')
    ) {
      window.location.href = '/settings?mfa=required';
    }
    if (error.response?.status === 429) {
      const translated = translateRateLimit();
      const data = error.response.data as { error?: string } | undefined;
      if (data && typeof data === 'object') {
        data.error = translated;
      } else {
        error.response.data = { error: translated };
      }
      error.message = translated;
    }
    return Promise.reject(error);
  }
);

export type { UploadOptions } from '../../../../api/client';

/** Use the browser's multipart boundary and allow slow uploads to complete. */
export function postMultipart<T = any>(url: string, formData: FormData, opts?: UploadOptions): Promise<T> {
  return apiClient
    .postForm<T>(url, formData, {
      headers: opts?.idempotencyKey ? { 'X-Idempotency-Key': opts.idempotencyKey } : undefined,
      timeout: 0,
      onUploadProgress: opts?.onUploadProgress,
      signal: opts?.signal,
    })
    .then((response) => response.data);
}
