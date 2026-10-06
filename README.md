# Catatku

Aplikasi pencatatan keuangan pribadi untuk mahasiswa & pekerja muda di Indonesia.
Target: catat transaksi < 10 detik, lihat sisa uang, pahami pola belanja bulanan.

Status: **Fase 0 (MVP) — M2 selesai** (dompet, kategori, transaksi, transfer).

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
      layouts/        AppLayout (sidebar desktop, bottom nav mobile)
      lib/            api client (auto refresh token), auth context
      pages/          halaman per rute
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

Buka http://localhost:5173 dan masuk dengan akun demo **demo@catatku.id / demo12345**.

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

## API (Fase 0)

Base: `/api/v1`. Status endpoint ditandai ✅ bila sudah tersedia.

- ✅ `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`
- ✅ `GET /features`, `GET /health` (di root)
- ✅ `GET/POST/PATCH/DELETE /wallets` (`?includeArchived=true`; DELETE mengarsipkan dompet yang punya riwayat)
- ✅ `GET/POST/PATCH/DELETE /categories` (`?type=`; kategori bawaan hanya-baca → 403)
- ✅ `GET /transactions` (`from,to,categoryId,walletId,type,q,cursor,limit`), `GET/PATCH/DELETE /transactions/:id`,
  `POST /transactions/:id/restore`, `POST /transactions/transfer`
  - `POST` mendukung header `Idempotency-Key` (respons sukses disimpan 24 jam; permintaan ulang dikirim ulang apa adanya)
  - Semua data terisolasi per pengguna: id milik pengguna lain diperlakukan sebagai 404
- ⏳ `GET /reports/summary|by-category|trend` (M3)
- ⏳ `GET/PUT /budgets`, `GET /export/transactions.csv` (M4)
