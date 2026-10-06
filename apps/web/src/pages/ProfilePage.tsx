import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useAuth } from '../lib/auth';

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
