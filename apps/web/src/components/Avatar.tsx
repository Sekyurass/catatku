import type { UserDTO } from '@catatku/shared';
import { useAvatarSrc } from '../lib/avatar';
import { cn } from '../lib/cn';

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Foto profil, atau inisial nama bila belum ada foto. Dekoratif: nama selalu tampil di dekatnya. */
export function Avatar({
  user,
  className,
}: {
  user: Pick<UserDTO, 'id' | 'name' | 'avatarUpdatedAt'>;
  className?: string;
}) {
  const src = useAvatarSrc(user);
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft font-semibold text-primary select-none',
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full animate-appear object-cover" />
      ) : (
        initials(user.name)
      )}
    </span>
  );
}
