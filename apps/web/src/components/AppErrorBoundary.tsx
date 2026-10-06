import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Logo } from './Logo';
import { Button } from './ui/Button';

interface State {
  error: Error | null;
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
    if (!this.state.error) return this.props.children;
    return (
      <div
        className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center"
        role="alert"
      >
        <Logo />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Ada yang tidak beres</h1>
          <p className="max-w-sm text-sm text-muted">
            Halaman gagal ditampilkan. Muat ulang untuk melanjutkan. Kalau terus terjadi, matikan
            fitur terjemahan otomatis browser untuk Catatku.
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>Muat ulang</Button>
      </div>
    );
  }
}
