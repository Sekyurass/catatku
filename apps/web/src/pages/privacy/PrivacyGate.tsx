import { PRIVACY_POLICY_VERSION } from '@catatku/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Logo } from '../../components/Logo';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { useAuth } from '../../lib/auth';
import { useFeature } from '../../lib/features';
import { queryKeys } from '../../lib/queries';
import { FormAlert } from '../auth/AuthLayout';
import { PrivacyPolicyLink } from './PrivacyPolicyLink';

/** Pengguna yang belum menyetujui kebijakan versi terbaru diminta setuju sebelum masuk aplikasi. */
export function PrivacyGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user && user.privacyVersion !== PRIVACY_POLICY_VERSION) return <PrivacyConsentScreen />;
  return children;
}

function PrivacyConsentScreen() {
  const { user, agreePrivacy, logout } = useAuth();
  const quickTextOn = useFeature('natural_input');
  const qc = useQueryClient();
  const errorId = useId();
  const [accepted, setAccepted] = useState(false);
  const [shareQuickText, setShareQuickText] = useState(false);
  const [showError, setShowError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const updated = user?.privacyVersion != null;

  const submit = async () => {
    if (!accepted) {
      setShowError(true);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      // Tidak dicentang ≠ berhenti ikut: pilihan yang sudah ada di Profil dibiarkan.
      await agreePrivacy({ acceptPrivacy: true, ...(shareQuickText && { shareQuickText }) });
      if (shareQuickText) qc.setQueryData(queryKeys.quickTextSharing, true);
    } catch {
      setFormError('Gagal menyimpan. Periksa koneksi lalu coba lagi.');
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-surface">
      <main className="mx-auto flex max-w-md flex-col gap-6 px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-10">
        <Logo className="self-center" />
        <div className="flex flex-col items-center gap-3 pt-6 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
            <ShieldCheck className="size-7" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold">
            {updated ? 'Kebijakan Privasi diperbarui' : 'Satu langkah lagi'}
          </h1>
          <p className="text-sm text-muted">
            Sebelum lanjut, baca bagaimana Catatku menyimpan dan menjaga datamu. Datamu tidak dijual
            dan tidak dipakai untuk iklan.
          </p>
        </div>
        <FormAlert message={formError} />
        <div className="flex flex-col gap-1">
          <Checkbox
            checked={accepted}
            onChange={(v) => {
              setAccepted(v);
              if (v) setShowError(false);
            }}
            invalid={showError}
            describedBy={showError ? errorId : undefined}
            label={
              <>
                Saya sudah membaca dan menyetujui <PrivacyPolicyLink />
              </>
            }
          />
          {showError && (
            <p id={errorId} className="text-sm text-expense-text" role="alert">
              Setujui Kebijakan Privasi untuk melanjutkan
            </p>
          )}
          {quickTextOn && (
            <Checkbox
              checked={shareQuickText}
              onChange={setShareQuickText}
              label="Bantu tingkatkan Ketik cepat (opsional)"
              description="Kirim kalimat ketik cepat yang kamu koreksi, tanpa identitas. Bisa dimatikan kapan saja di Profil."
            />
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Button size="lg" loading={saving} onClick={() => void submit()} className="w-full">
            Setuju & lanjutkan
          </Button>
          <Button variant="ghost" size="lg" onClick={() => void logout()} className="w-full">
            Keluar
          </Button>
        </div>
      </main>
    </div>
  );
}
