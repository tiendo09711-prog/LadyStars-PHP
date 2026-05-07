import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { User } from './user.model.js';

const router = Router();
const LoginInput = z.object({ email: z.string().email(), password: z.string().min(6) });

router.post('/login', async (req, res) => {
  const input = LoginInput.parse(req.body);
  const user = await User.findOne({ email: input.email, isActive: true });
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
  const token = jwt.sign({ sub: user.id, role: user.role }, env.jwtSecret, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.get('/me', requireAuth, async (req, res) => {
  const userId = (req as any).user?.sub;
  const user = await User.findById(userId).select('name email role branchId isActive');
  if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid token' });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, branchId: user.branchId });
});

export default router;
