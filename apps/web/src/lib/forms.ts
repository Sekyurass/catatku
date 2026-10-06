import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/** Pasang error per field dari API ke form; kembalikan pesan umum untuk sisanya. */
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  knownFields: Array<Path<T>>,
): string | null {
  if (!(err instanceof ApiError)) return 'Terjadi kendala. Coba lagi sebentar lagi.';
  let unhandled = !err.fields;
  for (const [field, message] of Object.entries(err.fields ?? {})) {
    if ((knownFields as string[]).includes(field)) {
      setError(field as Path<T>, { type: 'server', message });
    } else {
      unhandled = true;
    }
  }
  return unhandled ? err.message : null;
}
