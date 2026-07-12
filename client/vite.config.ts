import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Listen on all interfaces so phones/tablets on the same Wi‑Fi can open
    // http://<pc-lan-ip>:5173 (shown as "Network" in the Vite banner).
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // When running `npm run dev` from project root:
      //   - Laravel listens on 0.0.0.0:8000 (reachable on this machine as 127.0.0.1)
      //   - Client uses relative VITE_API_URL=/api so any host (localhost or LAN IP)
      //     stays same-origin; Vite proxies /api → Laravel → MySQL on the PC.
      //   - Proxy target stays 127.0.0.1 because the proxy runs on the PC, not the phone.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ['recharts'],
  },
  resolve: {
    alias: {},
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
