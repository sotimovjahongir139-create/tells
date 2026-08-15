import axios from 'axios';

// Local dev: VITE_BACKEND_URL points at the standalone backend (localhost:4000),
// API_BASE_PATH stays '/api'. Production build (served under the gateway's
// /ai-sales/ path): VITE_BACKEND_URL is empty (relative to current origin) and
// VITE_API_BASE_PATH is '/ai-sales/api', matching the gateway's proxy prefix.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000';
const API_BASE_PATH = import.meta.env.VITE_API_BASE_PATH || '/api';
const LOGIN_PATH = `${import.meta.env.BASE_URL}login`.replace(/\/+/g, '/');

const api = axios.create({
  baseURL: `${BACKEND_URL}${API_BASE_PATH}`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      if (window.location.pathname !== LOGIN_PATH) {
        window.location.href = LOGIN_PATH;
      }
    }
    return Promise.reject(err);
  }
);

export default api;
