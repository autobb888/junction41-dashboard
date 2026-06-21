/**
 * API fetch wrapper — credentials + 401 handling, plus:
 *  • GET de-duplication (collapse concurrent identical reads into one request)
 *  • a short read-cache for reputation/agent endpoints (kills the 3× burst → 429)
 *  • 429 retry-with-backoff (honours Retry-After)
 * All dashboard API calls should use apiFetch() instead of raw fetch().
 */
const API_BASE = import.meta.env.VITE_API_URL || '';

// Callback set by AuthContext to handle session expiry
let onSessionExpired = null;

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

// In-flight GETs — collapse concurrent identical requests into one network call.
const inflight = new Map();
// Short-lived response cache for read-only endpoints.
const cache = new Map();
const CACHE_TTL_MS = 1500;
const CACHEABLE = /^\/v1\/(reputation|agents)\//;

function isGet(options) {
  const method = (options.method || 'GET').toUpperCase();
  return method === 'GET' && options.body == null;
}

// fetch + retry on 429 (honours Retry-After, else exponential backoff)
async function fetchWithRetry(fullUrl, options, attempt = 0) {
  const res = await fetch(fullUrl, { credentials: 'include', ...options });
  if (res.status === 429 && attempt < 2) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 300 * 2 ** attempt;
    await new Promise(r => setTimeout(r, delay));
    return fetchWithRetry(fullUrl, options, attempt + 1);
  }
  return res;
}

function handle(res) {
  if (res.status === 401 && onSessionExpired) onSessionExpired();
  return res;
}

/**
 * Fetch wrapper that:
 * 1. Prepends API_BASE if path starts with /
 * 2. Always includes credentials
 * 3. Calls onSessionExpired on 401
 * 4. De-dupes concurrent GETs, caches reputation/agent reads briefly, retries 429s
 */
export async function apiFetch(url, options = {}) {
  // Reject non-root URLs so a future bug or compromised value can't redirect
  // a credentialed fetch to an attacker-controlled origin.
  if (typeof url !== 'string' || !url.startsWith('/')) {
    throw new Error(`apiFetch: url must be a root-relative path starting with "/", got: ${url}`);
  }
  const fullUrl = `${API_BASE}${url}`;
  const get = isGet(options);

  // Non-GET (or requests with a body) bypass all caching/dedupe.
  if (!get) {
    return handle(await fetchWithRetry(fullUrl, options));
  }

  // 1) Short read-cache for reputation/agent endpoints — hand out a fresh clone.
  if (CACHEABLE.test(url)) {
    const hit = cache.get(fullUrl);
    if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
      return handle(hit.res.clone());
    }
  }

  // 2) Collapse concurrent identical GETs into one network call.
  if (inflight.has(fullUrl)) {
    const master = await inflight.get(fullUrl);
    return handle(master.clone());
  }

  const promise = fetchWithRetry(fullUrl, options);
  inflight.set(fullUrl, promise);
  let master;
  try {
    master = await promise;
  } finally {
    inflight.delete(fullUrl);
  }

  // Cache successful read-only responses (store unread; hand out clones).
  if (CACHEABLE.test(url) && master.ok) {
    cache.set(fullUrl, { res: master.clone(), ts: Date.now() });
  }

  // Never read the master directly — every consumer gets its own clone.
  return handle(master.clone());
}
