import { createCategorySchema, listCategoriesQuery, updateCategorySchema } from '@catatku/shared';
import { Router } from 'express';
import { parse } from '../../lib/validate';
import { currentUserId } from '../../middleware/auth';
import * as categoryService from './category.service';

export function createCategoriesRouter() {
  const router = Router();

  router.get('/', async (req, res) => {
    const { type } = parse(listCategoriesQuery, req.query);
    res.json({ items: await categoryService.listCategories(currentUserId(req), type) });
  });

  router.post('/', async (req, res) => {
    const input = parse(createCategorySchema, req.body);
    res.status(201).json(await categoryService.createCategory(currentUserId(req), input));
  });

  router.patch('/:id', async (req, res) => {
    const input = parse(updateCategorySchema, req.body);
    res.json(await categoryService.updateCategory(currentUserId(req), req.params.id, input));
  });

  router.delete('/:id', async (req, res) => {
    await categoryService.archiveCategory(currentUserId(req), req.params.id);
    res.status(204).end();
  });

  return router;
}
