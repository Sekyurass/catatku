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
(sudah berisi 3 dompet, transaksi 6 bulan, transfer, anggaran berlanjut, dan 4 transaksi berulang:
gaji, kos, pulsa otomatis, serta listrik yang menunggu konfirmasi bulan ini; plus 4 template cepat catat:
kopi susu, Gojek ke kantor, parkir, dan makan siang tanpa nominal).

Fitur Fase 1, target tabungan (Fase 2.1), tag & lampiran (Fase 2.5), pindai struk (Fase 3.1), dan saran
kategori (Fase 3.2) berada di balik feature flag yang **nonaktif** setelah seed. Untuk menyalakannya:

```sql
-- Untuk semua pengguna (SQL editor Supabase / psql). Baris flag dibuat oleh `npm run db:seed`.
UPDATE "FeatureFlag" SET enabled = true
WHERE key IN ('recurring_transactions', 'reminders', 'templates', 'csv_import', 'receipt_ocr', 'auto_category',
              'tags', 'attachments', 'savings_goals');
```

atau tanpa menyentuh DB: `FEATURE_FLAGS_FORCE=recurring_transactions:on,reminders:on,templates:on,csv_import:on,receipt_ocr:on,auto_category:on,tags:on,attachments:on,savings_goals:on` di `apps/api/.env` (restart API).
Notifikasi push butuh kunci VAPID di `.env` (lihat `.env.example`); tanpa itu lonceng dan pengingat tetap jalan.
Lampiran foto butuh `STORAGE_S3_*` (lihat [Lampiran foto](#lampiran-foto-supabase-storage)); tanpa itu flag
`attachments` selalu dianggap mati. Akun baru dari halaman **Daftar**
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

**Ketahanan koneksi** (`apps/api/src/lib/dbConnection.ts`):

- Bila belum ditulis di URL, API (dan tes) menambah `connect_timeout=15&pool_timeout=20` (bawaan Prisma
  5/10 detik terlalu ketat: membuka koneksi ke region lain saja ±1 detik). Jangan menurunkan
  `connection_limit` tes: dengan 5 koneksi, tes impor 2× lebih lambat dan sesekali timeout.
- Operasi **baca** yang gagal mendapat koneksi (P1001/P1002/P2024, artinya kueri belum sempat jalan)
  diulang otomatis 2× (jeda 0,3 dtk lalu 1 dtk). Penulisan tidak diulang per operasi karena bisa berada di
  dalam batch `$transaction`; bila tetap gagal API membalas **503 `SERVICE_UNAVAILABLE`** + `Retry-After`
  (bukan 500), lalu klien mengulang kueri; pembuatan data dilindungi `Idempotency-Key`.
- Flag fitur dan paket pengguna di-cache 30 detik di memori (mati saat tes), jadi rute ber-flag tidak
  menambah 2 kueri per request. Mengubah flag lewat SQL berlaku paling lambat 30 detik kemudian.
- Kecepatan ditentukan jumlah perjalanan ke database, bukan beratnya kueri. Dengan `pgbouncer=true`
  (transaction pooler 6543) Prisma membungkus **setiap** kueri dengan `BEGIN; DEALLOCATE ALL; …; COMMIT`
  (4 perjalanan); di session pooler 5432 cukup 1. Terukur dari Indonesia ke `ap-south-1`: GET biasa
  ±620–970 ms (6543) vs ±125–260 ms (5432). Untuk satu server Node yang berjalan terus (bukan serverless),
  session pooler lebih cocok; transaction pooler perlu untuk banyak instans/serverless. Hindari juga
  `include` pada `create` di jalur yang sering dipakai (BEGIN + INSERT + 1 SELECT per relasi + COMMIT).

### Lampiran foto (Supabase Storage)

Foto lampiran disimpan di object storage lewat **protokol S3**, jadi pindah ke Cloudflare R2 (atau S3 lain)
cukup mengganti env, tanpa mengubah kode:

1. Supabase Dashboard → _Storage_ → **New bucket**, mis. `lampiran`, **Public bucket: mati** (privat).
2. _Storage_ → _Settings_ → aktifkan **S3 protocol** → **New access key**.
3. Isi di `apps/api/.env` (jangan di-commit; kunci ini melewati RLS dan hanya untuk server):

| Variabel                       | Isi                                                       |
| ------------------------------ | --------------------------------------------------------- |
| `STORAGE_S3_ENDPOINT`          | `https://<project-ref>.storage.supabase.co/storage/v1/s3` |
| `STORAGE_S3_REGION`            | Region proyek, mis. `ap-south-1`                          |
| `STORAGE_S3_BUCKET`            | `lampiran`                                                |
| `STORAGE_S3_ACCESS_KEY_ID`     | Access key ID dari langkah 2                              |
| `STORAGE_S3_SECRET_ACCESS_KEY` | Secret access key dari langkah 2                          |

Untuk R2: endpoint `https://<account-id>.r2.cloudflarestorage.com`, region `auto`. Restart API setelah mengisi.

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
- **Transaksi berulang** (Fase 1.1, flag `recurring_transactions`): aturan menyimpan jadwal
  (`startDate` + `frequency` harian/mingguan/bulanan/tahunan + `interval` 1–99) dan indeks kejadian
  berikutnya. Tanggal ke-n selalu dihitung dari `startDate`, jadi "tanggal 31" jatuh di akhir bulan pada
  bulan pendek lalu kembali ke 31 (tidak bergeser), dan 29 Feb jatuh ke 28 Feb di tahun biasa.
  - **Penjadwal `node-cron` di proses API** (`jobs/scheduler.ts`): sekali saat start lalu tiap jam menit ke-5,
    zona `Asia/Jakarta`. Tanpa layanan tambahan; cocok untuk satu instance. Bila nanti diskalakan, cukup
    pindahkan `runDueRules()` ke cron eksternal yang memanggil endpoint internal.
  - **Idempoten**: setiap kejadian punya baris `RecurringOccurrence` unik per `(ruleId, date)`, dan aturan
    dimajukan dengan _optimistic lock_ (`nextIndex` lama sebagai syarat update). Dua proses yang berjalan
    bersamaan atau restart di tengah jalan tidak pernah mencatat dobel.
  - **Catch-up**: bila server mati beberapa hari, kejadian yang terlewat dicatat saat proses berikutnya
    (maks. 62 per aturan per putaran, sisanya di putaran berikut). Aturan baru dengan tanggal mulai di masa
    lalu, aturan yang dilanjutkan setelah dijeda, dan perubahan jadwal **tidak** membuat transaksi mundur.
  - **Mode konfirmasi** (`autoPost = false`): kejadian masuk antrean `PENDING` dan tampil di Beranda untuk
    **Catat** (nominal boleh disesuaikan, mis. tagihan listrik) atau **Lewati**.
  - Dompet/kategori yang diarsipkan otomatis menjeda aturannya; menghapus aturan tidak menghapus transaksi
    yang sudah tercatat (tanda "Berulang" hilang). Transaksi hasil aturan diberi lencana **Berulang**.
- **Notifikasi & pengingat** (Fase 1.2, flag `reminders`): satu tabel `Notification` untuk lonceng,
  dengan `dedupeKey` unik per pengguna sehingga notifikasi yang sama tidak pernah tercatat dua kali
  (aman untuk cron ganda/restart). `notify()` = simpan ke lonceng lalu kirim push ke semua perangkat.
  - **Pengingat harian**: pengguna memilih jam (05.00–23.00 WIB) dan hari. Cron tiap jam tepat mengirim
    pengingat hanya bila hari itu belum ada transaksi yang dicatat manual (transaksi otomatis dari aturan
    berulang tidak dihitung). Maksimal sekali sehari, diklaim lewat `lastReminderDate` (optimistic lock);
    bila server sempat mati, pengingat masih dikirim sampai 2 jam setelah jam pilihan. Saat ini semua jam
    memakai WIB (zona per pengguna belum ada).
  - Transaksi berulang memberi kabar: "menunggu konfirmasi" (lonceng + push) dan "tercatat otomatis"
    (lonceng saja, agar tidak berisik). Notifikasi lebih tua dari 90 hari dihapus otomatis.
  - **Web Push** (`web-push` + VAPID, tanpa layanan pihak ketiga): service worker `public/sw.js` hanya
    menangani `push` dan klik notifikasi (bukan cache offline). Endpoint langganan dibatasi ke layanan push
    resmi (Google, Mozilla, Apple, Microsoft; HTTPS) untuk mencegah SSRF; maks. 10 perangkat per akun;
    langganan yang ditolak layanan (404/410) dihapus otomatis; logout melepas langganan perangkat itu.
  - Keterbatasan: di iPhone/iPad push hanya jalan bila Catatku dipasang ke Layar Utama (iOS 16.4+).
- **Template / cepat catat** (Fase 1.3, flag `templates`): tabel `TransactionTemplate` (nama, jenis,
  nominal opsional, kategori, dompet, `sortOrder`), maks. 20 per pengguna.
  - **Beranda**: kartu **Cepat catat** berisi chip template. Template bernominal langsung dicatat hari ini
    lewat `POST /templates/:id/use` dengan `Idempotency-Key` (tap ganda tidak mencatat dobel) dan toast
    **Urungkan**; template tanpa nominal membuka form yang sudah terisi supaya nominal diisi dulu.
  - **Form catat**: chip **Isi dari template** hanya mengisi form (nominal tetap bisa diubah sebelum Simpan),
    dan centang **Simpan juga sebagai template** membuat template dari transaksi yang baru disimpan
    (nama = catatan, atau nama kategori bila catatan kosong). Tidak menambah langkah pada alur catat biasa.
  - **Halaman `/template`** (dari Profil): tambah, ubah, hapus, dan urutkan dengan tombol naik/turun.
    Transaksi hasil template berdiri sendiri: mengubah/menghapus template tidak mengubah riwayat.
  - Dompet/kategori yang diarsipkan membuat template `usable: false`: disembunyikan dari chip dan ditandai
    di halaman Template sampai diganti ke yang aktif.
- **Impor CSV** (Fase 1.4, flag `csv_import`): halaman `/impor` (dari Profil) berupa wizard 4 langkah
  dengan indikator langkah: **Unggah → Petakan → Periksa → Hasil**.
  - **Parser bersama** (`packages/shared/src/csvImport.ts`): CSV RFC 4180 (kutip, sel multi-baris, BOM,
    CRLF), pemisah `, ; tab |` dideteksi otomatis (Excel Indonesia memakai `;`). Tanggal `dd/mm/yyyy`,
    `mm/dd/yyyy`, `yyyy-mm-dd`, `7 Okt 2026`; jumlah dengan `Rp`, minus depan/belakang, kurung akuntansi,
    pemisah desimal koma/titik (ribuan wajib berkelompok 3 digit agar `1.5` tidak terbaca 15). Fungsi yang
    sama dipakai pratinjau di browser dan pemrosesan di server, jadi pratinjau = hasil.
  - **Petakan**: kolom tanggal, jumlah, keterangan, tipe, dan kategori ditebak dari judul kolom atau isinya;
    format tanggal dan pemisah desimal ditebak dari contoh nilai. Semua bisa diubah, dan pratinjau 20 baris
    pertama langsung diperbarui (baris gagal tampil beserta alasannya). Tanpa kolom tipe: ikuti tanda
    (minus = pengeluaran), atau anggap semua pengeluaran/pemasukan. Kategori dicocokkan per nama (tanpa
    peka huruf besar); yang tidak cocok masuk **Lainnya**. Transfer antardompet belum bisa diimpor.
  - **Periksa** (`POST /imports/preview`, tanpa menulis apa pun): jumlah siap/duplikat/gagal + daftar baris
    bermasalah. **Duplikat** = tanggal + jumlah + catatan sama dengan transaksi yang sudah ada di dompet
    tujuan, dihitung per kemunculan (2 baris identik di file vs 1 di database = 1 duplikat, 1 baru).
    Duplikat dilewati secara default, bisa tetap diimpor.
  - **Impor** (`POST /imports` + `Idempotency-Key`): semua baris masuk dalam **satu transaksi database**,
    jadi impor tidak pernah tersimpan setengah. File > 300 baris dibalas `202 PROCESSING` dan diproses di
    latar belakang; halaman memantau `GET /imports/:id`. Impor yang macet > 15 menit (mis. server mati)
    ditandai gagal.
  - **Batal per impor**: setiap transaksi impor menyimpan `importBatchId` (kolom nullable, migrasi aditif);
    **Batalkan impor** menghapus permanen semua transaksi dari batch itu (termasuk yang sudah diubah) dan
    riwayat impornya tetap ada dengan status Dibatalkan.
  - **Batas**: file maks. 1 MB (dicek di browser dan server; body JSON khusus rute ini dinaikkan ke 3 MB),
    maks. 5.000 baris data, daftar baris bermasalah yang disimpan dipotong di 100.
- **Pindai struk** (Fase 3.1, flag `receipt_ocr`): tombol **Pindai struk** di form pengeluaran baru; di
  perangkat sentuh (`pointer: coarse`) menjadi **Foto struk** (`capture="environment"`, langsung membuka
  kamera belakang) + **Dari galeri**. OCR berjalan **di perangkat** dengan Tesseract.js (WebAssembly), jadi
  foto tidak pernah dikirim ke server atau pihak ketiga. Hasilnya hanya **mengisi** form (nominal, tanggal,
  catatan = `Toko: Barang A, Barang B`, maks. 200 karakter, sisa barang diringkas `+N lainnya`); pengguna
  selalu meninjau lalu menekan Simpan.
  - **Antarmuka `ReceiptParser`** (`apps/web/src/lib/receipt/index.ts`): `parse(foto, { today, signal,
onProgress })` → `{ total, date, merchant, items, text }`, tiap kolom `{ value, confidence: high|low }` atau
    `null`; `items` = daftar nama barang (maks. 12). Implementasi Tesseract (`tesseract.ts`) dimuat lazy hanya saat tombol dipakai; mengganti ke
    layanan OCR server cukup menambah implementasi baru (wajib persetujuan pengguna dulu).
  - **Alur**: validasi (hanya gambar, maks. 15 MB) → diputar sesuai EXIF, diskalakan (sisi panjang ≤ 2000 px),
    grayscale + kontras → Tesseract bahasa `ind` mode _single block_ (mode otomatis membuang teks di bawah
    garis putus-putus struk) → `parseReceiptText()` (fungsi murni berbasis aturan).
  - **Aturan parser** (`parse.ts`): perbaikan salah baca angka (`O→0`, `l→1`, …), total dari kata kunci
    berbobot (GRAND TOTAL > TOTAL BAYAR > TOTAL > JUMLAH; abaikan SUBTOTAL, TOTAL ITEM, DISKON, PPN, TUNAI,
    KEMBALI, dll.) dan dicek silang dengan tunai − kembalian; tanggal `dd/mm/yy`, `yyyy-mm-dd`, `7 Okt 2026`
    (tanggal masa depan atau > 3 tahun diabaikan) dan dicek silang dengan tanggal di nomor struk
    (`…20261007…`) untuk salah baca 7↔1, 8↔0, dll.; toko dari daftar jaringan ritel atau baris pertama yang
    berisi kata sungguhan (teks logo yang terbaca acak dilewati). **Barang**: baris di antara kepala struk
    (baris ber-`:`/tanggal) dan baris TOTAL/SUBTOTAL/TUNAI yang berharga; jumlah di depan, harga, satuan,
    dan sampah OCR setelah harga dibuang; baris pajak/diskon/biaya (PB1, PPN, %, SERVICE, …) dilewati; nama di
    satu baris dengan `1 x 38.500` di baris berikutnya digabung. Kolom yang meragukan ditandai **kurang yakin**
    di form; kolom yang tidak terbaca dibiarkan kosong.
  - **Gagal / tidak terbaca**: form manual tetap terbuka dengan foto bisa diperbesar sebagai acuan. Bila flag
    `attachments` aktif, centang **Lampirkan foto struk** (default tercentang) menyimpan foto itu sebagai
    lampiran transaksi; bila tidak dicentang, foto dibuang dari memori saat form ditutup.
  - **Aset self-hosted**: worker, core WASM (varian SIMD/non-SIMD), dan data bahasa `ind` (`4.0.0_best_int`)
    disajikan dari `/tesseract/<versi>/` oleh plugin Vite (dev: middleware, build: `emitFile`), tanpa CDN.
    Data bahasa disajikan sebagai byte gzip dengan nama `ind.traineddata` (tanpa `.gz`) karena sebagian
    antivirus/proxy memblokir unduhan `.gz`; Tesseract mengenali gzip dari _magic bytes_. Pemakaian pertama
    mengunduh ±5 MB, berikutnya data bahasa diambil dari IndexedDB.
  - **Dataset & metrik** (`lib/receipt/fixtures.ts` + `parse.test.ts`): 16 teks struk (minimarket,
    supermarket dengan barang 2 baris, SPBU, restoran, warung mie, bengkel, kafe, apotek, teks OCR asli dari
    foto pengguna, teks berderau, struk tak terbaca). Tes gagal bila total < 90%, tanggal < 90%, toko < 80%,
    barang terambil < 80%, atau ada > 1 "barang" palsu (saat ini 100% / 100% / 100% / 100% / 0). E2E
    `receipt.spec.ts` menjalankan Tesseract sungguhan pada gambar struk yang dirender.
  - Keterbatasan: ejaan barang mengikuti hasil OCR (mis. "Aqua" bisa terbaca "Apua"); akurasi turun pada
    foto buram, miring, atau kertas kusut; di desktop tombol membuka pemilih file (webcam tidak dipakai).
- **Saran kategori** (Fase 3.2, flag `auto_category`): kategori ditebak dari catatan (diketik atau hasil
  pindai struk) dan **hanya menyarankan**.
  - **Urutan sumber**: (1) pilihan pengguna sendiri sebelumnya untuk catatan yang sama (`MerchantCategoryMap`,
    per pengguna), (2) kamus kata kunci Indonesia → kategori bawaan (`packages/shared/src/categorize.ts`:
    frasa utuh, terpanjang menang — "telur ayam" = Belanja, "ayam" = Makan; nama toko sebelum `:` berbobot
    3×; kata umum seperti "langganan" kalah dari merek). Model/LLM cadangan belum dipakai.
  - **Kunci belajar** `merchantKey(note)`: nama toko pada catatan struk, atau seluruh catatan tanpa angka,
    huruf kecil (`"Makan siang 25rb"` → `makan siang`). Setiap transaksi pemasukan/pengeluaran yang disimpan
    atau diedit meng-upsert kunci itu ke kategori yang dipilih (fire-and-forget, tidak memperlambat simpan),
    jadi **koreksi pengguna langsung menjadi saran berikutnya**. Klien memuat maks. 500 pemetaan terbaru
    sekali (`GET /categories/learned`) lalu mencocokkan di perangkat, jadi saran muncul seketika saat mengetik.
  - **Form**: bila kategori belum dipilih, saran langsung dipilih dengan keterangan "ditebak dari catatan" /
    "sesuai pilihanmu sebelumnya"; selama belum diganti pengguna, saran mengikuti catatan. Bila pengguna sudah
    memilih kategori lain, saran tampil sebagai tombol **Saran: X** (satu tap). Pilihan manual tidak pernah
    ditimpa. Kategori diarsipkan / beda jenis tidak disarankan.
  - **Metrik**: dataset 63 catatan di `categorize.test.ts` (gagal bila < 90%, saat ini 100%); di produksi
    event `category_suggestion` `{ source, accepted }` saat menyimpan transaksi baru (target diterima ≥ 70%).
- **Tag** (Fase 2.5, flag `tags`): tabel `Tag (userId, name, key)` unik per `(userId, key)`, dengan `key` =
  nama huruf kecil dan spasi dirapikan, jadi "Liburan Bali", "#liburan bali" dan "LIBURAN BALI" adalah tag
  yang sama. Relasi banyak-ke-banyak `TransactionTag`; maks. 10 tag per transaksi, nama maks. 30 karakter,
  `#` di depan dibuang. Tag dibuat otomatis saat transaksi disimpan (tidak ada endpoint "buat tag").
  - **Form**: kolom chip (Enter/koma menambah, Backspace menghapus) + saran tag yang paling sering dipakai.
    Transfer tidak bisa diberi tag. Daftar transaksi menampilkan chip `#tag`, filter **Tag**, dan pencarian
    juga mencocokkan nama tag. Ekspor CSV mendapat kolom `Tag` (nama dipisah koma).
  - **Halaman `/tag`** (dari Profil): total per tag per bulan (pengeluaran/pemasukan), ketuk untuk melihat
    transaksinya, ganti nama (409 bila bentrok), hapus (tag dilepas, transaksi tetap).
  - Tag dan jumlah lampiran dimuat paralel dengan data transfer saat membentuk DTO (tidak menambah waktu
    tunggu berurutan). Saat flag mati, tag dari klien diabaikan.
- **Lampiran foto** (Fase 2.5, flag `attachments`): foto struk/bukti per transaksi di object storage
  (antarmuka `ObjectStorage`, `lib/storage.ts`; driver S3 untuk Supabase Storage/R2, driver memori untuk tes).
  - **Browser mengompres** (sisi panjang ≤ 1600 px, WebP dengan fallback JPEG, kualitas turun bertahap) sehingga
    satu foto ±150–250 kB; 1 GB cukup untuk ±4.000–6.000 foto. Server menerima byte mentah maks. 4 MB (di
    bawah batas body Vercel 4,5 MB), memeriksa jenis dari _magic bytes_, maks. 5 foto per transaksi.
  - **Bucket privat**: kunci objek `userId/transactionId/uuid.ext`; klien hanya mendapat tautan bertanda
    tangan berumur 15 menit dari `GET /transactions/:id/attachments`. Kunci S3 tidak pernah keluar dari server.
  - **Form**: foto ditampung dulu di perangkat lalu diunggah setelah transaksi tersimpan, jadi transaksi tidak
    gagal karena foto; bila ada foto gagal, muncul toast peringatan. Di perangkat sentuh tersedia **Ambil
    foto** (kamera) dan **Dari galeri**.
  - **Pembersihan**: menghapus lampiran menghapus objeknya lebih dulu. Lampiran yang transaksinya terhapus
    permanen (mis. impor dibatalkan) menjadi yatim dan dibersihkan penjadwal tiap jam.
- **Target tabungan** (Fase 2.1, flag `savings_goals`): menu **Anggaran** berganti nama menjadi **Rencana**
  dengan sub-tab **Anggaran** (`/anggaran`) dan **Target** (`/anggaran/target`). Flag mati → menu tetap
  "Anggaran" dan `/anggaran/target` dialihkan.
  - **Model**: `SavingsGoal (name, targetAmount, deadline?, icon, color, walletId?)` dan `GoalContribution`
    (nominal bertanda: + setor, − tarik). Maks. 20 target per pengguna.
  - **Setor/tarik eksplisit**: target tanpa dompet → setoran hanya dicatat sebagai uang yang disisihkan.
    Target dengan dompet tabungan → setor membuat transfer dompet asal → dompet tabungan (tarik sebaliknya)
    dalam satu transaksi DB. Setoran tertaut memakai nominal & tanggal transfernya: transfer diubah di
    Transaksi → progres ikut; transfer dihapus → tidak dihitung, diurungkan → kembali. Menghapus setoran
    menghapus transfernya; menghapus target membiarkan transfer yang sudah ada.
  - **Rumus** (`goalProgress` di `packages/shared/src/goal.ts`): bulan tersisa = bulan kalender sampai
    tenggat termasuk bulan ini; saran per bulan = kekurangan di awal bulan ini ÷ bulan tersisa (dibulatkan
    ke atas ke Rp1.000) sehingga tidak mengecil setelah menyetor, yang berkurang adalah "bulan ini kurang".
    **Sesuai rencana** bila terkumpul ≥ jalur lurus dari bulan dibuat sampai bulan tenggat (per bulan penuh
    yang lewat; bulan pertama selalu sesuai), **Tertinggal** bila kurang atau tenggat lewat, **Tercapai**
    bila terkumpul ≥ target. Bilah progres beranimasi singkat (dimatikan oleh `prefers-reduced-motion`).

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
- ✅ `POST /events` body `{ name: "onboarding_completed" | "onboarding_skipped" | "receipt_scanned" | "category_suggestion", step?: 1–3, fields?: 0–3, source?: "history" | "keyword", accepted?: boolean }` → 204
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
- ✅ `GET /budgets?month=` (semua kategori pengeluaran aktif + anggaran, realisasi `spent`, dan jumlah transaksi
  `txCount`; tanpa anggaran → `id: null`),
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

### Fase 1 (di balik feature flag; flag mati → 404)

- ✅ `recurring_transactions`: `GET/POST /recurring`, `PATCH/DELETE /recurring/:id`
  - Body: `{ type: INCOME|EXPENSE, amount, walletId, categoryId, note?, frequency: DAILY|WEEKLY|MONTHLY|YEARLY,
interval?: 1–99, startDate, endDate?: string|null, autoPost?: boolean }`; `PATCH` juga menerima `paused`
  - `GET /recurring/pending` → kejadian menunggu konfirmasi; `POST /recurring/pending/:id/confirm`
    `{ amount? }` → `{ transactionId }` (409 bila sudah diproses), `POST /recurring/pending/:id/skip` → 204
- ✅ `reminders`: `GET /notifications?cursor=&limit=` → `{ items, nextCursor, unreadCount }`,
  `GET /notifications/unread-count` → `{ count }`, `POST /notifications/:id/read` → 204,
  `POST /notifications/read-all` → 204
  - `GET/PUT /notifications/settings` `{ reminderEnabled, reminderHour: 5–23, reminderDays: [0–6] }`
    (0 = Minggu; minimal satu hari bila aktif); respons juga berisi `push: { available, publicKey }`
  - `POST /notifications/push-subscriptions` (body = `PushSubscription.toJSON()`) → 204,
    `DELETE /notifications/push-subscriptions` `{ endpoint }` → 204, `POST /notifications/push-test` → `{ sent }`
- ✅ `templates`: `GET/POST /templates`, `PATCH/DELETE /templates/:id`
  - Body: `{ name: 1–40 karakter, type: INCOME|EXPENSE, amount: number|null, walletId, categoryId }`;
    template ke-21 → 409
  - `PUT /templates/order` `{ ids }` (harus berisi semua template milik pengguna, tanpa duplikat) → `{ items }`
  - `POST /templates/:id/use` `{ date, amount? }` → transaksi (201, catatan = nama template); mendukung
    `Idempotency-Key`; template tanpa nominal wajib `amount`; dompet/kategori diarsipkan → 400
- ✅ `csv_import`: `POST /imports/preview`, `POST /imports`, `GET /imports` (20 terakhir), `GET /imports/:id`,
  `POST /imports/:id/rollback`
  - Body (preview & impor): `{ filename, walletId, csv: isi file (maks. 1 MB), hasHeader, columns: { date, amount,
note?, type?, category? } (indeks kolom 0-based), dateOrder: DMY|MDY|YMD, decimal: comma|dot,
defaultType?: SIGN|EXPENSE|INCOME, skipDuplicates?: boolean (default true) }`
  - Preview → `{ stats: { total, ready, duplicates, failed }, issues: [{ line, kind: DUPLICATE|INVALID, message }] }`
  - Impor → `ImportBatch` (`201 COMPLETED`, atau `202 PROCESSING` bila > 300 baris) dengan
    `stats: { total, imported, skipped, failed }` dan `issues`; mendukung `Idempotency-Key`
  - Rollback → batch berstatus `ROLLED_BACK` (idempoten); 409 bila masih diproses atau impornya gagal

### Fase 2 (di balik feature flag; flag mati → 404)

- ✅ `tags`: `GET /tags` → `{ items: [{ id, name, count }] }`, `PATCH /tags/:id` `{ name }` (409 bila nama
  sudah dipakai), `DELETE /tags/:id` → 204; `GET /reports/by-tag?month=&type=EXPENSE|INCOME` →
  `{ month, type, items: [{ tagId, name, total, count }] }`
  - `POST/PATCH /transactions` menerima `tags: string[]` (PATCH mengganti seluruh tag); `GET /transactions` dan
    ekspor CSV menerima `tagId`; setiap transaksi berisi `tags: [{ id, name }]` dan `attachmentCount`
- ✅ `attachments` (butuh `STORAGE_S3_*`, tanpa itu 404): `GET /transactions/:id/attachments` →
  `{ items: [{ id, transactionId, mimeType, size, createdAt, url, expiresAt }] }`,
  `POST /transactions/:id/attachments` berisi byte gambar mentah (`Content-Type: image/webp|jpeg|png`, maks.
  4 MB) → 201 lampiran (400 bila sudah 5), `DELETE /attachments/:id` → 204
- ✅ `savings_goals`: `GET /goals` → `{ items: [{ id, name, targetAmount, deadline, icon, color, walletId,
wallet, saved, savedThisMonth, contributionCount, createdAt }] }`, `POST /goals` (target ke-21 → 409),
  `PATCH /goals/:id`, `DELETE /goals/:id` → 204
  - Body: `{ name: 1–40, targetAmount, deadline?: "YYYY-MM-DD"|null (tidak boleh lampau), icon?, color?,
walletId?: string|null }`
  - `GET /goals/:id/contributions` → `{ items: [{ id, type: DEPOSIT|WITHDRAW, amount, date, note,
transferGroupId, wallet }] }`; `POST /goals/:id/contributions` `{ type, amount, date, note?, walletId? }`
    → target terbaru (201, mendukung `Idempotency-Key`). `walletId` (dompet asal/tujuan) wajib bila target
    punya dompet tabungan dan ditolak bila tidak; tarik melebihi yang terkumpul → 400
  - `DELETE /goals/contributions/:id` → 204 (transfer tertaut ikut dihapus)

### Fase 3 (di balik feature flag; flag mati → 404)

- ✅ `auto_category`: `GET /categories/learned` → `{ items: [{ key, type, categoryId }] }` (maks. 500 terbaru,
  tanpa kategori yang diarsipkan). Pemetaan diperbarui otomatis oleh `POST/PATCH /transactions`; saat flag
  mati tidak ada yang dipelajari.

## Event analitik & gerbang fase

| Event                                        | Dicatat oleh           | `props`                                       |
| -------------------------------------------- | ---------------------- | --------------------------------------------- |
| `user_registered`, `user_logged_in`          | API auth               | –                                             |
| `wallet_created`                             | API                    | `type` (CASH/BANK/EWALLET)                    |
| `transaction_created`                        | API                    | `type` (EXPENSE/INCOME/TRANSFER), `tags`      |
| `attachment_uploaded`                        | API                    | `mimeType`, `size` (byte)                     |
| `budget_saved`                               | API                    | `items`, `monthOnly` (jumlah)                 |
| `export_csv`                                 | API                    | –                                             |
| `password_reset_requested`, `password_reset` | API auth               | –                                             |
| `recurring_rule_created`                     | API                    | `frequency`, `autoPost`                       |
| `reminder_sent`, `push_subscribed`           | API                    | –                                             |
| `template_created`                           | API                    | `type`, `fixedAmount`                         |
| `template_used`                              | API                    | `type`, `amountChanged`                       |
| `goal_created`                               | API                    | `hasDeadline`, `hasWallet`                    |
| `goal_contribution`                          | API                    | `type` (DEPOSIT/WITHDRAW), `transfer`         |
| `import_completed`                           | API                    | `imported`, `skipped`, `failed`, `background` |
| `import_rolled_back`                         | API                    | `removed`                                     |
| `onboarding_completed`, `onboarding_skipped` | Klien (`POST /events`) | `step` (1–3)                                  |
| `receipt_scanned`                            | Klien (`POST /events`) | `fields` (0–3 kolom terbaca)                  |
| `category_suggestion`                        | Klien (`POST /events`) | `source` (history/keyword), `accepted`        |

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
