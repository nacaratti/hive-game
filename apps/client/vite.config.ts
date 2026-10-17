import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SERVER = process.env.HIVE_SERVER ?? 'http://localhost:4242';

export default defineConfig({
  // The web build for Vercel lives under /jogar/ next to the download page.
  base: process.env.HIVE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target: SERVER, ws: true },
      '/api': SERVER,
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
