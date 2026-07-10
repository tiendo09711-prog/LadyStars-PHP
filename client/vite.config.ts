import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // When running `npm run dev` from project root:
      //   - Laravel backend on http://127.0.0.1:8000
      //   - Vite client on 5173 proxies /api → 8000 automatically
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
