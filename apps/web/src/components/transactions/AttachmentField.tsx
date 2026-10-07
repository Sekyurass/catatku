import type { AttachmentDTO } from '@catatku/shared';
import { Camera, Image as ImageIcon, Loader2, Paperclip, X } from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { AttachmentImageError, compressAttachment } from '../../lib/attachments';
import { useMediaQuery } from '../../lib/media';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';

export interface PendingPhoto {
  id: string;
  blob: Blob;
  url: string;
}

type Thumb = { key: string; url: string; label: string; onRemove: () => void };

/**
 * Foto lampiran: yang sudah tersimpan dan yang baru dipilih (diunggah setelah transaksi disimpan).
 * Foto dikompres di perangkat sebelum ditampilkan sebagai pratinjau.
 */
export function AttachmentField({
  existing,
  pending,
  capacity,
  onAdd,
  onRemoveExisting,
  onRemovePending,
}: {
  existing: AttachmentDTO[];
  pending: PendingPhoto[];
  /** Sisa slot (batas per transaksi dikurangi yang sudah ada/tertunda). */
  capacity: number;
  onAdd: (photo: PendingPhoto) => void;
  onRemoveExisting: (id: string) => void;
  onRemovePending: (id: string) => void;
}) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const touch = useMediaQuery('(pointer: coarse)');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])].slice(0, capacity);
    e.target.value = '';
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    for (const file of files) {
      try {
        const blob = await compressAttachment(file);
        onAdd({ id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob) });
      } catch (err) {
        setError(
          err instanceof AttachmentImageError ? err.message : 'Foto gagal diproses. Coba lagi.',
        );
      }
    }
    setBusy(false);
  };

  const thumbs: Thumb[] = [
    ...existing.map((a, i) => ({
      key: a.id,
      url: a.url,
      label: `Lampiran ${i + 1}`,
      onRemove: () => onRemoveExisting(a.id),
    })),
    ...pending.map((p, i) => ({
      key: p.id,
      url: p.url,
      label: `Foto baru ${i + 1}`,
      onRemove: () => onRemovePending(p.id),
    })),
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-fg">Lampiran foto (opsional)</span>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void pick(e)}
        data-testid="attachment-input"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void pick(e)}
        data-testid="attachment-camera"
      />
      {thumbs.length > 0 && (
        <ul className="flex flex-wrap gap-4 pt-2" aria-label="Lampiran">
          {thumbs.map((t) => (
            <li key={t.key} className="relative">
              <button
                type="button"
                onClick={() => setViewing(t.url)}
                aria-label={`Lihat ${t.label}`}
                className="block size-20 overflow-hidden rounded-control border border-line bg-surface-muted"
              >
                <img src={t.url} alt="" className="size-full object-cover" loading="lazy" />
              </button>
              <button
                type="button"
                onClick={t.onRemove}
                aria-label={`Hapus ${t.label}`}
                className="group absolute -top-4 -right-4 flex size-11 items-center justify-center rounded-full"
              >
                <span className="flex size-7 items-center justify-center rounded-full border border-line bg-surface text-fg shadow-sm group-hover:text-expense-text">
                  <X className="size-4" aria-hidden />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {capacity > 0 &&
        (busy ? (
          <p className="flex min-h-11 items-center gap-2 text-sm text-muted" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Memproses foto…
          </p>
        ) : touch ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => cameraRef.current?.click()}
              icon={<Camera className="size-4" aria-hidden />}
            >
              Ambil foto
            </Button>
            <Button
              variant="secondary"
              onClick={() => galleryRef.current?.click()}
              icon={<ImageIcon className="size-4" aria-hidden />}
            >
              Dari galeri
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            onClick={() => galleryRef.current?.click()}
            icon={<Paperclip className="size-4" aria-hidden />}
            className="self-start"
          >
            Tambah foto
          </Button>
        ))}
      {error && (
        <p className="text-sm text-expense-text" role="alert">
          {error}
        </p>
      )}
      <PhotoViewer url={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function PhotoViewer({ url, onClose }: { url: string | null; onClose: () => void }) {
  // Simpan URL terakhir agar gambar tidak hilang selama dialog menutup.
  const [shown, setShown] = useState(url);
  useEffect(() => {
    if (url) setShown(url);
  }, [url]);
  return (
    <Dialog open={!!url} onClose={onClose} title="Lampiran">
      {shown && (
        <img
          src={shown}
          alt="Foto lampiran"
          className="max-h-[75dvh] w-full rounded-control bg-surface-muted object-contain"
        />
      )}
    </Dialog>
  );
}
