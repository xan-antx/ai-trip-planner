const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const TOKEN_KEY = 'trip_planner_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * fetch wrapper that attaches the JWT and unwraps API errors.
 * Throws an Error with `.status` so callers can branch on 401.
 */
export async function apiFetch(path, options = {}) {
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON response (e.g. server down mid-request)
  }

  if (!res.ok) {
    const err = new Error(body?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }

  return body;
}

export const api = {
  signup: (email, password) =>
    apiFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),

  login: (email, password) =>
    apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  me: () => apiFetch('/api/auth/me'),

  cities: () => apiFetch('/api/cities'),

  places: (cityId, category) =>
    apiFetch(`/api/cities/${cityId}/places${category ? `?category=${category}` : ''}`),
};
