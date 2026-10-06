import type { z } from 'zod';
import { validationError } from './errors';

export function zodFields(issues: z.core.$ZodIssue[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

/** Validasi input dengan skema Zod; melempar VALIDATION_ERROR (400) dengan detail per field. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw validationError('Periksa kembali isian kamu', zodFields(result.error.issues));
  }
  return result.data;
}
