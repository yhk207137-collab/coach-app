import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';
const api = axios.create({ baseURL: BASE_URL });

// 401s from these endpoints mean "wrong credentials/code", not "session expired".
const CREDENTIAL_ENDPOINTS = ['/auth/login', '/auth/magic', '/auth/otp', '/auth/reset-password', '/auth/change-password'];

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const url: string = err.config?.url ?? '';
    const isCredentialCall = CREDENTIAL_ENDPOINTS.some((p) => url.startsWith(p));
    if (err.response?.status === 401 && !isCredentialCall) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
