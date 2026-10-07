import { FEATURE_FLAGS, renameTagSchema } from '@catatku/shared';
import { Router } from 'express';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import { requireFeature } from '../features/features.routes';
import * as tagService from './tag.service';

export function createTagsRouter() {
  const router = Router();
  router.use(requireFeature(FEATURE_FLAGS.TAGS));

  router.get('/', async (req, res) => {
    res.json({ items: await tagService.listTags(currentUserId(req)) });
  });

  router.patch('/:id', async (req, res) => {
    const { name } = parse(renameTagSchema, req.body);
    res.json(await tagService.renameTag(currentUserId(req), req.params.id, name));
  });

  router.delete('/:id', async (req, res) => {
    await tagService.deleteTag(currentUserId(req), req.params.id);
    res.status(204).end();
  });

  return router;
}
