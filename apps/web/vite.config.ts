import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Pustaka inti dipisah dari kode aplikasi supaya tetap ter-cache antar-rilis.
const VENDOR_CHUNKS: Record<string, string[]> = {
  react: ['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom'],
  data: ['@tanstack', 'zod', 'react-hook-form', '@hookform'],
};

function vendorChunk(id: string) {
  const match = /node_modules[\\/]((?:@[^\\/]+)|[^\\/]+)/.exec(id);
  if (!match) return undefined;
  const pkg = match[1];
  return Object.keys(VENDOR_CHUNKS).find((name) => VENDOR_CHUNKS[name]!.includes(pkg!));
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: { output: { manualChunks: vendorChunk } },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/health': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
