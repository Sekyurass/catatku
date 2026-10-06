# Catatku

Aplikasi pencatatan keuangan pribadi untuk mahasiswa & pekerja muda di Indonesia.
Target: catat transaksi < 10 detik, lihat sisa uang, pahami pola belanja bulanan.

Status: **Fase 0 (MVP) selesai** — onboarding, dompet, kategori, transaksi, transfer, dashboard, anggaran,
ekspor CSV, profil, event analitik ringan, E2E + audit aksesibilitas.

## Dukungan perangkat

Mobile-first mulai lebar 360px; satu basis kode responsif dengan Tailwind CSS 4:

| Lebar             | Perangkat                        | Navigasi                                  |
| ----------------- | -------------------------------- | ----------------------------------------- |
| < 768px           | HP Android / iPhone (portrait)   | Bottom nav 5 slot, tombol **+** di tengah |
| 768–1023px (`md`) | Tablet, iPad, HP landscape       | Rail ikon 80px di kiri                    |
| ≥ 1024px (`lg`)   | Desktop / laptop, iPad landscape | Sidebar penuh 240px, konten maks 1100px   |

- Safe area iPhone (notch, home indicator) dihormati lewat `env(safe-area-inset-*)` + `viewport-fit=cover`.
- Input memakai font 16px (tanpa auto-zoom iOS), target sentuh ≥ 44px, `<select>` & input tanggal diseragamkan lintas browser.
- Browser minimum (baseline Tailwind 4): Safari/iOS 16.4+, Chrome/Android 111+, Firefox 128+.

## Struktur

```
apps/
  api/       Express 5 + Prisma 6 (PostgreSQL/Supabase)
    prisma/        schema.prisma, migrations/, seed.ts
    src/
      config/      env tervalidasi Zod
      lib/         prisma, logger (pino), error, token, password, uang
      middleware/  auth, error handler, rate limit
      modules/     <fitur>/{routes,controller,service}.ts
      db/          data default (kategori, feature flag)
    test/          Vitest + Supertest (DB tes terpisah)
  web/       React 19 + Vite 7 + Tailwind 4 + TanStack Query
    src/
      components/ui/  Button, Field, Card, Toast, Skeleton, EmptyState, ...
      components/charts/  donut kategori & tren (Recharts, di-lazy-load)
      layouts/        AppLayout (bottom nav HP, rail tablet, sidebar desktop)
      lib/            api client (auto refresh token), auth context
      pages/          halaman per rute (di-lazy-load lewat routes/pages.ts)
      routes/         guard auth + daftar rute lazy
    e2e/            Playwright: alur kritis, hapus+urungkan, axe + target sentuh
packages/
  shared/    Skema Zod, tipe DTO, util Rupiah & bulan (dipakai api + web)
```

## Menjalankan

Prasyarat: Node ≥ 20.19, npm ≥ 10, database PostgreSQL (Supabase atau lokal).

```bash
npm install
cp apps/api/.env.example apps/api/.env   # isi DATABASE_URL, DIRECT_URL, TEST_DATABASE_URL, JWT_ACCESS_SECRET
npm run db:deploy                        # terapkan migrasi
npm run db:seed                          # kategori default, feature flag, akun demo
npm run dev                              # API :4000 + web :5173
```

Buka http://localhost:5173 dan masuk dengan akun demo **demo@catatku.id / demo12345**
(sudah berisi 3 dompet, transaksi 6 bulan, transfer, dan anggaran berlanjut). Akun baru dari halaman **Daftar**
langsung diarahkan ke onboarding 3 langkah di `/mulai`: sambutan → dompet pertama → transaksi pertama
(bisa dilewati kapan saja).

### Tes E2E

```bash
npx playwright install chromium      # sekali saja; atau pakai browser terpasang:
PW_CHANNEL=msedge npm run test:e2e   # PowerShell: $env:PW_CHANNEL='msedge'; npm run test:e2e
```

Playwright memakai dev server yang sedang berjalan (atau menyalakan `npm run dev` sendiri) dan database
dari `apps/api/.env`. Setiap tes membuat akun baru `e2e-…@contoh.id`. Rate limit daftar/masuk default 20 per
15 menit per IP — naikkan `AUTH_RATE_LIMIT` di `.env` bila menjalankan E2E berulang kali.

### Supabase

Di Supabase Dashboard → _Connect_ → _ORMs/Prisma_ (atau Project Settings → Database):

| Variabel            | Isi                                                                    |
| ------------------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`      | Transaction pooler, port **6543**, tambahkan `?pgbouncer=true`         |
| `DIRECT_URL`        | Session pooler, port **5432** (dipakai migrasi)                        |
| `TEST_DATABASE_URL` | Sama dengan `DIRECT_URL` + `?schema=catatku_test` (skema terpisah tes) |

Hanya database Supabase yang dipakai; autentikasi tetap JWT milik API (bukan Supabase Auth).

### Alternatif lokal

`docker compose up -d db` lalu pakai URL lokal yang dikomentari di `.env.example`.

## Skrip

| Perintah             | Fungsi                                                       |
| -------------------- | ------------------------------------------------------------ |
| `npm run dev`        | API (tsx watch) + web (Vite) bersamaan                       |
| `npm run build`      | Build API (tsup) dan web (Vite)                              |
| `npm run typecheck`  | `tsc` di semua workspace                                     |
| `npm run lint`       | ESLint seluruh repo                                          |
| `npm test`           | Tes unit/API semua workspace (API butuh `TEST_DATABASE_URL`) |
| `npm run test:e2e`   | Playwright (HP + desktop) terhadap API & web sungguhan       |
| `npm run db:migrate` | Buat migrasi baru saat skema berubah (dev)                   |
| `npm run db:deploy`  | Terapkan migrasi (CI/produksi)                               |
| `npm run db:seed`    | Seed idempoten; `SEED_DEMO=false` untuk lewati akun demo     |

## Keputusan arsitektur

- **Uang = `BIGINT` Rupiah utuh**, tidak pernah float. Di JSON dikirim sebagai `number` (aman hingga ±9 kuadriliun).
- **`amount` bertanda** sesuai arah uang terhadap dompet (+ masuk, − keluar). Klien mengirim nominal positif; service yang memberi tanda.
- **Saldo dompet dihitung**: `initialBalance + SUM(amount)` untuk transaksi `deletedAt IS NULL`, lewat agregasi SQL — tidak disimpan.
- **Transfer** = 2 baris dengan `transferGroupId` sama, tidak dihitung di laporan pemasukan/pengeluaran.
- **Kategori default** adalah baris dengan `userId = null` (ID tetap, mis. `cat_makan`), dibagi semua pengguna dan tidak bisa diubah.
- **Auth**: access token JWT 15 menit di memori klien; refresh token acak 30 hari di cookie `httpOnly; SameSite=Lax; Path=/api/v1/auth`, disimpan sebagai hash SHA-256 dan **dirotasi** setiap refresh. Pemakaian ulang token lama (di luar jendela 30 detik) mencabut semua sesi pengguna.
- **Isolasi data**: setiap query service difilter `userId` dari token, bukan dari input.
- **Error konsisten**: `{ error: { code, message, fields? } }`; validasi Zod di setiap endpoint.
- **Feature flag** (`FeatureFlag`): `enabled` + `plan` (null/FREE = semua, PREMIUM = berbayar) + allowlist `userIds`, bisa dipaksa via env `FEATURE_FLAGS_FORCE`. Semua flag Fase 1 sudah ada dan nonaktif. Endpoint: `GET /api/v1/features`; middleware `requireFeature(key)` untuk rute fase berikutnya.
- **Idempotensi**: tabel `IdempotencyKey` disiapkan untuk operasi tulis (dipakai mulai M2, penting untuk sinkron offline Fase 1).
- **Monorepo npm workspaces**; `packages/shared` dikonsumsi sebagai sumber TypeScript (tanpa build), dibundel ke API oleh tsup.
- **Versi dikunci** ke mayor yang stabil (Prisma 6, Vite 7, TS 5.9, ESLint 9).
- **Code splitting per rute**: setiap halaman `React.lazy`, dimuat lebih dulu saat browser idle setelah
  masuk (`preloadAppPages`) agar pindah halaman tetap instan. React/router dan pustaka data dipisah ke chunk
  vendor tersendiri (cache awet antar-rilis); Recharts hanya diunduh saat grafik tampil. Chunk aplikasi
  awal ±82 kB (sebelumnya satu bundel 553 kB). Chunk yang gagal diunduh (offline/rilis baru) ditangkap
  error boundary dengan tombol muat ulang.
- **Analitik ringan tanpa pihak ketiga**: tabel `AnalyticsEvent { userId, name, props }`, ditulis
  _fire-and-forget_ (gagal mencatat tidak pernah menggagalkan request). `props` hanya berisi enum/angka
  kecil — tidak ada nominal, nama dompet, catatan, atau email.
- **Foto profil di Postgres, bukan object storage**: browser memotong tengah, memperkecil ke 384×384, dan
  mengompres ke WebP (fallback JPEG) sehingga ukurannya ±20–40 kB. Byte disimpan di tabel terpisah
  `UserAvatar` agar query `User` biasa tidak ikut memuat gambar; `User.avatarUpdatedAt` menjadi versi cache.
  Server memeriksa jenis file dari _magic bytes_ (bukan header) dan menolak > 300 kB. Bila nanti volume
  foto besar, pindah ke Supabase Storage cukup mengganti `avatar.service.ts`.
- **Email lewat antarmuka `Mailer`** (`lib/mailer.ts`, Nodemailer): SMTP apa pun bila `SMTP_HOST` diisi
  (Gmail App Password / Brevo gratis); tanpa SMTP, saat development isi email dicetak di log API, di
  production dicatat sebagai error tanpa membocorkan isi; saat tes ditampung di `testOutbox`. Pengiriman
  tidak ditunggu agar waktu respons tidak membedakan email terdaftar atau tidak.
- **Mode gelap** (disetujui lebih awal dari Fase 4): pilihan Terang/Gelap/Sistem di Profil, disimpan per
  perangkat di `localStorage` (`catatku_theme`), tanpa kolom database. Skrip kecil di `index.html`
  memasang `data-theme` sebelum React dimuat agar tidak berkedip. Komponen hanya memakai token CSS;
  di tema gelap primer berwarna terang sehingga teks di atasnya memakai `--on-primary`, sedangkan
  permukaan merek besar memakai `--brand`. Warna kategori dicerahkan otomatis lewat `color-mix`.
  Audit axe E2E berjalan di kedua tema.

## API (Fase 0)

Base: `/api/v1`. Status endpoint ditandai ✅ bila sudah tersedia.

- ✅ `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`
- ✅ `POST /auth/forgot-password` `{ email }` → selalu 204 (tidak membocorkan email terdaftar; maks 1 email/menit/akun),
  `POST /auth/reset-password` `{ token, password }` → sesi baru + cookie refresh; semua sesi lain dicabut.
  Token sekali pakai, berlaku 30 menit, disimpan sebagai hash; tautan memakai fragmen
  `/atur-ulang-kata-sandi#token=…` agar token tidak terkirim ke server/log/Referer
- ✅ `GET/PATCH /me` (ubah nama/email; ganti email wajib `currentPassword`), `PUT /me/password` (mengakhiri semua sesi lain, membalas sesi baru + cookie refresh)
- ✅ `GET/PUT/DELETE /me/avatar` — PUT berisi byte gambar mentah (`Content-Type: image/webp|jpeg|png`,
  maks 300 kB) → `{ user }`; GET mengembalikan gambar (klien memakai `?v=<avatarUpdatedAt>` untuk cache)
- ✅ `GET /features`, `GET /health` (di root)
- ✅ `POST /events` body `{ name: "onboarding_completed" | "onboarding_skipped", step?: 1–3 }` → 204
  (hanya event klien yang terdaftar; event lain dicatat server sendiri)
- ✅ `GET/POST/PATCH/DELETE /wallets` (`?includeArchived=true`; DELETE mengarsipkan dompet yang punya riwayat)
- ✅ `GET/POST/PATCH/DELETE /categories` (`?type=`; kategori bawaan hanya-baca → 403)
- ✅ `GET /transactions` (`from,to,categoryId,walletId,type,q,cursor,limit`), `GET/PATCH/DELETE /transactions/:id`,
  `POST /transactions/:id/restore`, `POST /transactions/transfer`
  - `POST` mendukung header `Idempotency-Key` (respons sukses disimpan 24 jam; permintaan ulang dikirim ulang apa adanya)
  - Semua data terisolasi per pengguna: id milik pengguna lain diperlakukan sebagai 404
- ✅ `GET /reports/summary?month=` (total saldo dompet aktif, pemasukan, pengeluaran, selisih, 5 transaksi terakhir),
  `GET /reports/by-category?month=&type=EXPENSE|INCOME`, `GET /reports/trend?months=6` (1–24, bulan kosong diisi 0)
  - Transfer tidak dihitung sebagai pemasukan/pengeluaran; dashboard < 1 detik untuk 10.000 transaksi (diuji)
- ✅ `GET /budgets?month=` (semua kategori pengeluaran aktif + anggaran & realisasinya; tanpa anggaran → `id: null`),
  `PUT /budgets` body `{ month, items: [{ categoryId, limitAmount }] }` (upsert massal; `limitAmount: 0` menghapus; idempoten)
  - Status: `ok` < 80%, `warning` 80–99%, `over` ≥ 100%. Hanya kategori pengeluaran yang aktif yang bisa dianggarkan
  - **Anggaran berlanjut**: baris `Budget(month)` berlaku mulai bulan itu sampai ada baris yang lebih baru
    (`since` di respons = bulan asalnya). Mengubah bulan X tidak mengubah bulan sebelum X; menghentikan
    anggaran warisan disimpan sebagai baris `limitAmount = 0` (tanpa migrasi skema)
  - `scope: "month"` per item = ubah/kosongkan **hanya bulan itu**: nilai yang tadinya berlaku di bulan
    berikutnya dikunci dengan baris baru di bulan berikutnya (`endsThisMonth: true` di respons). Default `"onward"`
- ✅ `GET /export/transactions.csv` (filter sama dengan `GET /transactions`, tanpa `cursor/limit`)
  - UTF-8 + BOM, pemisah koma, baris `CRLF`; kolom `Tanggal,Jenis,Kategori,Dompet,Dompet lawan,Jumlah,Catatan`
  - `Jumlah` bilangan bulat Rupiah bertanda; transfer muncul dua baris (keluar/masuk) dengan dompet lawannya
  - Dikirim bertahap per 500 baris (streaming); teks berawalan `= + - @` diberi awalan `'` (anti CSV injection)

## Event analitik & gerbang fase

| Event                                        | Dicatat oleh           | `props`                          |
| -------------------------------------------- | ---------------------- | -------------------------------- |
| `user_registered`, `user_logged_in`          | API auth               | –                                |
| `wallet_created`                             | API                    | `type` (CASH/BANK/EWALLET)       |
| `transaction_created`                        | API                    | `type` (EXPENSE/INCOME/TRANSFER) |
| `budget_saved`                               | API                    | `items`, `monthOnly` (jumlah)    |
| `export_csv`                                 | API                    | –                                |
| `onboarding_completed`, `onboarding_skipped` | Klien (`POST /events`) | `step` (1–3)                     |

Contoh kueri untuk menilai gerbang Fase 0 → Fase 1 (jalankan di SQL editor Supabase):

```sql
-- Aktivasi: pendaftar 30 hari terakhir yang mencatat transaksi ≤ 24 jam setelah daftar
SELECT COUNT(*) AS daftar,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM "AnalyticsEvent" t
         WHERE t."userId" = r."userId" AND t.name = 'transaction_created'
           AND t."createdAt" <= r."createdAt" + interval '24 hours')) AS aktif_24_jam
FROM "AnalyticsEvent" r
WHERE r.name = 'user_registered' AND r."createdAt" >= now() - interval '30 days';

-- Retensi minggu ke-2: pendaftar yang masih mencatat di hari ke-7 s.d. ke-13
SELECT COUNT(DISTINCT r."userId") AS kohort,
       COUNT(DISTINCT t."userId") AS kembali_minggu_2
FROM "AnalyticsEvent" r
LEFT JOIN "AnalyticsEvent" t
  ON t."userId" = r."userId" AND t.name = 'transaction_created'
 AND t."createdAt" BETWEEN r."createdAt" + interval '7 days' AND r."createdAt" + interval '14 days'
WHERE r.name = 'user_registered'
  AND r."createdAt" BETWEEN now() - interval '44 days' AND now() - interval '14 days';

-- Onboarding: selesai vs dilewati, per langkah
SELECT name, props->>'step' AS langkah, COUNT(*)
FROM "AnalyticsEvent"
WHERE name IN ('onboarding_completed', 'onboarding_skipped')
GROUP BY 1, 2 ORDER BY 1, 2;
```

## Definition of Done — Fase 0

- [x] Alur kritis **daftar → buat dompet → catat → lihat dashboard** lolos E2E (`e2e/critical-flow.spec.ts`)
- [x] Hapus transaksi + **Urungkan** lolos E2E
- [x] Tanpa error TypeScript & ESLint (`npm run typecheck`, `npm run lint`)
- [x] Tes unit web, tes API (termasuk isolasi antar-pengguna), dan E2E hijau
- [x] Setiap layar punya state memuat (skeleton), kosong (ilustrasi + CTA), error (pesan + **Coba lagi**), sukses (toast)
- [x] Aksesibilitas: axe WCAG 2.1 AA bersih di semua halaman (HP & desktop), target sentuh ≥ 44px diuji otomatis,
      label di setiap input, fokus keyboard terlihat, status tidak hanya lewat warna (tanda +/−, ikon, teks),
      `prefers-reduced-motion` dihormati, format `6 Okt 2026` & `Rp 1.250.000`
- [x] README: setup, env, skrip, struktur, keputusan arsitektur
- [x] Seed demo mencakup semua fitur Fase 0
- [x] Event analitik ringan untuk gerbang fase, tanpa data sensitif
