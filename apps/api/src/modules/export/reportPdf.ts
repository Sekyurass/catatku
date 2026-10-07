import {
  type CompareDTO,
  formatRupiah,
  type MonthlyReportDTO,
  toDateString,
} from '@catatku/shared';
import PDFDocument from 'pdfkit';

const TEAL = '#0F766E';
const INCOME = '#15803D';
const EXPENSE = '#DC2626';
const MUTED = '#64748B';
const LINE = '#E2E8F0';
const TEXT = '#0F172A';
const MARGIN = 48;

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
const shortDate = (date: string) =>
  new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
const percent = (ratio: number) => `${ratio > 0 ? '+' : ''}${Math.round(ratio * 100)}%`;

export interface MonthlyPdfInput {
  userName: string;
  report: MonthlyReportDTO;
  /** Pengeluaran per kategori bulan ini dibanding bulan sebelumnya. */
  compare: CompareDTO;
}

/** Laporan bulanan A4: ringkasan, grafik harian & per kategori, dan 5 pengeluaran terbesar. */
export function renderMonthlyPdf({ userName, report, compare }: MonthlyPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    info: { Title: `Laporan Catatku ${monthLabel(report.month)}`, Author: 'Catatku' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const width = doc.page.width - MARGIN * 2;
  const left = MARGIN;

  // Kepala
  doc.fillColor(TEAL).font('Helvetica-Bold').fontSize(12).text('Catatku', left, MARGIN);
  doc
    .fillColor(TEXT)
    .fontSize(20)
    .text(`Laporan ${monthLabel(report.month)}`, left, doc.y + 4);
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(10)
    .text(
      `${userName} - dibuat ${dayLabel(toDateString())} ${toDateString().slice(0, 4)}`,
      left,
      doc.y + 2,
    );

  // Kotak ringkasan
  const boxY = doc.y + 16;
  const boxW = (width - 16) / 3;
  const prevExpense = compare.from.expense;
  const boxes = [
    { label: 'Pemasukan', value: formatRupiah(report.income), color: INCOME, note: '' },
    {
      label: 'Pengeluaran',
      value: formatRupiah(report.expense),
      color: EXPENSE,
      note:
        prevExpense > 0
          ? `${percent((report.expense - prevExpense) / prevExpense)} dari bulan lalu`
          : '',
    },
    {
      label: 'Selisih',
      value: formatRupiah(report.net, { signed: true }),
      color: report.net >= 0 ? INCOME : EXPENSE,
      note: '',
    },
  ];
  boxes.forEach((b, i) => {
    const x = left + i * (boxW + 8);
    doc.roundedRect(x, boxY, boxW, 62, 8).fillAndStroke('#F8FAFC', LINE);
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .text(b.label, x + 10, boxY + 10, { width: boxW - 20 });
    doc
      .fillColor(b.color)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(b.value, x + 10, boxY + 24, { width: boxW - 20 });
    if (b.note) {
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(8)
        .text(b.note, x + 10, boxY + 44, { width: boxW - 20 });
    }
    doc.font('Helvetica');
  });

  // Statistik
  let y = boxY + 78;
  const stats = [
    `Rata-rata pengeluaran per hari: ${formatRupiah(report.averageDaily)} (${report.daysCounted} hari)`,
    report.busiestDay
      ? `Hari paling boros: ${dayLabel(report.busiestDay.date)}, ${formatRupiah(report.busiestDay.total)} (${report.busiestDay.count} transaksi)`
      : 'Belum ada pengeluaran bulan ini.',
  ];
  doc.fillColor(TEXT).fontSize(10);
  for (const s of stats) {
    doc.text(s, left, y, { width });
    y = doc.y + 4;
  }

  // Grafik pengeluaran harian
  y += 12;
  y = sectionTitle(doc, 'Pengeluaran harian', y);
  const chartH = 110;
  const max = Math.max(...report.daily.map((d) => d.expense), 1);
  const slot = width / report.daily.length;
  doc
    .moveTo(left, y + chartH)
    .lineTo(left + width, y + chartH)
    .strokeColor(LINE)
    .stroke();
  report.daily.forEach((d, i) => {
    const h = (d.expense / max) * chartH;
    const x = left + i * slot + slot * 0.15;
    if (h > 0) doc.rect(x, y + chartH - h, slot * 0.7, h).fill(EXPENSE);
    const day = i + 1;
    if (day === 1 || day % 5 === 0) {
      doc
        .fillColor(MUTED)
        .fontSize(7)
        .text(String(day), left + i * slot, y + chartH + 3, { width: slot, align: 'center' });
    }
  });
  doc
    .fillColor(MUTED)
    .fontSize(7)
    .text(`Tertinggi ${formatRupiah(max === 1 ? 0 : max)}`, left, y - 2, {
      width,
      align: 'right',
    });
  y += chartH + 22;

  // Per kategori
  y = sectionTitle(doc, 'Pengeluaran per kategori (dibanding bulan lalu)', y);
  const cats = compare.items.filter((c) => c.to > 0).sort((a, b) => b.to - a.to);
  const shown = cats.slice(0, 8);
  const catMax = Math.max(...shown.map((c) => c.to), 1);
  if (shown.length === 0) {
    doc.fillColor(MUTED).fontSize(10).text('Belum ada pengeluaran.', left, y);
    y = doc.y + 8;
  }
  const nameW = 120;
  const amountW = 90;
  const changeW = 60;
  const barW = width - nameW - amountW - changeW - 16;
  for (const c of shown) {
    doc
      .fillColor(TEXT)
      .fontSize(9)
      .text(c.name, left, y, { width: nameW - 8, ellipsis: true, lineBreak: false });
    doc.rect(left + nameW, y + 1, barW, 8).fill('#F1F5F9');
    doc.rect(left + nameW, y + 1, Math.max(2, (c.to / catMax) * barW), 8).fill(c.color);
    doc
      .fillColor(TEXT)
      .text(formatRupiah(c.to), left + nameW + barW + 8, y, { width: amountW, align: 'right' });
    doc
      .fillColor(c.change === null ? MUTED : c.diff > 0 ? EXPENSE : INCOME)
      .text(c.change === null ? 'baru' : percent(c.change), left + width - changeW, y, {
        width: changeW,
        align: 'right',
      });
    y += 18;
  }
  if (cats.length > shown.length) {
    const rest = cats.slice(shown.length).reduce((s, c) => s + c.to, 0);
    doc
      .fillColor(MUTED)
      .fontSize(9)
      .text(`${cats.length - shown.length} kategori lain: ${formatRupiah(rest)}`, left, y);
    y += 16;
  }

  // 5 terbesar
  y += 10;
  if (y > doc.page.height - MARGIN - 160) {
    doc.addPage();
    y = MARGIN;
  }
  y = sectionTitle(doc, '5 pengeluaran terbesar', y);
  if (report.topExpenses.length === 0) {
    doc.fillColor(MUTED).fontSize(10).text('Belum ada pengeluaran.', left, y);
  }
  for (const t of report.topExpenses) {
    doc.fillColor(MUTED).fontSize(9).text(shortDate(t.date), left, y, { width: 50 });
    doc.fillColor(TEXT).text(t.note || t.category?.name || 'Tanpa catatan', left + 56, y, {
      width: width - 56 - 200,
      ellipsis: true,
      lineBreak: false,
    });
    doc.fillColor(MUTED).text(t.category?.name ?? '-', left + width - 200, y, {
      width: 100,
      ellipsis: true,
      lineBreak: false,
    });
    doc
      .fillColor(EXPENSE)
      .text(formatRupiah(t.amount), left + width - 100, y, { width: 100, align: 'right' });
    y += 14;
    doc
      .moveTo(left, y)
      .lineTo(left + width, y)
      .strokeColor(LINE)
      .stroke();
    y += 6;
  }

  // Tanpa margin bawah sementara, supaya catatan kaki tidak memicu halaman baru.
  doc.page.margins.bottom = 0;
  doc
    .fillColor(MUTED)
    .fontSize(8)
    .text(
      'Transfer antardompet (termasuk setoran target) tidak dihitung sebagai pemasukan/pengeluaran.',
      left,
      doc.page.height - MARGIN + 16,
      { width, align: 'center', lineBreak: false },
    );

  doc.end();
  return done;
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, y: number): number {
  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(11).text(title, MARGIN, y);
  doc.font('Helvetica');
  return doc.y + 8;
}
