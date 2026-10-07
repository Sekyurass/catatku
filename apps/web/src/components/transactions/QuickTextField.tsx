import {
  type CategoryDTO,
  formatRupiah,
  parseQuickText,
  type QuickTextContext,
  type QuickTextResult,
  type WalletDTO,
} from '@catatku/shared';
import { ArrowRight, CircleAlert, Sparkles } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useId, useState } from 'react';
import { cn } from '../../lib/cn';
import { formatDayLabel, today } from '../../lib/format';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';

const KIND_LABEL: Record<QuickTextResult['type'], string> = {
  EXPENSE: 'Keluar',
  INCOME: 'Masuk',
  TRANSFER: 'Transfer',
};

/** Isian wajib yang belum terbaca, untuk diberitahukan setelah form terisi. */
function missingFields(r: QuickTextResult): string[] {
  const missing: string[] = [];
  if (r.amount === null) missing.push('nominal');
  if (r.type === 'TRANSFER') {
    if (!r.walletId) missing.push('dompet asal');
    if (!r.toWalletId) missing.push('dompet tujuan');
  } else if (!r.categoryId) {
    missing.push('kategori');
  }
  return missing;
}

/**
 * "Ketik cepat": satu kalimat → pratinjau → Enter mengisi form di bawahnya. Tidak pernah
 * menyimpan sendiri; pengguna tetap meninjau isian sebelum menekan Simpan.
 */
export function QuickTextField({
  wallets,
  categories,
  suggestCategory,
  onApply,
}: {
  wallets: WalletDTO[];
  categories: CategoryDTO[];
  suggestCategory?: QuickTextContext['suggestCategory'];
  onApply: (result: QuickTextResult, text: string) => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const trimmed = text.trim();
  const result = trimmed
    ? parseQuickText(trimmed, {
        today: today(),
        wallets: wallets.filter((w) => !w.archivedAt),
        categories: categories.filter((c) => !c.archivedAt),
        suggestCategory,
      })
    : null;
  const usable = result && (result.amount !== null || result.note !== '');

  const apply = () => {
    if (!result || !usable) return;
    onApply(result, trimmed);
    const missing = missingFields(result);
    setStatus(
      missing.length
        ? `Form terisi. Belum terbaca: ${missing.join(', ')}.`
        : result.confidence === 'low'
          ? 'Form terisi, tapi ada yang ditebak. Cek lagi sebelum simpan.'
          : 'Form terisi. Cek lagi lalu simpan.',
    );
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    // Enter di sini mengisi form, bukan mengirimnya.
    e.preventDefault();
    apply();
  };

  const walletName = (walletId: string | null) => wallets.find((w) => w.id === walletId)?.name;
  const categoryName = (categoryId: string | null) =>
    categories.find((c) => c.id === categoryId)?.name;

  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-primary/30 bg-primary-soft/40 p-3">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        Ketik cepat
      </label>
      <Input
        id={id}
        icon={Sparkles}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setStatus(null);
        }}
        onKeyDown={onKeyDown}
        placeholder="Mis. makan siang 25rb di warteg"
        enterKeyHint="go"
        autoComplete="off"
        maxLength={200}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-xs text-muted">
        Tulis seperti chat: nominal (25rb, 1,5jt), kapan (kemarin, tgl 3), dompet (pakai BCA), atau
        &ldquo;transfer 200rb bca ke gopay&rdquo;.
      </p>

      {result && usable && (
        <div className="flex flex-col gap-2 pt-1">
          <ul aria-label="Pratinjau ketik cepat" className="flex flex-wrap gap-1.5 text-sm">
            <Chip>{KIND_LABEL[result.type]}</Chip>
            <Chip missing={result.amount === null}>
              {result.amount === null ? 'Nominal belum terbaca' : formatRupiah(result.amount)}
            </Chip>
            {result.type === 'TRANSFER' ? (
              <Chip missing={!result.walletId || !result.toWalletId}>
                {walletName(result.walletId) ?? 'Dompet asal?'}
                <ArrowRight className="size-3.5" aria-label="ke" />
                {walletName(result.toWalletId) ?? 'Dompet tujuan?'}
              </Chip>
            ) : (
              <>
                <Chip missing={!result.categoryId}>
                  {categoryName(result.categoryId) ?? 'Kategori belum terbaca'}
                </Chip>
                {result.walletId && <Chip>{walletName(result.walletId)}</Chip>}
              </>
            )}
            <Chip>{formatDayLabel(result.date ?? today())}</Chip>
            {result.note && <Chip>&ldquo;{result.note}&rdquo;</Chip>}
          </ul>
          <Button variant="secondary" onClick={apply} className="self-start">
            Isi form
          </Button>
        </div>
      )}
      {status && (
        <p role="status" className="text-sm text-muted">
          {status}
        </p>
      )}
    </div>
  );
}

function Chip({ children, missing }: { children: ReactNode; missing?: boolean }) {
  return (
    <li
      className={cn(
        'inline-flex min-h-8 items-center gap-1 rounded-full border bg-surface px-2.5',
        missing ? 'border-warning text-warning-text' : 'border-line text-fg',
      )}
    >
      {missing && <CircleAlert className="size-3.5" aria-hidden />}
      {children}
    </li>
  );
}
