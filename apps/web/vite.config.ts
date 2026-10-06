import { createReadStream, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
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

/**
 * Worker, core WASM, dan data bahasa Tesseract disajikan dari origin sendiri (bukan CDN), di folder
 * bernomor versi agar aman di-cache selamanya. Hanya diunduh saat pengguna menekan "Pindai struk".
 */
function tesseractAssets(): Plugin {
  const require = createRequire(import.meta.url);
  const pkgDir = (name: string) => dirname(require.resolve(`${name}/package.json`));
  const tesseract = pkgDir('tesseract.js');
  const core = pkgDir('tesseract.js-core');
  const { version } = JSON.parse(readFileSync(join(tesseract, 'package.json'), 'utf8')) as {
    version: string;
  };
  const base = `tesseract/${version}`;
  const files: Record<string, string> = {
    'worker.min.js': join(tesseract, 'dist', 'worker.min.js'),
    // Isinya tetap gzip (Tesseract mengenali dari magic number), tapi tanpa ekstensi .gz yang
    // sering diblokir antivirus/proxy sebagai unduhan arsip.
    'lang/ind.traineddata': join(
      pkgDir('@tesseract.js-data/ind'),
      '4.0.0_best_int',
      'ind.traineddata.gz',
    ),
  };
  for (const variant of ['lstm', 'simd-lstm', 'relaxedsimd-lstm']) {
    const name = `tesseract-core-${variant}.wasm.js`;
    files[`core/${name}`] = join(core, name);
  }

  return {
    name: 'catatku-tesseract-assets',
    config: () => ({
      define: { 'import.meta.env.VITE_TESSERACT_PATH': JSON.stringify(`/${base}`) },
    }),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]!;
        const file = path.startsWith(`/${base}/`) ? files[path.slice(base.length + 2)] : undefined;
        if (!file) return next();
        res.setHeader(
          'Content-Type',
          file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream',
        );
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const [name, file] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName: `${base}/${name}`, source: readFileSync(file) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), tesseractAssets()],
  // Diimpor dinamis; tanpa ini Vite dev me-reload halaman saat pindaian pertama.
  optimizeDeps: { include: ['tesseract.js'] },
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
