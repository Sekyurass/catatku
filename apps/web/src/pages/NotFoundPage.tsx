import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/States';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Halaman tidak ditemukan"
      titleAs="h1"
      description="Mungkin tautannya sudah berubah."
      action={
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
        >
          Kembali ke Beranda
        </Link>
      }
    />
  );
}
