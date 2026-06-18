import { Router } from 'express';
import { AuditLog } from './audit.model.js';

const router = Router();

router.get('/', async (req, res) => {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 15), 1), 200);
  const filter: Record<string, unknown> = {};

  if (req.query.userId) filter.userId = req.query.userId;
  if (req.query.module) filter.module = req.query.module;
  if (req.query.action) filter.action = req.query.action;

  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  res.json({ items, total, page, limit });
});

export default router;
