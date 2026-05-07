import { Router } from 'express';
import type { Model } from 'mongoose';
import { crudController } from './crud.js';

export function crudRoutes<T>(model: Model<T>) {
  const router = Router();
  const c = crudController(model);
  router.get('/', c.list);
  router.post('/', c.create);
  router.get('/:id', c.detail);
  router.patch('/:id', c.update);
  router.delete('/:id', c.remove);
  return router;
}
