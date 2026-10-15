import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the API is proxied so the browser sees ONE origin (cookies + CSRF just work).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_DEV_API ?? 'http://localhost:4000', changeOrigin: false } },
  },
  build: { sourcemap: false, target: 'es2020' },
});
