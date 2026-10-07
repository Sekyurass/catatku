import { PRIVACY_POLICY_VERSION, QUICK_TEXT_SAMPLE_RETENTION_DAYS } from '@catatku/shared';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/Logo';
import { useAuth } from '../../lib/auth';
import { formatLongDate } from '../../lib/format';

export const PRIVACY_CONTACT_EMAIL = 'privasi@catatku.id';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Bisa dibuka tanpa masuk: dari form daftar dan layar persetujuan. */
export function PrivacyPolicyPage() {
  const { status } = useAuth();
  const contact = (
    <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="font-semibold text-primary underline">
      {PRIVACY_CONTACT_EMAIL}
    </a>
  );

  return (
    <div className="min-h-dvh bg-surface">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-12 text-sm leading-relaxed sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <Logo />
          <Link
            to={status === 'authenticated' ? '/profil' : '/masuk'}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 font-medium text-primary hover:bg-surface-muted"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Kembali
          </Link>
        </div>
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Kebijakan Privasi</h1>
          <p className="text-muted">Berlaku sejak {formatLongDate(PRIVACY_POLICY_VERSION)}</p>
        </header>

        <p>
          Catatku membantu kamu mencatat keuangan pribadi. Data keuanganmu adalah milikmu: kami
          hanya memakainya untuk menjalankan aplikasi, tidak menjualnya, dan tidak memakainya untuk
          iklan.
        </p>

        <Section title="Data yang kami simpan">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Akun:</strong> nama panggilan, email, dan kata sandi (disimpan sebagai hash,
              tidak bisa dibaca siapa pun termasuk kami), serta foto profil bila kamu unggah.
            </li>
            <li>
              <strong>Catatan keuangan:</strong> dompet, transaksi, kategori, anggaran, target
              tabungan, tag, template, transaksi berulang, dan pengingat yang kamu buat.
            </li>
            <li>
              <strong>Foto struk:</strong> struk dibaca langsung di perangkatmu. Foto hanya disimpan
              di server bila kamu melampirkannya ke transaksi.
            </li>
            <li>
              <strong>Email notifikasi bank</strong> (bila fitur ini kamu aktifkan): hanya hasil
              bacaannya yang disimpan (nominal, tanggal, keterangan, nomor referensi). Isi email
              tidak disimpan, dan transaksi baru tercatat setelah kamu konfirmasi.
            </li>
            <li>
              <strong>Data teknis:</strong> jenis browser untuk mengelola sesi masuk, serta catatan
              pemakaian fitur (mis. &ldquo;transaksi dibuat&rdquo;) untuk memperbaiki aplikasi.
              Catatan ini tidak berisi nominal atau isi transaksimu.
            </li>
          </ul>
        </Section>

        <Section title="Bantu tingkatkan Ketik cepat (opsional)">
          <p>
            Bila kamu ikut, kalimat ketik cepat yang hasil bacaannya kamu koreksi dikirim beserta
            koreksinya untuk melatih pembaca kalimat. Sampel ini:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>disimpan tanpa nama, email, atau ID akunmu, jadi tidak bisa dilacak balik;</li>
            <li>nomor HP, nomor rekening, dan email di dalamnya disamarkan otomatis;</li>
            <li>dihapus otomatis setelah {QUICK_TEXT_SAMPLE_RETENTION_DAYS} hari.</li>
          </ul>
          <p>Bawaannya tidak ikut. Kamu bisa menyalakan atau mematikannya kapan saja di Profil.</p>
        </Section>

        <Section title="Untuk apa data dipakai">
          <ul className="list-disc space-y-1 pl-5">
            <li>Menampilkan saldo, laporan, perkiraan, dan wawasan keuanganmu.</li>
            <li>Mengirim pengingat dan notifikasi yang kamu nyalakan.</li>
            <li>Mengirim email penting seperti tautan atur ulang kata sandi.</li>
            <li>Menjaga keamanan akun dan memperbaiki kesalahan aplikasi.</li>
          </ul>
        </Section>

        <Section title="Pihak lain yang terlibat">
          <p>
            Data disimpan di penyedia infrastruktur yang kami pakai untuk menjalankan Catatku:
            hosting aplikasi, database, penyimpanan file (foto), dan pengiriman email. Mereka hanya
            memproses data atas nama kami. Kami tidak membagikan datamu ke pihak lain kecuali
            diwajibkan hukum.
          </p>
        </Section>

        <Section title="Keamanan">
          <p>
            Koneksi selalu terenkripsi (HTTPS), kata sandi di-hash, dan sesi masuk bisa dicabut
            dengan mengganti kata sandi. Foto hanya bisa diakses oleh akunmu.
          </p>
        </Section>

        <Section title="Masa simpan">
          <p>
            Data akun dan catatan keuangan disimpan selama akunmu aktif. Notifikasi lama dan file
            yang tidak terpakai dibersihkan otomatis. Sampel Ketik cepat dihapus setelah{' '}
            {QUICK_TEXT_SAMPLE_RETENTION_DAYS} hari.
          </p>
        </Section>

        <Section title="Hak kamu">
          <ul className="list-disc space-y-1 pl-5">
            <li>Melihat dan mengubah data profil serta catatanmu kapan saja di aplikasi.</li>
            <li>Mengunduh seluruh riwayat transaksi (Profil → Ekspor data).</li>
            <li>Berhenti ikut Ketik cepat kapan saja di Profil.</li>
            <li>
              Meminta salinan data atau penghapusan akun beserta seluruh datanya lewat {contact}.
            </li>
          </ul>
        </Section>

        <Section title="Perubahan kebijakan">
          <p>
            Bila kebijakan ini berubah, kami akan meminta persetujuanmu lagi saat kamu membuka
            aplikasi. Pertanyaan seputar privasi bisa dikirim ke {contact}.
          </p>
        </Section>
      </main>
    </div>
  );
}
