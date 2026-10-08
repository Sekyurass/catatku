import { TIME_ZONE_LABELS, TIME_ZONES, type TimeZoneId } from '@catatku/shared';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/cn';
import { useToast } from './ui/Toast';

export function TimeZonePicker() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState<TimeZoneId | null>(null);
  const current = saving ?? user?.timeZone ?? 'Asia/Jakarta';

  const choose = async (zone: TimeZoneId) => {
    if (zone === user?.timeZone || saving) return;
    setSaving(zone);
    try {
      await updateProfile({ timeZone: zone });
      toast({ message: `Zona waktu diganti ke ${TIME_ZONE_LABELS[zone].short}` });
    } catch {
      toast({ message: 'Zona waktu gagal disimpan. Coba lagi.', tone: 'error' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <fieldset disabled={!!saving}>
      <legend className="font-medium">Zona waktu</legend>
      <p className="text-sm text-muted">
        Menentukan "hari ini", bulan berjalan, dan jam pengingat. {TIME_ZONE_LABELS[current].short}:{' '}
        {TIME_ZONE_LABELS[current].region}.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-control bg-surface-muted p-1">
        {TIME_ZONES.map((zone) => (
          <label
            key={zone}
            className={cn(
              'flex min-h-11 cursor-pointer items-center justify-center rounded-[10px] text-sm font-medium transition-colors',
              'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-(--focus)',
              current === zone ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg',
            )}
          >
            <input
              type="radio"
              name="timeZone"
              value={zone}
              checked={current === zone}
              onChange={() => void choose(zone)}
              className="sr-only"
            />
            {TIME_ZONE_LABELS[zone].short}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
