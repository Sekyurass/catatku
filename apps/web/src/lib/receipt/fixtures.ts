/**
 * Dataset uji parser: teks seperti keluaran OCR (huruf/angka tertukar, spasi hilang, baris pecah)
 * dari jenis struk yang umum di Indonesia. Tambahkan kasus nyata yang gagal di sini.
 */
export interface ReceiptSample {
  name: string;
  text: string;
  expected: { total: number | null; date: string | null; merchant: string | null };
}

export const SAMPLE_TODAY = '2026-10-07';

export const RECEIPT_SAMPLES: ReceiptSample[] = [
  {
    name: 'Indomaret (koma ribuan, TOTAL/TUNAI/KEMBALI)',
    text: `PT. INDOMARCO PRISMATAMA
INDOMARET KEBON JERUK 2
JL. PANJANG NO. 12 JAKARTA BARAT
NPWP: 01.337.994.6-092.000
06.10.26-19:42 2.0.31 T3PK/GILANG/01
INDOMIE GRG SPC 2 3,100 6,200
AQUA 600ML 1 3,500 3,500
ROTI TAWAR SARI 1 16,900 16,900
TOTAL ITEM 4
HARGA JUAL : 26,600
TOTAL : 26,600
TUNAI : 50,000
KEMBALI : 23,400
PPN : 2,636
LAYANAN KONSUMEN SMS 0815 7000 7000`,
    expected: { total: 26_600, date: '2026-10-06', merchant: 'Indomaret' },
  },
  {
    name: 'Alfamart (titik ribuan, Total Belanja)',
    text: `ALFAMART
PT.SUMBER ALFARIA TRIJAYA, TBK
JL.MH THAMRIN NO.9 TANGERANG
Bon 1A2B-3C4D Kasir : SITI
SUSU UHT COKLAT 2 6.500 13.000
SABUN MANDI 1 4.200 4.200
Total Item 3 17.200
Total Belanja 17.200
Tunai 20.000
Kembalian 2.800
Tgl. 05-10-2026 08:12:55 V.2026.1`,
    expected: { total: 17_200, date: '2026-10-05', merchant: 'Alfamart' },
  },
  {
    name: 'Restoran (subtotal, service, PB1, Total)',
    text: `WARUNG MAKAN BU SRI
Jl. Kaliurang Km 5 Yogyakarta
Telp 0274 555 123
Meja 7  Kasir: Dewi
03 Okt 2026 12:41
Nasi Gudeg Komplit 2 x 25.000 50.000
Es Teh Manis 2 x 5.000 10.000
Subtotal 60.000
Service 5% 3.000
PB1 10% 6.300
Total Rp 69.300
Debit BCA 69.300
Terima kasih`,
    expected: { total: 69_300, date: '2026-10-03', merchant: 'Warung Makan Bu Sri' },
  },
  {
    name: 'SPBU Pertamina (TOTAL HARGA, tanggal yyyy-mm-dd)',
    text: `PERTAMINA
SPBU 34.123.45
JL. RAYA BOGOR KM 30
Shift: 2  No. Trans: 889123
Waktu: 2026-10-01 07:15:02
Pulau/Pompa: 3
Nama Produk: PERTALITE
Harga/Liter: Rp. 10.000
Volume: 15,00 L
Total Harga: Rp. 150.000
CASH Rp. 150.000`,
    expected: { total: 150_000, date: '2026-10-01', merchant: 'Pertamina' },
  },
  {
    name: 'Kafe (GRAND TOTAL, desimal ,00)',
    text: `KOPI KENANGAN SENJA
Ruko Permata Blok A3
Order #A-1029
02/10/2026 16:05
Kopi Susu Aren 1 22.000,00
Croissant 1 28.000,00
SUB TOTAL 50.000,00
TAX 10% 5.000,00
GRAND TOTAL 55.000,00
QRIS 55.000,00`,
    expected: { total: 55_000, date: '2026-10-02', merchant: 'Kopi Kenangan Senja' },
  },
  {
    name: 'Salah baca OCR (T0TAL, O untuk 0, spasi di angka)',
    text: `ALFAMART CILANDAK
J1. CILANDAK KKO
O4/1O/2O26 2O:11
MIE SEDAAP 3 3.1OO 9.3OO
T0TAL BELANJA 9. 300
TUNAI 1O.OOO
KEMBALIAN 7OO`,
    expected: { total: 9_300, date: '2026-10-04', merchant: 'Alfamart' },
  },
  {
    name: 'Nominal di baris berikutnya',
    text: `TOKO BANGUNAN SUMBER REJEKI
JL. AHMAD YANI 45
Tanggal: 28/09/2026
SEMEN TIGA RODA 2 SAK
CAT TEMBOK 5KG
TOTAL BAYAR
Rp 245.000`,
    expected: { total: 245_000, date: '2026-09-28', merchant: 'Toko Bangunan Sumber Rejeki' },
  },
  {
    name: 'Apotek (nama bulan penuh)',
    text: `APOTEK SEHAT SELALU
Jl. Diponegoro 88 Semarang
SIPA: 449/123/2024
Tanggal : 30 September 2026
Paracetamol 500mg 1 strip 12.500
Vitamin C 1000 1 btl 45.000
Jumlah 57.500
Bayar 100.000
Kembali 42.500`,
    expected: { total: 57_500, date: '2026-09-30', merchant: 'Apotek Sehat Selalu' },
  },
  {
    name: 'Starbucks (format bahasa Inggris)',
    text: `STARBUCKS
GRAND INDONESIA
Check #4471
OCT 06 2026 09:30 AM
1 Caffe Latte Grande 58,000
1 Butter Croissant 35,000
Subtotal 93,000
PB1 10% 9,300
Total 102,300
Visa 102,300`,
    // Urutan bulan-tanggal-tahun ala AS tidak dikenali; pengguna mengisi tanggal sendiri.
    expected: { total: 102_300, date: null, merchant: 'Starbucks' },
  },
  {
    name: 'Tanpa kata kunci total (tunai − kembali)',
    text: `WARUNG KOPI PAK MAN
nasi telur 12.000
kopi hitam 4.000
TUNAI 20.000
KEMBALI 4.000
07-10-2026`,
    expected: { total: 16_000, date: '2026-10-07', merchant: 'Warung Kopi Pak Man' },
  },
  {
    name: 'KFC (TOTAL dua kali: sebelum & sesudah pembulatan)',
    text: `KFC
PT FASTFOOD INDONESIA TBK
KFC MARGONDA DEPOK
01-10-26 13:22 POS 3
1 PAKET JAGOAN 1 42.727
PB1 4.273
TOTAL 47.000
DONASI PEMBULATAN 0
TOTAL 47.000
CASH 50.000
CHANGE 3.000`,
    expected: { total: 47_000, date: '2026-10-01', merchant: 'KFC' },
  },
  {
    // Teks OCR asli dari foto struk pengguna: logo di atas terbaca acak, 7 terbaca 1 di tanggal.
    name: 'Restoran ayam (logo jadi teks acak, tanggal dari nomor struk)',
    text: `AN SUA A -                    -.
NN NYA :                       na
SN. aa RaR ai       bi         .           .
&   Hotway's
Bela. 4
.         ian iba
Hotways Chicken Bali
No       : HCB01202610070002
Penjualan : SHCB019134065601              Sa
Tangga!    : 01-10-2026 10:38
Info      : pak man
No Meja - : Takeaway-2                       Na
Pax      ABI                         NG
Kasir    : Lina                 sa :
1 STRAWBERRY ORANGE MILK        15.000
1 Paha Atas Crispy           18.000 --.
2 iten                                   S
Grand Total: ON
ORIS :      33.000 -
- Thank You -                  .`,
    expected: { total: 33_000, date: '2026-10-07', merchant: 'Hotways Chicken Bali' },
  },
  {
    name: 'Struk buram (hampir tidak terbaca)',
    text: `~~ ..
,,, 1 ;; 2
-- --`,
    expected: { total: null, date: null, merchant: null },
  },
];
