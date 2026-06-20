import mongoose, { Model } from 'mongoose';
import type { Request, Response } from 'express';
import { writeAuditLog } from '../audit/audit.service.js';
import { cacheKey, deleteCachePrefix, getCachedJson, setCachedJson } from '../cache/cache.js';

function cleanPayload(value: any): any {
  if (Array.isArray(value)) return value.map(cleanPayload);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => !(item === '' && (key.endsWith('Id') || key.endsWith('Ids'))))
    .map(([key, item]) => [key, cleanPayload(item)]));
}

export function crudController<T>(model: Model<T>) {
  const modelName = model.modelName;
  const listCachePrefix = `crud:${modelName}:list`;
  const hasPath = (path: string) => Boolean(model.schema.path(path));
  const scopedFilter = (req: Request, base: Record<string, any> = {}) => ({
    ...base,
    ...((req as any).customFilter || {}),
  });
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
      const limit = Math.min(Math.max(Number(req.query.limit ?? 15), 1), 5000);
      const q = String(req.query.q ?? '').trim();
      const sortField = req.query.sort ? String(req.query.sort) : 'createdAt';
      const sortOrder = req.query.order === 'asc' ? 1 : -1;

      // Reserved params that are NOT field filters
      const RESERVED = new Set(['page', 'limit', 'q', 'sort', 'order']);

      // Build filter: start with text search if q provided
      const filter: Record<string, any> = scopedFilter(req, q ? { $text: { $search: q } } : {});

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

      const shouldCache = limit <= 100;
      const key = cacheKey(listCachePrefix, {
        page,
        limit,
        q,
        sortField,
        sortOrder,
        query: req.query,
        customFilter: (req as any).customFilter || {},
      });
      if (shouldCache) {
        const cached = await getCachedJson<Record<string, unknown>>(key);
        if (cached) {
          res.setHeader('X-Cache', 'HIT');
          return res.json(cached);
        }
      }

      const [items, total] = await Promise.all([
        model.find(filter).sort({ [sortField]: sortOrder }).skip((page - 1) * limit).limit(limit),
        model.countDocuments(filter),
      ]);
      const payload = { items, total, page, limit };
      if (shouldCache) await setCachedJson(key, payload, 10);
      res.setHeader('X-Cache', 'MISS');
      res.json(payload);
    },

    async detail(req: Request, res: Response) {
      const item = await model.findOne(scopedFilter(req, { _id: req.params.id }));
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
      await deleteCachePrefix(listCachePrefix);
      res.status(201).json(item);
    },
    async update(req: Request, res: Response) {
      const scope = scopedFilter(req, { _id: req.params.id });
      const before = await model.findOne(scope);
      const item = await model.findOneAndUpdate(scope, withUserFields(req, cleanPayload(req.body), false), { new: true, runValidators: true });
      if (!item) return res.status(404).json({ message: 'Not found' });
      await writeAuditLog(req, {
        action: 'crud.update',
        module: modelName,
        resource: modelName,
        resourceId: (item as any).id,
        before,
        after: item,
      });
      await deleteCachePrefix(listCachePrefix);
      res.json(item);
    },
    async remove(req: Request, res: Response) {
      const item = await model.findOneAndDelete(scopedFilter(req, { _id: req.params.id }));
      if (!item) return res.status(404).json({ message: 'Not found' });
      await writeAuditLog(req, {
        action: 'crud.delete',
        module: modelName,
        resource: modelName,
        resourceId: (item as any).id,
        before: item,
      });
      await deleteCachePrefix(listCachePrefix);
      res.status(204).send();
    },
  };
}
