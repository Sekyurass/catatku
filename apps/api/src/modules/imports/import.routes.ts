import {
  FEATURE_FLAGS,
  importRequestSchema,
  statementImportSchema,
  statementPreviewSchema,
} from '@catatku/shared';
import { Router } from 'express';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import { requireFeature } from '../features/features.routes';
import * as imports from './import.service';
import * as statements from './statement.service';

export function createImportsRouter() {
  const router = Router();
  router.use(requireFeature(FEATURE_FLAGS.CSV_IMPORT));

  router.get('/', async (req, res) => {
    res.json({ items: await imports.listImports(currentUserId(req)) });
  });

  router.post('/preview', async (req, res) => {
    const input = parse(importRequestSchema, req.body);
    res.json(await imports.previewImport(currentUserId(req), input));
  });

  router.post('/', idempotent, async (req, res) => {
    const input = parse(importRequestSchema, req.body);
    const batch = await imports.startImport(currentUserId(req), input);
    res.status(batch.status === 'PROCESSING' ? 202 : 201).json(batch);
  });

  router.post('/statements/preview', async (req, res) => {
    const input = parse(statementPreviewSchema, req.body);
    res.json(await statements.previewStatement(currentUserId(req), input));
  });

  router.post('/statements', idempotent, async (req, res) => {
    const input = parse(statementImportSchema, req.body);
    res.status(201).json(await statements.importStatement(currentUserId(req), input));
  });

  router.get('/:id', async (req, res) => {
    res.json(await imports.getImport(currentUserId(req), req.params.id));
  });

  router.post('/:id/rollback', async (req, res) => {
    res.json(await imports.rollbackImport(currentUserId(req), req.params.id));
  });

  return router;
}
