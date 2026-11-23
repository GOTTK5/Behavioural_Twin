import axios from 'axios';

// Same-origin by default (backend serves the built app, or CRA proxies in dev).
// Set REACT_APP_API_URL only when the API lives on a different domain.
const api = axios.create({ baseURL: `${process.env.REACT_APP_API_URL || ''}/api` });

const TOKEN_KEY = 'twin_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

api.interceptors.request.use(config => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Only a 401 from OUR auth (expired/invalid session) logs the user out.
// The App listens for this event — no hard page reload needed.
api.interceptors.response.use(
  res => res,
  err => {
    const PUBLIC = ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password'];
    const isLoginCall = PUBLIC.some(p => err.config?.url?.startsWith(p));
    if (err.response?.status === 401 && !isLoginCall) {
      clearToken();
      window.dispatchEvent(new Event('twin:logout'));
    }
    return Promise.reject(err);
  }
);

// Human-friendly message from any API error.
export function errorMessage(err, fallback = 'Something went wrong — please try again.') {
  return err?.response?.data?.error || (err?.request && !err?.response ? 'Cannot reach the server.' : fallback);
}

export default api;
