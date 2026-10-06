import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

function Boom(): never {
  throw new Error("Failed to execute 'insertBefore' on 'Node'");
}

describe('AppErrorBoundary', () => {
  it('menampilkan fallback dengan tombol muat ulang, bukan layar kosong', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Ada yang tidak beres');
    expect(screen.getByRole('button', { name: 'Muat ulang' })).toBeInTheDocument();
  });

  it('menjelaskan chunk rute yang gagal diunduh', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function ChunkBoom(): never {
      throw new TypeError('Failed to fetch dynamically imported module: /assets/HomePage-x.js');
    }
    render(
      <AppErrorBoundary>
        <ChunkBoom />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Halaman belum termuat');
  });

  it('merender children seperti biasa saat tidak ada error', () => {
    render(
      <AppErrorBoundary>
        <p>Isi aplikasi</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('Isi aplikasi')).toBeInTheDocument();
  });
});
