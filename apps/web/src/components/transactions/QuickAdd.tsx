import type { TransactionDTO, TransactionTemplateDTO } from '@catatku/shared';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { TransactionDetail } from './TransactionDetail';
import {
  type SavedHandler,
  type TransactionKind,
  type TransactionPrefill,
  TransactionSheet,
} from './TransactionSheet';

interface QuickAddApi {
  openNew: (kind?: TransactionKind) => void;
  openEdit: (tx: TransactionDTO) => void;
  /** Detail transaksi tersimpan (baca saja), dengan tombol Ubah dan Hapus. */
  openDetail: (tx: TransactionDTO) => void;
  /** Form baru yang sudah terisi dari template (mis. template tanpa nominal). */
  openFromTemplate: (template: TransactionTemplateDTO) => void;
  /** Form baru terisi dari sumber luar; `onSaved` menerima id transaksi yang tersimpan. */
  openPrefilled: (prefill: TransactionPrefill, onSaved?: SavedHandler) => void;
}

const QuickAddContext = createContext<QuickAddApi | null>(null);

/** Satu sheet transaksi untuk seluruh aplikasi, dibuka dari tombol "+" atau dari daftar. */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    open: boolean;
    editing?: TransactionDTO;
    kind?: TransactionKind;
    template?: TransactionTemplateDTO;
    prefill?: TransactionPrefill;
    onSaved?: SavedHandler;
  }>({ open: false });
  const [detail, setDetail] = useState<TransactionDTO | null>(null);

  const value = useMemo<QuickAddApi>(
    () => ({
      openNew: (kind) => setState({ open: true, kind }),
      openEdit: (editing) => setState({ open: true, editing }),
      openDetail: setDetail,
      openFromTemplate: (template) => setState({ open: true, template }),
      openPrefilled: (prefill, onSaved) => setState({ open: true, prefill, onSaved }),
    }),
    [],
  );

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <TransactionDetail
        tx={detail}
        onClose={() => setDetail(null)}
        onEdit={(editing) => {
          setDetail(null);
          setState({ open: true, editing });
        }}
      />
      <TransactionSheet
        open={state.open}
        editing={state.editing}
        initialKind={state.kind}
        template={state.template}
        prefill={state.prefill}
        onSaved={state.onSaved}
        onClose={() => setState((s) => ({ ...s, open: false }))}
      />
    </QuickAddContext.Provider>
  );
}

export function useQuickAdd() {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error('useQuickAdd harus dipakai di dalam QuickAddProvider');
  return ctx;
}
