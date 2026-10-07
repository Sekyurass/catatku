import {
  createTemplateSchema,
  FEATURE_FLAGS,
  reorderTemplatesSchema,
  updateTemplateSchema,
  recordTemplateSchema,
} from '@catatku/shared';
import { Router } from 'express';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { idempotent } from '../../middleware/idempotency';
import { requireFeature } from '../features/features.routes';
import * as templates from './template.service';

export function createTemplatesRouter() {
  const router = Router();
  router.use(requireFeature(FEATURE_FLAGS.TEMPLATES));

  router.get('/', async (req, res) => {
    res.json({ items: await templates.listTemplates(currentUserId(req)) });
  });

  router.post('/', async (req, res) => {
    const input = parse(createTemplateSchema, req.body);
    res.status(201).json(await templates.createTemplate(currentUserId(req), input));
  });

  router.put('/order', async (req, res) => {
    const input = parse(reorderTemplatesSchema, req.body);
    res.json({ items: await templates.reorderTemplates(currentUserId(req), input) });
  });

  router.post('/:id/use', idempotent, async (req, res) => {
    const input = parse(recordTemplateSchema, req.body);
    const { id } = req.params as { id: string };
    res.status(201).json(await templates.recordFromTemplate(currentUserId(req), id, input));
  });

  router.patch('/:id', async (req, res) => {
    const input = parse(updateTemplateSchema, req.body);
    res.json(await templates.updateTemplate(currentUserId(req), req.params.id, input));
  });

  router.delete('/:id', async (req, res) => {
    await templates.deleteTemplate(currentUserId(req), req.params.id);
    res.status(204).end();
  });

  return router;
}
