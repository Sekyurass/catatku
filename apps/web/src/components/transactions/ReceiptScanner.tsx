import { Camera, Image as ImageIcon, RotateCcw, ScanLine, ShieldCheck, X } from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useMediaQuery } from '../../lib/media';
import {
  countFields,
  loadReceiptParser,
  ReceiptImageError,
  type ReceiptProgress,
  type ReceiptScanResult,
  validateReceiptFile,
} from '../../lib/receipt';
import { Button } from '../ui/Button';

type State =
  | { status: 'idle' }
  | { status: 'scanning'; preview: string; progress: ReceiptProgress }
  | { status: 'done'; preview: string; result: ReceiptScanResult }
  | { status: 'failed'; preview: string | null; message: string };

const FIELD_LABELS = { total: 'total', date: 'tanggal', merchant: 'nama toko' } as const;
type FieldKey = keyof typeof FIELD_LABELS;
const FIELD_KEYS = Object.keys(FIELD_LABELS) as FieldKey[];

const listOf = (keys: FieldKey[]) => keys.map((k) => FIELD_LABELS[k]).join(', ');

/**
 * Tombol "Pindai struk" (di HP: "Foto struk" langsung ke kamera + "Dari galeri") + panel status. Foto hanya dibaca di perangkat (tidak diunggah) dan
 * dibuang saat panel ditutup; bila gagal, foto tetap tampil sebagai acuan mengisi manual.
 */
export function ReceiptScanner({
  today,
  onScanned,
  onCleared,
}: {
  today: string;
  onScanned: (result: ReceiptScanResult) => void;
  onCleared: () => void;
}) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [zoomed, setZoomed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const touch = useMediaQuery('(pointer: coarse)');
  const abortRef = useRef<AbortController | null>(null);
  const previewRef = useRef<string | null>(null);

  const releasePreview = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
  };

  useEffect(
    () => () => {
      abortRef.current?.abort();
      releasePreview();
    },
    [],
  );

  const pick = () => inputRef.current?.click();

  const scan = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    abortRef.current?.abort();
    releasePreview();
    setZoomed(false);
    try {
      validateReceiptFile(file);
    } catch (err) {
      setState({ status: 'failed', preview: null, message: (err as Error).message });
      return;
    }

    const preview = URL.createObjectURL(file);
    previewRef.current = preview;
    const controller = new AbortController();
    abortRef.current = controller;
    let stage: ReceiptProgress['stage'] = 'loading';
    setState({ status: 'scanning', preview, progress: { stage, progress: 0 } });

    try {
      const parser = await loadReceiptParser();
      const result = await parser.parse(file, {
        today,
        signal: controller.signal,
        onProgress: (progress) => {
          stage = progress.stage;
          if (!controller.signal.aborted) setState({ status: 'scanning', preview, progress });
        },
      });
      if (controller.signal.aborted) return;
      const fields = countFields(result);
      void api('/events', { method: 'POST', body: { name: 'receipt_scanned', fields } }).catch(
        () => undefined,
      );
      if (fields === 0) {
        setState({
          status: 'failed',
          preview,
          message: 'Struk tidak terbaca. Isi manual sambil melihat fotonya.',
        });
        return;
      }
      setState({ status: 'done', preview, result });
      onScanned(result);
    } catch (err) {
      if (controller.signal.aborted) return;
      setState({
        status: 'failed',
        preview,
        message:
          err instanceof ReceiptImageError
            ? err.message
            : stage === 'loading'
              ? 'Pembaca struk gagal dimuat. Periksa koneksi internet lalu coba lagi.'
              : 'Gagal membaca struk. Coba lagi atau isi manual.',
      });
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    releasePreview();
    setState({ status: 'idle' });
  };

  const clear = () => {
    cancel();
    onCleared();
  };

  const input = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void scan(e)}
        data-testid="receipt-input"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void scan(e)}
        data-testid="receipt-camera"
      />
    </>
  );

  // `capture` hanya membuka kamera di HP/tablet; di desktop pemilih file biasa sudah cukup.
  const pickers = (again: boolean) =>
    touch ? (
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={() => cameraRef.current?.click()}
          icon={<Camera className="size-4" aria-hidden />}
        >
          {again ? 'Foto ulang' : 'Foto struk'}
        </Button>
        <Button
          variant="secondary"
          onClick={pick}
          icon={<ImageIcon className="size-4" aria-hidden />}
        >
          Dari galeri
        </Button>
      </div>
    ) : (
      <Button
        variant="secondary"
        onClick={pick}
        icon={
          again ? (
            <RotateCcw className="size-4" aria-hidden />
          ) : (
            <ScanLine className="size-4" aria-hidden />
          )
        }
        className="w-full"
      >
        {again ? 'Pindai ulang' : 'Pindai struk'}
      </Button>
    );

  if (state.status === 'idle') {
    return (
      <div>
        {input}
        {pickers(false)}
      </div>
    );
  }

  const { preview } = state;
  return (
    <section
      aria-label="Pindai struk"
      className="flex flex-col gap-3 rounded-card border border-line bg-surface-muted/60 p-3"
    >
      {input}
      <div className="flex items-start gap-3">
        {preview && (
          <button
            type="button"
            onClick={() => setZoomed((z) => !z)}
            aria-expanded={zoomed}
            aria-label={zoomed ? 'Perkecil foto struk' : 'Perbesar foto struk'}
            className="shrink-0 overflow-hidden rounded-control border border-line bg-surface"
          >
            <img src={preview} alt="" className="h-16 w-12 object-cover" />
          </button>
        )}
        <div className="min-w-0 flex-1" role="status">
          {state.status === 'scanning' && <ScanProgress progress={state.progress} />}
          {state.status === 'done' && <ScanSummary result={state.result} />}
          {state.status === 'failed' && (
            <p className="text-sm font-medium text-expense-text">{state.message}</p>
          )}
        </div>
        {state.status === 'scanning' ? (
          <Button variant="ghost" onClick={cancel}>
            Batal
          </Button>
        ) : (
          <Button variant="ghost" size="icon" onClick={clear} aria-label="Hapus foto struk">
            <X className="size-5" aria-hidden />
          </Button>
        )}
      </div>

      {zoomed && preview && (
        <img
          src={preview}
          alt="Foto struk"
          className="max-h-[60vh] w-full rounded-control bg-surface object-contain"
        />
      )}

      {state.status !== 'scanning' && pickers(true)}
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <ShieldCheck className="size-4 shrink-0" aria-hidden />
        Foto dibaca di perangkat ini dan tidak diunggah.
      </p>
    </section>
  );
}

function ScanProgress({ progress }: { progress: ReceiptProgress }) {
  const loading = progress.stage === 'loading';
  const pct = loading ? null : Math.round(progress.progress * 100);
  return (
    <>
      <p className="text-sm font-semibold">
        {loading ? 'Menyiapkan pembaca struk…' : `Membaca struk… ${pct}%`}
      </p>
      <div
        role="progressbar"
        aria-label="Kemajuan pindai struk"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
      >
        <div
          className={
            loading
              ? 'h-full w-1/3 animate-pulse rounded-full bg-primary'
              : 'h-full rounded-full bg-primary transition-[width]'
          }
          style={loading ? undefined : { width: `${pct}%` }}
        />
      </div>
      {loading && <p className="mt-1.5 text-xs text-muted">Pemakaian pertama mengunduh ±5 MB.</p>}
    </>
  );
}

function ScanSummary({ result }: { result: ReceiptScanResult }) {
  const missing = FIELD_KEYS.filter((k) => !result[k]);
  const unsure = FIELD_KEYS.filter((k) => result[k]?.confidence === 'low');
  return (
    <>
      <p className="text-sm font-semibold">Diisi dari struk, periksa lagi sebelum menyimpan</p>
      {unsure.length > 0 && (
        <p className="mt-0.5 text-sm text-warning-text">Kurang yakin: {listOf(unsure)}.</p>
      )}
      {missing.length > 0 && (
        <p className="mt-0.5 text-sm text-muted">Tidak terbaca: {listOf(missing)}.</p>
      )}
    </>
  );
}
