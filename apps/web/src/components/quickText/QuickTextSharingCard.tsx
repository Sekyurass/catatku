import { QUICK_TEXT_SAMPLE_RETENTION_DAYS } from '@catatku/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { api } from '../../lib/api';
import { queryKeys, useQuickTextSharing } from '../../lib/queries';
import { Card } from '../ui/Card';
import { Switch } from '../ui/Switch';
import { useToast } from '../ui/Toast';

/** Opt-in dataset ketikan cepat. Default mati; bisa dimatikan kapan saja. */
export function QuickTextSharingCard() {
  const id = useId();
  const sharing = useQuickTextSharing();
  const qc = useQueryClient();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const change = async (enabled: boolean) => {
    setSaving(true);
    try {
      await api('/quick-text/sharing', { method: 'PUT', body: { enabled } });
      qc.setQueryData(queryKeys.quickTextSharing, enabled);
      toast({
        message: enabled ? 'Terima kasih! Koreksi ketik cepat akan dikirim.' : 'Berbagi dimatikan',
      });
    } catch {
      toast({ message: 'Gagal menyimpan. Coba lagi.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start gap-3">
        <label htmlFor={id} className="flex-1 cursor-pointer">
          <span className="block font-medium">Bantu tingkatkan Ketik cepat</span>
          <span id={`${id}-desc`} className="block text-sm text-muted">
            Kirim kalimat ketik cepat yang salah baca beserta koreksimu, supaya pembacanya makin
            pintar.
          </span>
        </label>
        <Switch
          id={id}
          checked={sharing.data ?? false}
          disabled={sharing.isPending || saving}
          describedBy={`${id}-desc ${id}-privacy`}
          onChange={(v) => void change(v)}
        />
      </div>
      <ul id={`${id}-privacy`} className="list-disc pl-5 text-xs text-muted">
        <li>Hanya kalimat yang hasil bacaannya kamu ubah sebelum disimpan.</li>
        <li>Disimpan tanpa nama, email, atau akunmu, jadi tidak bisa dilacak balik.</li>
        <li>Nomor HP, nomor rekening, dan email di kalimat disamarkan otomatis.</li>
        <li>Dihapus otomatis setelah {QUICK_TEXT_SAMPLE_RETENTION_DAYS} hari.</li>
      </ul>
    </Card>
  );
}
