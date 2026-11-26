import axios from 'axios';

// Set REACT_APP_API_URL only if the API is on another domain.
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

// A 401 from our API means the session expired.
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

export function errorMessage(err, fallback = 'Something went wrong — please try again.') {
  return err?.response?.data?.error || (err?.request && !err?.response ? 'Cannot reach the server.' : fallback);
}

export default api;
