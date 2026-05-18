import type { Model } from 'mongoose';
import type { Request, Response } from 'express';
import { writeAuditLog } from '../audit/audit.service.js';

function cleanPayload(value: any): any {
  if (Array.isArray(value)) return value.map(cleanPayload);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => !(item === '' && (key.endsWith('Id') || key.endsWith('Ids'))))
    .map(([key, item]) => [key, cleanPayload(item)]));
}

export function crudController<T>(model: Model<T>) {
  const modelName = model.modelName;
  const hasPath = (path: string) => Boolean(model.schema.path(path));
  const withUserFields = (req: Request, payload: Record<string, any>, isCreate: boolean) => {
    const userId = (req as any).user?.sub;
    if (!userId) return payload;
    const next = { ...payload };
    if (isCreate) {
      for (const path of ['userId', 'userCreatedId', 'createdBy', 'authorId', 'ownerId']) {
        if (hasPath(path) && !next[path]) next[path] = userId;
      }
    }
    if (hasPath('updatedBy')) next.updatedBy = userId;
    return next;
  };

  return {
    async list(req: Request, res: Response) {
      const page = Math.max(Number(req.query.page ?? 1), 1);
      const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
      const q = String(req.query.q ?? '').trim();
      const filter = q ? { $text: { $search: q } } : {};
      const sortField = req.query.sort ? String(req.query.sort) : 'createdAt';
      const sortOrder = req.query.order === 'asc' ? 1 : -1;
      const [items, total] = await Promise.all([
        model.find(filter).sort({ [sortField]: sortOrder }).skip((page - 1) * limit).limit(limit),
        model.countDocuments(filter),
      ]);
      res.json({ items, total, page, limit });
    },
    async detail(req: Request, res: Response) {
      const item = await model.findById(req.params.id);
      if (!item) return res.status(404).json({ message: 'Not found' });
      res.json(item);
    },
    async create(req: Request, res: Response) {
      const item = await model.create(withUserFields(req, cleanPayload(req.body), true));
      await writeAuditLog(req, {
        action: 'crud.create',
        module: modelName,
        resource: modelName,
        resourceId: (item as any).id,
        after: item,
      });
      res.status(201).json(item);
    },
    async update(req: Request, res: Response) {
      const before = await model.findById(req.params.id);
      const item = await model.findByIdAndUpdate(req.params.id, withUserFields(req, cleanPayload(req.body), false), { new: true, runValidators: true });
      if (!item) return res.status(404).json({ message: 'Not found' });
      await writeAuditLog(req, {
        action: 'crud.update',
        module: modelName,
        resource: modelName,
        resourceId: (item as any).id,
        before,
        after: item,
      });
      res.json(item);
    },
    async remove(req: Request, res: Response) {
      const item = await model.findByIdAndDelete(req.params.id);
      if (!item) return res.status(404).json({ message: 'Not found' });
      await writeAuditLog(req, {
        action: 'crud.delete',
        module: modelName,
        resource: modelName,
        resourceId: (item as any).id,
        before: item,
      });
      res.status(204).send();
    },
  };
}
