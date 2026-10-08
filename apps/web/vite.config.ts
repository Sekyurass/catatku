import { createReadStream, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { DEFAULT_DESCRIPTION, INDEXABLE_PATHS } from './src/lib/pageMeta';

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

/**
 * robots.txt, sitemap.xml, serta tag yang wajib URL absolut (canonical, og:url, og:image, JSON-LD).
 * Alamat situs: VITE_SITE_URL, atau domain produksi yang disediakan Vercel saat build. Tanpa
 * keduanya hanya robots.txt yang dibuat (tanpa baris Sitemap).
 */
function seoFiles(): Plugin {
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const siteUrl = (
    process.env.VITE_SITE_URL || (vercelHost ? `https://${vercelHost}` : '')
  ).replace(/\/$/, '');

  return {
    name: 'catatku-seo',
    config: () => ({
      define: { 'import.meta.env.VITE_SITE_URL': JSON.stringify(siteUrl) },
    }),
    transformIndexHtml() {
      if (!siteUrl) return [];
      const meta = (property: string, content: string) => ({
        tag: 'meta',
        attrs: { property, content },
        injectTo: 'head' as const,
      });
      const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Catatku',
        url: `${siteUrl}/`,
        description: DEFAULT_DESCRIPTION,
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Web',
        inLanguage: 'id-ID',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'IDR' },
      };
      return [
        { tag: 'link', attrs: { rel: 'canonical', href: `${siteUrl}/daftar` }, injectTo: 'head' },
        meta('og:url', `${siteUrl}/daftar`),
        meta('og:image', `${siteUrl}/og-image.png`),
        {
          tag: 'meta',
          attrs: { name: 'twitter:image', content: `${siteUrl}/og-image.png` },
          injectTo: 'head',
        },
        {
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          children: JSON.stringify(jsonLd),
          injectTo: 'head',
        },
      ];
    },
    generateBundle() {
      const robots = ['User-agent: *', 'Allow: /', 'Disallow: /api/'];
      if (siteUrl) robots.push('', `Sitemap: ${siteUrl}/sitemap.xml`);
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `${robots.join('\n')}\n` });
      if (!siteUrl) return;
      const urls = INDEXABLE_PATHS.map((p) => `  <url><loc>${siteUrl}${p}</loc></url>`).join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), tesseractAssets(), seoFiles()],
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
