import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'catatku_hide_balance';
const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let hidden = read();

export function setBalanceHidden(next: boolean) {
  hidden = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Mode privat bisa menolak localStorage; pilihan tetap berlaku sampai halaman dimuat ulang.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Total saldo & rincian dompet di Beranda disembunyikan; disimpan per perangkat. */
export function useBalanceHidden() {
  return useSyncExternalStore(subscribe, () => hidden);
}

export const HIDDEN_AMOUNT = 'Rp ••••••';
