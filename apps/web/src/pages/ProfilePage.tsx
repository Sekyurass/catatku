import { ChevronRight, LogOut, Tags, WalletMinimal } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExportButton } from '../components/ExportButton';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useAuth } from '../lib/auth';

const LINKS = [
  {
    to: '/dompet',
    label: 'Dompet',
    description: 'Tunai, rekening bank, dompet digital',
    icon: WalletMinimal,
  },
  {
    to: '/kategori',
    label: 'Kategori',
    description: 'Atur kategori pemasukan & pengeluaran',
    icon: Tags,
  },
] as const;

export function ProfilePage() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Profil</h1>
      <Card className="flex flex-col gap-1">
        <p className="font-semibold">{user?.name}</p>
        <p className="text-sm text-muted">{user?.email}</p>
      </Card>
      <Card className="p-1">
        <ul>
          {LINKS.map(({ to, label, description, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex min-h-14 items-center gap-3 rounded-control px-3 py-2 hover:bg-surface-muted"
              >
                <Icon className="size-5 text-primary" aria-hidden />
                <span className="flex-1">
                  <span className="block font-medium">{label}</span>
                  <span className="block text-sm text-muted">{description}</span>
                </span>
                <ChevronRight className="size-5 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="font-medium">Ekspor data</p>
          <p className="text-sm text-muted">
            Unduh seluruh riwayat transaksi sebagai CSV untuk Excel atau Google Sheets.
          </p>
        </div>
        <ExportButton label="Unduh CSV" />
      </Card>
      <Button
        variant="secondary"
        loading={busy}
        icon={<LogOut className="size-4" aria-hidden />}
        onClick={async () => {
          setBusy(true);
          await logout();
        }}
        className="self-start"
      >
        Keluar
      </Button>
    </div>
  );
}
