import { Card } from '../components/ui/Card';
import { useAuth } from '../lib/auth';

export function HomePage() {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-4">
      <header>
        <p className="text-sm text-muted">Halo,</p>
        <h1 className="text-2xl font-bold">{user?.name}</h1>
      </header>
      <Card>
        <p className="text-sm text-muted">
          Dasbor (saldo, pemasukan vs pengeluaran, dan tren) hadir di milestone berikutnya.
        </p>
      </Card>
    </div>
  );
}
