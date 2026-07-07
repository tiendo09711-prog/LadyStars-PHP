import axios from 'axios';

// API base resolution:
// - VITE_API_URL takes highest priority (for custom deploys)
// - In development we default to relative '/api' (works great with Vite proxy to Laravel :8000)
// - Fallback explicit 8000 only if someone runs client dev without proxy
const apiBaseUrl = import.meta.env.VITE_API_URL
  ?? (import.meta.env.DEV ? '/api' : '/api');

export const http = axios.create({ baseURL: apiBaseUrl });
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
