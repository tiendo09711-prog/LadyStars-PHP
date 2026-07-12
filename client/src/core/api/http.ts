import axios from 'axios';

/**
 * Resolve API base URL so LAN devices work without env changes.
 *
 * - Prefer VITE_API_URL when set (deploy / custom setups).
 * - In the browser during DEV: if the page is opened via a non-loopback host
 *   (e.g. http://192.168.x.x:5173) but VITE_API_URL points at 127.0.0.1/localhost,
 *   rewrite to relative `/api` so requests hit the Vite proxy on the PC
 *   (which then reaches Laravel → MySQL). Phones cannot use the PC's loopback.
 * - Default: `/api` (same-origin; Vite proxies to Laravel :8000 in dev).
 */
function resolveApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  const fallback = '/api';

  if (!envUrl) return fallback;

  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    const isLoopbackApi =
      /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(envUrl);
    const pageHost = window.location.hostname;
    const isLoopbackPage =
      pageHost === 'localhost' ||
      pageHost === '127.0.0.1' ||
      pageHost === '[::1]' ||
      pageHost === '::1';

    if (isLoopbackApi && !isLoopbackPage) {
      return fallback;
    }
  }

  return envUrl;
}

const apiBaseUrl = resolveApiBaseUrl();

export const http = axios.create({ baseURL: apiBaseUrl });
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
