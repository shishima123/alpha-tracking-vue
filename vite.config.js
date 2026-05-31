import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  // GitHub Pages project site is served from /<repo>/. The deploy workflow sets
  // VITE_BASE=/<repo>/ ; local dev / custom domain default to root.
  base: process.env.VITE_BASE || '/',
  plugins: [vue()],
  server: {
    host: '127.0.0.1',
    port: 5300,
    strictPort: false,
  },
});
