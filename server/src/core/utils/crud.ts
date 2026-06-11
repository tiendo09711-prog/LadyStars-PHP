import mongoose, { Model } from 'mongoose';
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
      const limit = Math.min(Math.max(Number(req.query.limit ?? 1000), 1), 1000);
      const q = String(req.query.q ?? '').trim();
      const sortField = req.query.sort ? String(req.query.sort) : 'createdAt';
      const sortOrder = req.query.order === 'asc' ? 1 : -1;

      // Reserved params that are NOT field filters
      const RESERVED = new Set(['page', 'limit', 'q', 'sort', 'order']);

      // Build filter: start with text search if q provided
      const filter: Record<string, any> = { ...((req as any).customFilter || {}), ...(q ? { $text: { $search: q } } : {}) };

      // Add any extra query params as field filters
      for (const [key, val] of Object.entries(req.query)) {
        if (RESERVED.has(key)) continue;
        const strVal = String(val ?? '').trim();
        if (!strVal) continue;

        const isObjectIdField = model.schema.path(key)?.instance === 'ObjectID';
        const isObjectIdValue = /^[0-9a-fA-F]{24}$/.test(strVal);

        if (isObjectIdField || (isObjectIdValue && (key.endsWith('Id') || key === '_id'))) {
          filter[key] = new mongoose.Types.ObjectId(strVal);
        } else if (strVal.includes(',')) {
          const parts = strVal.split(',').map(p => p.trim()).filter(Boolean);
          filter[key] = { $in: parts.map(p => new RegExp(`^${p}$`, 'i')) };
        } else {
          // Use case-insensitive exact match for string fields
          filter[key] = { $regex: `^${strVal}$`, $options: 'i' };
        }
      }

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
