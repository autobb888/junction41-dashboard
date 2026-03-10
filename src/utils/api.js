/**
 * API fetch wrapper — handles 401 responses by clearing stale auth state.
 * All dashboard API calls should use apiFetch() instead of raw fetch().
 */
const API_BASE = import.meta.env.VITE_API_URL || '';

// Callback set by AuthContext to handle session expiry
let onSessionExpired = null;

export function setSessionExpiredHandler(handler) {
  onSessionExpired = handler;
}

/**
 * Fetch wrapper that:
 * 1. Prepends API_BASE if path starts with /
 * 2. Always includes credentials
 * 3. Calls onSessionExpired on 401
 */
export async function apiFetch(url, options = {}) {
  const fullUrl = url.startsWith('/') ? `${API_BASE}${url}` : url;
  const res = await fetch(fullUrl, {
    credentials: 'include',
    ...options,
  });

  if (res.status === 401 && onSessionExpired) {
    onSessionExpired();
  }

  return res;
}
