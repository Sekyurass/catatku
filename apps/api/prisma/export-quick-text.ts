/**
 * Ekspor dataset ketikan cepat ke JSONL (satu sampel per baris) di stdout:
 *   npm run dataset:export -w @catatku/api > ketik-cepat.jsonl
 * Isinya tanpa identitas (lihat model QuickTextSample). Jangan bagikan di luar tim.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const BATCH = 500;
let cursor: string | undefined;
let total = 0;
for (;;) {
  const rows = await prisma.quickTextSample.findMany({
    take: BATCH,
    ...(cursor && { skip: 1, cursor: { id: cursor } }),
    orderBy: { id: 'asc' },
    select: { id: true, text: true, parsed: true, final: true, corrected: true, createdOn: true },
  });
  for (const { id: _id, createdOn, ...row } of rows) {
    process.stdout.write(
      `${JSON.stringify({ ...row, createdOn: createdOn.toISOString().slice(0, 10) })}\n`,
    );
  }
  total += rows.length;
  if (rows.length < BATCH) break;
  cursor = rows.at(-1)!.id;
}
process.stderr.write(`${total} sampel diekspor\n`);
await prisma.$disconnect();
