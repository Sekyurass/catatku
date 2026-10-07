import type { TransactionDTO, TransactionTemplateDTO } from '@catatku/shared';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { type TransactionKind, TransactionSheet } from './TransactionSheet';

interface QuickAddApi {
  openNew: (kind?: TransactionKind) => void;
  openEdit: (tx: TransactionDTO) => void;
  /** Form baru yang sudah terisi dari template (mis. template tanpa nominal). */
  openFromTemplate: (template: TransactionTemplateDTO) => void;
}

const QuickAddContext = createContext<QuickAddApi | null>(null);

/** Satu sheet transaksi untuk seluruh aplikasi, dibuka dari tombol "+" atau dari daftar. */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    open: boolean;
    editing?: TransactionDTO;
    kind?: TransactionKind;
    template?: TransactionTemplateDTO;
  }>({ open: false });

  const value = useMemo<QuickAddApi>(
    () => ({
      openNew: (kind) => setState({ open: true, kind }),
      openEdit: (editing) => setState({ open: true, editing }),
      openFromTemplate: (template) => setState({ open: true, template }),
    }),
    [],
  );

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <TransactionSheet
        open={state.open}
        editing={state.editing}
        initialKind={state.kind}
        template={state.template}
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
