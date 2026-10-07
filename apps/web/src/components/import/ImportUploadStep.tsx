import { IMPORT_MAX_ROWS } from '@catatku/shared';
import { Download, FileUp } from 'lucide-react';
import { type DragEvent, useId, useState } from 'react';
import { cn } from '../../lib/cn';
import { ImportFileError, readImportFile, type ImportDraft } from '../../lib/importFile';

const SAMPLE_CSV = [
  'Tanggal;Keterangan;Kategori;Jumlah',
  '01/10/2026;Gaji Oktober;Gaji;8.500.000',
  '02/10/2026;Makan siang;Makan;-35.000',
  '03/10/2026;Bensin motor;Transport;-50.000',
].join('\r\n');

const sampleHref = `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${SAMPLE_CSV}\r\n`)}`;

export function ImportUploadStep({ onLoaded }: { onLoaded: (draft: ImportDraft) => void }) {
  const inputId = useId();
  const errorId = useId();
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      onLoaded(await readImportFile(file));
    } catch (err) {
      setError(err instanceof ImportFileError ? err.message : 'File tidak bisa dibaca.');
    } finally {
      setReading(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void load(e.dataTransfer.files[0]);
  };

  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-3 rounded-card border-2 border-dashed px-4 py-10 text-center transition-colors',
          'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary',
          dragging ? 'border-primary bg-primary-soft' : 'border-line hover:bg-surface-muted',
          reading && 'pointer-events-none opacity-60',
        )}
      >
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <FileUp className="size-7" aria-hidden />
        </span>
        <span>
          <span className="block font-semibold">
            {reading ? 'Membaca file…' : 'Pilih file CSV'}
          </span>
          <span className="mt-1 block text-sm text-muted">
            atau seret ke sini. Maks. 1 MB, {IMPORT_MAX_ROWS.toLocaleString('id-ID')} baris.
          </span>
        </span>
        <input
          id={inputId}
          type="file"
          accept=".csv,text/csv,.txt"
          className="sr-only"
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          disabled={reading}
          onChange={(e) => {
            void load(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>

      {error && (
        <p id={errorId} role="alert" className="text-sm text-expense-text">
          {error}
        </p>
      )}

      <div className="rounded-control bg-surface-muted p-3 text-sm text-muted">
        <p>
          Ekspor dari Excel, Google Sheets, atau mutasi rekening dalam format CSV. Minimal ada kolom
          tanggal dan jumlah; keterangan, tipe, dan kategori opsional.
        </p>
        <a
          href={sampleHref}
          download="contoh-impor-catatku.csv"
          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-control px-3 font-semibold text-primary hover:bg-surface"
        >
          <Download className="size-4" aria-hidden />
          Unduh contoh file
        </a>
      </div>
    </div>
  );
}
