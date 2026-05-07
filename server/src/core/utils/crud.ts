import type { Model } from 'mongoose';
import type { Request, Response } from 'express';

function cleanPayload(value: any): any {
  if (Array.isArray(value)) return value.map(cleanPayload);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => !(item === '' && (key.endsWith('Id') || key.endsWith('Ids'))))
    .map(([key, item]) => [key, cleanPayload(item)]));
}

export function crudController<T>(model: Model<T>) {
  return {
    async list(req: Request, res: Response) {
      const page = Math.max(Number(req.query.page ?? 1), 1);
      const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
      const q = String(req.query.q ?? '').trim();
      const filter = q ? { $text: { $search: q } } : {};
      const [items, total] = await Promise.all([
        model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
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
      const item = await model.create(cleanPayload(req.body));
      res.status(201).json(item);
    },
    async update(req: Request, res: Response) {
      const item = await model.findByIdAndUpdate(req.params.id, cleanPayload(req.body), { new: true, runValidators: true });
      if (!item) return res.status(404).json({ message: 'Not found' });
      res.json(item);
    },
    async remove(req: Request, res: Response) {
      const item = await model.findByIdAndDelete(req.params.id);
      if (!item) return res.status(404).json({ message: 'Not found' });
      res.status(204).send();
    },
  };
}
