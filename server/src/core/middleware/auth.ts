import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { User } from '../auth/user.model.js';
import { ADMIN_ROLE, LOCKED_STATUS, isAdminRole, normalizeRole, normalizeStatus } from '../auth/role.utils.js';

export function isAdminUser(user: any) {
  return isAdminRole(user);
}

export function getAssignedWarehouseIds(user: any) {
  return [
    ...(Array.isArray(user?.assignedWarehouseIds) ? user.assignedWarehouseIds : []),
    user?.defaultWarehouseId,
    user?.branchId,
  ].filter(Boolean).map((value) => String(value));
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub?: string; role?: string; tokenVersion?: number };
    const user = await User.findById(payload.sub).select('name email role status isActive deletedAt tokenVersion branchId assignedWarehouseIds defaultWarehouseId isRootOwner');
    const role = normalizeRole(user?.role, Boolean(user?.isRootOwner));
    const status = normalizeStatus(user?.status);
    if (!user || !user.isActive || user.deletedAt || status === LOCKED_STATUS) {
      return res.status(401).json({ message: 'Account is locked or inactive' });
    }
    if (Number(payload.tokenVersion ?? 0) !== Number(user.tokenVersion ?? 0)) {
      return res.status(401).json({ message: 'Session expired' });
    }
    (req as any).user = {
      sub: user.id,
      role,
      status,
      email: user.email,
      name: user.name,
      branchId: user.branchId,
      assignedWarehouseIds: user.assignedWarehouseIds || [],
      defaultWarehouseId: user.defaultWarehouseId,
      isRootOwner: role === ADMIN_ROLE,
      tokenVersion: user.tokenVersion,
    };
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}

export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!isAdminUser((req as any).user)) {
    return res.status(403).json({ message: 'ADMIN permission required' });
  }
  next();
}

export const requireAdmin = requireOwner;
