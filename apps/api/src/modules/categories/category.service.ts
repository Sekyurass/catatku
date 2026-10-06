import type {
  CategoryDTO,
  CategoryType,
  createCategorySchema,
  UpdateCategoryInput,
} from '@catatku/shared';
import type { Category } from '@prisma/client';
import type { z } from 'zod';
import { conflict, forbidden, notFound, validationError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';

function toDTO(c: Category): CategoryDTO {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    icon: c.icon,
    color: c.color,
    isDefault: c.userId === null,
    archivedAt: c.archivedAt?.toISOString() ?? null,
  };
}

/** Kategori yang terlihat oleh pengguna: bawaan sistem + kustom miliknya. */
const visibleTo = (userId: string) => ({ OR: [{ userId: null }, { userId }] });

export async function listCategories(userId: string, type?: CategoryType): Promise<CategoryDTO[]> {
  const rows = await prisma.category.findMany({
    where: { ...visibleTo(userId), archivedAt: null, ...(type && { type }) },
    orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
  });
  // Kategori "Lainnya" selalu di akhir agar pilihan spesifik lebih mudah dijangkau.
  return rows
    .map(toDTO)
    .sort((a, b) => Number(a.name === 'Lainnya') - Number(b.name === 'Lainnya'));
}

/** Kategori yang boleh dipakai untuk transaksi bertipe `type`. */
export async function findUsableCategory(userId: string, categoryId: string, type: CategoryType) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, ...visibleTo(userId) },
  });
  if (!category || category.archivedAt) {
    throw validationError('Kategori tidak ditemukan', { categoryId: 'Kategori tidak ditemukan' });
  }
  if (category.type !== type) {
    const label = type === 'INCOME' ? 'pemasukan' : 'pengeluaran';
    throw validationError(`Kategori ini bukan untuk ${label}`, {
      categoryId: `Pilih kategori ${label}`,
    });
  }
  return category;
}

async function findOwnCustom(userId: string, categoryId: string): Promise<Category> {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, ...visibleTo(userId) },
  });
  if (!category) throw notFound('Kategori');
  if (category.userId === null) throw forbidden('Kategori bawaan tidak bisa diubah');
  return category;
}

async function assertNameAvailable(
  userId: string,
  name: string,
  type: CategoryType,
  exceptId?: string,
) {
  const clash = await prisma.category.findFirst({
    where: {
      ...visibleTo(userId),
      archivedAt: null,
      type,
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId && { id: { not: exceptId } }),
    },
  });
  if (clash) throw conflict('Nama kategori sudah dipakai', { name: 'Nama kategori sudah dipakai' });
}

export async function createCategory(
  userId: string,
  data: z.output<typeof createCategorySchema>,
): Promise<CategoryDTO> {
  await assertNameAvailable(userId, data.name, data.type);
  return toDTO(await prisma.category.create({ data: { ...data, userId } }));
}

export async function updateCategory(
  userId: string,
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<CategoryDTO> {
  const category = await findOwnCustom(userId, categoryId);
  if (input.name) await assertNameAvailable(userId, input.name, category.type, categoryId);
  return toDTO(await prisma.category.update({ where: { id: categoryId }, data: input }));
}

/** Diarsipkan, bukan dihapus: transaksi lama tetap menampilkan kategorinya. */
export async function archiveCategory(userId: string, categoryId: string): Promise<void> {
  await findOwnCustom(userId, categoryId);
  await prisma.category.update({ where: { id: categoryId }, data: { archivedAt: new Date() } });
}
