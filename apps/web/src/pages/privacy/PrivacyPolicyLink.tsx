import { Link } from 'react-router-dom';

/** `newTab` dipakai di tengah form supaya isian tidak hilang saat kebijakan dibuka. */
export function PrivacyPolicyLink({ newTab = false }: { newTab?: boolean }) {
  return (
    <Link
      to="/privasi"
      className="font-semibold text-primary underline underline-offset-2"
      {...(newTab && { target: '_blank', rel: 'noopener' })}
    >
      Kebijakan Privasi
    </Link>
  );
}
