import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Logo } from './Logo';
import { Button } from './ui/Button';

interface State {
  error: Error | null;
}

/** Chunk rute (React.lazy) gagal diunduh: biasanya offline atau file lama sudah diganti rilis baru. */
function isChunkLoadError(error: Error) {
  return /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(
    error.message,
  );
}

/** Jaring terakhir: tanpa ini, satu error render mengosongkan seluruh halaman. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Aplikasi crash:', error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunkFailed = isChunkLoadError(error);
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center"
        role="alert"
      >
        <Logo />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">
            {chunkFailed ? 'Halaman belum termuat' : 'Ada yang tidak beres'}
          </h1>
          <p className="max-w-sm text-sm text-muted">
            {chunkFailed
              ? 'Koneksi terputus atau Catatku baru saja diperbarui. Muat ulang untuk melanjutkan.'
              : 'Halaman gagal ditampilkan. Muat ulang untuk melanjutkan. Kalau terus terjadi, matikan fitur terjemahan otomatis browser untuk Catatku.'}
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>Muat ulang</Button>
      </div>
    );
  }
}
