import { Download } from 'lucide-react';
import { useState } from 'react';
import { ApiError, downloadFile } from '../lib/api';
import { today } from '../lib/format';
import type { TransactionFilters } from '../lib/queries';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';

/** Unduh transaksi (sesuai filter) sebagai CSV yang bisa dibuka di Excel / Google Sheets. */
export function ExportButton({
  filters = {},
  label = 'Ekspor CSV',
  className,
}: {
  filters?: TransactionFilters;
  label?: string;
  className?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      await downloadFile('/export/transactions.csv', filters, `catatku-transaksi-${today()}.csv`);
      toast({ message: 'File CSV sudah diunduh' });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Gagal mengekspor. Periksa koneksi lalu coba lagi.';
      toast({ message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="secondary"
      loading={busy}
      onClick={() => void onClick()}
      icon={<Download className="size-4" aria-hidden />}
      className={className}
    >
      {label}
    </Button>
  );
}
