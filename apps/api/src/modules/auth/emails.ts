import type { MailMessage } from '../../lib/mailer';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function passwordResetEmail(
  to: string,
  name: string,
  link: string,
  ttlMinutes: number,
): MailMessage {
  const text = [
    `Halo ${name},`,
    '',
    'Ada permintaan untuk mengatur ulang kata sandi akun Catatku kamu.',
    `Buka tautan ini dalam ${ttlMinutes} menit untuk membuat kata sandi baru:`,
    '',
    link,
    '',
    'Kalau kamu tidak memintanya, abaikan email ini. Kata sandimu tidak berubah.',
    '',
    'Salam,',
    'Catatku',
  ].join('\n');

  const html = `<!doctype html>
<html lang="id">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Inter,system-ui,sans-serif;color:#0f172a">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
      <tr><td>
        <p style="margin:0 0 24px;font-weight:700;font-size:18px;color:#0f766e">Catatku</p>
        <p style="margin:0 0 12px">Halo ${escapeHtml(name)},</p>
        <p style="margin:0 0 24px;line-height:1.5">Ada permintaan untuk mengatur ulang kata sandi akun Catatku kamu. Tautan berlaku ${ttlMinutes} menit.</p>
        <a href="${escapeHtml(link)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px">Atur ulang kata sandi</a>
        <p style="margin:24px 0 0;font-size:14px;line-height:1.5;color:#475569">Kalau kamu tidak memintanya, abaikan email ini. Kata sandimu tidak berubah.</p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { to, subject: 'Atur ulang kata sandi Catatku', text, html };
}
