# Rencana deploy ke Vercel (disimpan, belum dikerjakan)

Status: **disetujui arahnya, ditunda**. Paket: **Vercel Hobby**; jadwal per jam dipicu dari
**Supabase pg_cron + pg_net**.

## Bentuk

Satu proyek Vercel, region `bom1` (Mumbai, sama dengan Supabase `ap-south-1`). Web = file statis hasil
`vite build`; `/api/*` = satu fungsi yang menjalankan app Express yang sudah ada. Satu domain, jadi cookie
refresh (`sameSite: lax`, `path: /api/v1/auth`) dan CORS tidak berubah.

## Pekerjaan

1. **Express sebagai fungsi**: `api/index.ts` mengekspor `createApp()` tanpa `listen()`; API dibundel tsup
   (paket `@catatku/shared` berupa sumber TS) lalu diimpor fungsi. `vercel.json`: `regions: ["bom1"]`,
   rewrite `/api/(.*)`, output `apps/web/dist`, fallback SPA ke `index.html`. `npm run dev` lokal tetap.
2. **Penjadwal → endpoint cron**: `POST /api/v1/cron/recurring` (menit ke-5 tiap jam) dan
   `POST /api/v1/cron/reminders` (tiap jam), header `Authorization: Bearer <CRON_SECRET>`, selain itu 404.
   Job sudah idempoten. Lokal: `node-cron` di dalam proses tetap jalan; di Vercel `SCHEDULER_ENABLED=false`.
   Pemicu di Supabase (SQL editor, sekali):
   ```sql
   create extension if not exists pg_cron;
   create extension if not exists pg_net;
   select cron.schedule('catatku-reminders', '0 * * * *', $$
     select net.http_post(url := 'https://<domain>/api/v1/cron/reminders',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'));
   $$);
   select cron.schedule('catatku-recurring', '5 * * * *', $$
     select net.http_post(url := 'https://<domain>/api/v1/cron/recurring',
       headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>'));
   $$);
   ```
   (Simpan `CRON_SECRET` di Supabase Vault bila memungkinkan, bukan teks polos di definisi job.)
3. **Pekerjaan setelah respons**: helper `runInBackground(promise)` memakai `waitUntil` dari
   `@vercel/functions` di Vercel, perilaku lama di lokal. Dipakai untuk `track()`, belajar kategori,
   impor CSV > 300 baris, dan pembersihan Idempotency-Key. Impor macet > 15 menit sudah otomatis gagal.
4. **Prisma**: `binaryTargets = ["native", "rhel-openssl-3.0.x"]`; `prisma generate` di build; migrasi
   dijalankan manual/CI dengan `DIRECT_URL`, bukan saat build Vercel.
5. **Env production**:
   - `DATABASE_URL` = transaction pooler **6543** `?pgbouncer=true&connection_limit=1`
     (lokal memakai 5432; lihat komentar di `apps/api/.env`)
   - `DIRECT_URL` (5432), `JWT_ACCESS_SECRET`, `CORS_ORIGINS` & `APP_URL` = domain Vercel, `TRUST_PROXY=1`,
     `SCHEDULER_ENABLED=false`, `CRON_SECRET`, SMTP, VAPID
   - `STORAGE_S3_*` (lampiran foto). Unggahan lampiran dibatasi 4 MB agar di bawah batas body Vercel 4,5 MB;
     pembersihan lampiran yatim ikut `runNotifications`, jadi ikut terpanggil oleh pg_cron.
   - Bagian "Deploy" di README

## Risiko

- Rate limit auth disimpan di memori tiap instans → lebih longgar di serverless. Cukup untuk awal; bisa
  dipindah ke Postgres bila perlu.
- Batas body fungsi 4,5 MB (impor CSV maks. 1 MB, avatar 300 kB: aman). Ekspor CSV streaming didukung.
- Deploy sungguhan dilakukan dari akun pengguna; uji lokal dengan `vercel dev` atau memanggil handler.
