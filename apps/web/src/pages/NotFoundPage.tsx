import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/States';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Halaman tidak ditemukan"
      description="Mungkin tautannya sudah berubah."
      action={
        <Link to="/" className="font-semibold text-primary underline-offset-4 hover:underline">
          Kembali ke Beranda
        </Link>
      }
    />
  );
}
