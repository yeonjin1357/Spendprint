import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API = 'http://127.0.0.1:4780';

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/web', emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: API,
        changeOrigin: true,
        // The API only accepts its own origin; in development the page comes from Vite's port.
        configure: (proxy) => {
          proxy.on('proxyReq', (req) => {
            if (req.getHeader('origin')) req.setHeader('origin', API);
          });
        },
      },
    },
  },
});
