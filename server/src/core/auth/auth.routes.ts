import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { User } from './user.model.js';
import { ACTIVE_STATUS, LOCKED_STATUS, normalizeRole, normalizeStatus } from './role.utils.js';

const router = Router();
const LoginInput = z.object({ email: z.string().email(), password: z.string().min(6) });

router.post('/login', async (req, res) => {
  const input = LoginInput.parse(req.body);
  const user = await User.findOne({ email: input.email, isActive: true });
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  const role = normalizeRole(user.role, Boolean(user.isRootOwner));
  const status = normalizeStatus(user.status);
  if (user.deletedAt || status === LOCKED_STATUS) return res.status(401).json({ message: 'Account is locked or inactive' });

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
  if (user.role !== role || user.status !== status || (role === 'ADMIN' && user.isRootOwner !== true)) {
    user.role = role;
    user.status = role === 'ADMIN' ? ACTIVE_STATUS : status;
    user.isRootOwner = role === 'ADMIN';
  }
  user.lastLoginAt = new Date();
  await user.save();
  const token = jwt.sign({ sub: user.id, role, tokenVersion: user.tokenVersion ?? 0 }, env.jwtSecret, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role, status: user.status } });
});

router.get('/me', requireAuth, async (req, res) => {
  const userId = (req as any).user?.sub;
  const user = await User.findById(userId).select('name email role status branchId assignedWarehouseIds defaultWarehouseId isActive deletedAt isRootOwner');
  const role = normalizeRole(user?.role, Boolean(user?.isRootOwner));
  const status = normalizeStatus(user?.status);
  if (!user || !user.isActive || user.deletedAt || status === LOCKED_STATUS) return res.status(401).json({ message: 'Invalid token' });
  res.json({ id: user.id, name: user.name, email: user.email, role, status, branchId: user.branchId, assignedWarehouseIds: user.assignedWarehouseIds || [], defaultWarehouseId: user.defaultWarehouseId });
});

export default router;
