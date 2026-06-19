import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { requireOwner } from '../middleware/auth.js';
import { User } from '../auth/user.model.js';
import { normalizeRole, normalizeStatus } from '../auth/role.utils.js';
import { writeAuditLog } from '../audit/audit.service.js';
import { StoreSetting } from './settings.model.js';

const router = Router();

const StoreInput = z.object({
  shopName: z.string().min(1).optional(),
  logoUrl: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  taxCode: z.string().optional().or(z.literal('')),
});

const ChangePasswordInput = z.object({
  currentPassword: z.string().min(6).optional(),
  newPassword: z.string().min(6),
  userId: z.string().optional(),
});

const ChangeOwnerAccountInput = z.object({
  currentPassword: z.string().min(6),
  newEmail: z.string().email().optional().or(z.literal('')),
  newPassword: z.string().min(6).optional().or(z.literal('')),
}).refine((input) => Boolean(input.newEmail || input.newPassword), {
  message: 'Enter a new email or a new password',
});

async function getStoreSetting() {
  return StoreSetting.findOneAndUpdate(
    { singletonKey: 'store' },
    { $setOnInsert: { singletonKey: 'store', shopName: 'LadyStars' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

function authPayload(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeRole(user.role, Boolean(user.isRootOwner)),
    status: normalizeStatus(user.status),
  };
}

function signToken(user: any) {
  const role = normalizeRole(user.role, Boolean(user.isRootOwner));
  return jwt.sign(
    { sub: user.id, role, tokenVersion: user.tokenVersion ?? 0 },
    env.jwtSecret,
    { expiresIn: '7d' },
  );
}

async function ensureEmailAvailable(email: string, ignoreId: string) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing && existing.id !== ignoreId) {
    const error = new Error('Email already exists');
    (error as any).status = 409;
    throw error;
  }
}

router.get('/store', async (_req, res) => {
  res.json(await getStoreSetting());
});

router.patch('/store', requireOwner, async (req, res) => {
  const input = StoreInput.parse(req.body);
  const before = await getStoreSetting();
  const setting = await StoreSetting.findOneAndUpdate(
    { singletonKey: 'store' },
    { $set: { ...input, updatedBy: (req as any).user?.sub } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  await writeAuditLog(req, {
    action: 'settings.update_store',
    module: 'settings',
    resource: 'StoreSetting',
    resourceId: setting.id,
    before,
    after: setting,
  });
  res.json(setting);
});

router.post('/security/change-password', requireOwner, async (req, res) => {
  const input = ChangePasswordInput.parse(req.body);
  const requesterId = (req as any).user?.sub;
  const targetId = input.userId || requesterId;
  const user = await User.findById(targetId);
  if (!user || user.deletedAt) return res.status(404).json({ message: 'User not found' });

  if (!input.userId || input.userId === requesterId) {
    const ok = input.currentPassword ? await bcrypt.compare(input.currentPassword, user.passwordHash) : false;
    if (!ok) return res.status(422).json({ message: 'Current password is incorrect' });
  }

  user.passwordHash = await bcrypt.hash(input.newPassword, 10);
  user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
  await user.save();
  await writeAuditLog(req, {
    action: input.userId ? 'settings.reset_user_password' : 'settings.change_owner_password',
    module: 'settings',
    resource: 'User',
    resourceId: user.id,
    metadata: { targetEmail: user.email },
  });
  res.json({ ok: true });
});

router.post('/security/change-owner-account', requireOwner, async (req, res) => {
  const input = ChangeOwnerAccountInput.parse(req.body);
  const requesterId = (req as any).user?.sub;
  const user = await User.findById(requesterId);
  if (!user || user.deletedAt) return res.status(404).json({ message: 'User not found' });

  const ok = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!ok) return res.status(422).json({ message: 'Current password is incorrect' });

  const before = authPayload(user);
  const nextEmail = input.newEmail?.trim().toLowerCase();
  if (nextEmail && nextEmail !== user.email) {
    await ensureEmailAvailable(nextEmail, user.id);
    user.email = nextEmail;
  }
  if (input.newPassword) {
    user.passwordHash = await bcrypt.hash(input.newPassword, 10);
  }

  user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
  await user.save();

  await writeAuditLog(req, {
    action: 'settings.change_owner_account',
    module: 'settings',
    resource: 'User',
    resourceId: user.id,
    before,
    after: authPayload(user),
    metadata: {
      changedEmail: Boolean(nextEmail && nextEmail !== before.email),
      changedPassword: Boolean(input.newPassword),
    },
  });

  res.json({ ok: true, token: signToken(user), user: authPayload(user) });
});

router.post('/security/logout-user-sessions', requireOwner, async (req, res) => {
  const input = z.object({ userId: z.string() }).parse(req.body);
  const user = await User.findById(input.userId);
  if (!user || user.deletedAt) return res.status(404).json({ message: 'User not found' });
  user.tokenVersion = Number(user.tokenVersion ?? 0) + 1;
  await user.save();
  await writeAuditLog(req, {
    action: 'settings.logout_user_sessions',
    module: 'settings',
    resource: 'User',
    resourceId: user.id,
    metadata: { targetEmail: user.email },
  });
  res.json({ ok: true });
});

export default router;
