import { STATEMENT_BANK_NAMES } from '@catatku/shared';
import { Landmark } from 'lucide-react';
import type { ImportDraft } from '../../lib/importFile';
import { useWallets } from '../../lib/queries';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { ColorDot, Select, type SelectOption } from '../ui/Select';

export function StatementWalletStep({
  draft,
  walletId,
  onWalletChange,
  onChangeFile,
  onNext,
  checking,
}: {
  draft: ImportDraft;
  walletId: string;
  onWalletChange: (id: string) => void;
  onChangeFile: () => void;
  onNext: () => void;
  checking: boolean;
}) {
  const wallets = useWallets();
  const bank = STATEMENT_BANK_NAMES[draft.statement!];
  const walletOptions: SelectOption[] = (wallets.data ?? []).map((w) => ({
    value: w.id,
    label: w.name,
    leading: <ColorDot color={w.color} />,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-control bg-surface-muted px-3 py-2">
        <Landmark className="size-5 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{draft.filename}</span>
          <span className="block text-xs text-muted">Mutasi rekening {bank} terdeteksi</span>
        </span>
        <Button variant="ghost" onClick={onChangeFile} className="px-3">
          Ganti file
        </Button>
      </div>

      <Field
        label={`Rekening ${bank} ini dicatat di dompet`}
        hint="Transaksi yang sudah kamu catat di dompet ini akan dikenali agar tidak tercatat dua kali."
      >
        {(a) => (
          <Select
            {...a}
            value={walletId}
            onChange={onWalletChange}
            options={walletOptions}
            placeholder="Pilih dompet"
          />
        )}
      </Field>

      <p className="rounded-control bg-surface-muted p-3 text-sm text-muted">
        File hanya dibaca untuk dicocokkan, tidak disimpan. Catatku tidak pernah meminta kata sandi
        atau akses internet banking.
      </p>

      <Button
        size="lg"
        onClick={onNext}
        loading={checking}
        disabled={!walletId}
        className="w-full sm:w-auto sm:self-end"
      >
        Cocokkan transaksi
      </Button>
    </div>
  );
}
