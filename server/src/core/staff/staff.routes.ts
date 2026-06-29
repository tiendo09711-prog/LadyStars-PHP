import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { z } from 'zod';
import { User } from '../auth/user.model.js';
import { ACTIVE_STATUS, EMPLOYEE_ROLE, LOCKED_STATUS, normalizeRole, normalizeStatus } from '../auth/role.utils.js';
import { writeAuditLog } from '../audit/audit.service.js';
import { AuditLog } from '../audit/audit.model.js';
import { Branch } from '../org/branch.model.js';
import { SalePayment, ProductRefund } from '../../modules/product/product.models.js';

const router = Router();

const StaffInput = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6).optional(),
  phone: z.string().optional().or(z.literal('')),
  status: z.enum([ACTIVE_STATUS, LOCKED_STATUS]).default(ACTIVE_STATUS),
  assignedWarehouseIds: z.array(z.string().min(1)).min(1),
  defaultWarehouseId: z.string().optional().or(z.literal('')),
});

const StaffUpdateInput = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional().or(z.literal('')),
  status: z.enum([ACTIVE_STATUS, LOCKED_STATUS]).optional(),
  assignedWarehouseIds: z.array(z.string().min(1)).min(1).optional(),
  defaultWarehouseId: z.string().optional().or(z.literal('')),
});

const ResetPasswordInput = z.object({ password: z.string().min(6) });

function rejectRoleEscalationBody(body: unknown) {
  if (!body || typeof body !== 'object') return;
  if ('role' in body || 'isRootOwner' in body) {
    const error = new Error('Role fields cannot be changed from staff API');
    (error as any).status = 403;
    throw error;
  }
}

function ensureEmployeeAccount(user: any) {
  if (!user || normalizeRole(user.role, Boolean(user.isRootOwner)) !== EMPLOYEE_ROLE) {
    const error = new Error('Employee not found');
    (error as any).status = 404;
    throw error;
  }
  return user;
}

function uniqueIds(values: unknown[]) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function warehouseSummary(value: any) {
  if (!value) return null;
  if (typeof value === 'string') return { _id: value, name: value, code: '' };
  return {
    _id: String(value._id || value.id || ''),
    name: value.name || value.label || '',
    code: value.code || '',
  };
}

function publicUser(user: any) {
  const assignedWarehouses = (Array.isArray(user.assignedWarehouseIds) ? user.assignedWarehouseIds : [])
    .map(warehouseSummary)
    .filter(Boolean);
  const defaultWarehouse = warehouseSummary(user.defaultWarehouseId);
  return {
    id: user.id,
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: EMPLOYEE_ROLE,
    status: normalizeStatus(user.status),
    assignedWarehouseIds: assignedWarehouses,
    warehouseNames: assignedWarehouses.map((warehouse: any) => warehouse.name).filter(Boolean),
    defaultWarehouseId: defaultWarehouse,
    createdById: typeof user.createdById === 'string'
      ? user.createdById
      : user.createdById
        ? { _id: String(user.createdById._id || user.createdById.id || ''), name: user.createdById.name || '', email: user.createdById.email || '' }
        : null,
    lastLoginAt: user.lastLoginAt,
    lockedAt: user.lockedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function ensureEmailAvailable(email: string, ignoreId?: string) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing && existing.id !== ignoreId) {
    const error = new Error('Email already exists');
    (error as any).status = 409;
    throw error;
  }
}

async function resolveWarehouses(ids: string[], defaultWarehouseId?: string) {
  const normalizedIds = uniqueIds(ids);
  if (!normalizedIds.length) {
    const error = new Error('Phải chọn ít nhất một kho cho nhân viên.');
    (error as any).status = 422;
    throw error;
  }

  const objectIds = normalizedIds.map((value) => {
    if (!Types.ObjectId.isValid(value)) {
      const error = new Error('Kho được phân công không hợp lệ.');
      (error as any).status = 422;
      throw error;
    }
    return new Types.ObjectId(value);
  });

  const warehouses = await Branch.find({ _id: { $in: objectIds }, isActive: { $ne: false } }).select('name code').lean();
  if (warehouses.length !== normalizedIds.length) {
    const error = new Error('Có kho không tồn tại hoặc đã ngừng hoạt động.');
    (error as any).status = 422;
    throw error;
  }

  const warehouseIds = warehouses.map((warehouse) => String(warehouse._id));
  const fallbackDefault = warehouseIds.find((id) => id === String(defaultWarehouseId || '')) || warehouseIds[0];
  return {
    assignedWarehouseIds: warehouseIds.map((id) => new Types.ObjectId(id)),
    defaultWarehouseId: fallbackDefault ? new Types.ObjectId(fallbackDefault) : undefined,
  };
}

function dateRange(query: any) {
  const filter: Record<string, unknown> = {};
  const createdAt: Record<string, Date> = {};
  if (query.from) createdAt.$gte = new Date(String(query.from));
  if (query.to) {
    const end = new Date(String(query.to));
    end.setHours(23, 59, 59, 999);
    createdAt.$lte = end;
  }
  if (Object.keys(createdAt).length) filter.createdAt = createdAt;
  return filter;
}

async function findEmployee(id: string) {
  const user = await User.findOne({ _id: id, deletedAt: { $exists: false } })
    .populate('assignedWarehouseIds defaultWarehouseId createdById', 'name code email');
  return ensureEmployeeAccount(user);
}

router.get('/', async (_req, res) => {
  const items = await User.find({ role: EMPLOYEE_ROLE, deletedAt: { $exists: false } })
    .populate('assignedWarehouseIds defaultWarehouseId createdById', 'name code email')
    .sort({ createdAt: -1 });
  res.json({ items: items.map(publicUser), total: items.length });
});

router.post('/', async (req, res) => {
  rejectRoleEscalationBody(req.body);
  const input = StaffInput.extend({ password: z.string().min(6) }).parse(req.body);
  await ensureEmailAvailable(input.email);
  const warehouses = await resolveWarehouses(input.assignedWarehouseIds, input.defaultWarehouseId);
  const status = normalizeStatus(input.status);
  const actorId = (req as any).user?.sub;
  const employee = await User.create({
    name: input.name,
    email: input.email.toLowerCase(),
    phone: input.phone,
    role: EMPLOYEE_ROLE,
    status,
    passwordHash: await bcrypt.hash(input.password, 10),
    assignedWarehouseIds: warehouses.assignedWarehouseIds,
    defaultWarehouseId: warehouses.defaultWarehouseId,
    branchId: warehouses.defaultWarehouseId,
    createdBy: actorId,
    createdById: actorId,
    isRootOwner: false,
    isActive: true,
    lockedAt: status === LOCKED_STATUS ? new Date() : undefined,
  });
  const populated = await User.findById(employee._id).populate('assignedWarehouseIds defaultWarehouseId createdById', 'name code email');
  await writeAuditLog(req, {
    action: 'staff.create',
    module: 'staff',
    resource: 'User',
    resourceId: employee.id,
    after: publicUser(populated),
  });
  res.status(201).json(publicUser(populated));
});

router.patch('/:id', async (req, res) => {
  rejectRoleEscalationBody(req.body);
  const input = StaffUpdateInput.parse(req.body);
  const employee = await findEmployee(req.params.id);
  if (input.email) await ensureEmailAvailable(input.email, employee.id);
  const before = publicUser(employee);
  if (input.name !== undefined) employee.name = input.name;
  if (input.email !== undefined) employee.email = input.email.toLowerCase();
  if (input.phone !== undefined) employee.phone = input.phone;
  if (input.assignedWarehouseIds) {
    const warehouses = await resolveWarehouses(input.assignedWarehouseIds, input.defaultWarehouseId || String(employee.defaultWarehouseId?._id || employee.defaultWarehouseId || ''));
    employee.assignedWarehouseIds = warehouses.assignedWarehouseIds as any;
    employee.defaultWarehouseId = warehouses.defaultWarehouseId as any;
    employee.branchId = warehouses.defaultWarehouseId as any;
  } else if (input.defaultWarehouseId !== undefined && input.defaultWarehouseId !== '') {
    const currentAssigned = (Array.isArray(employee.assignedWarehouseIds) ? employee.assignedWarehouseIds : []).map((warehouse: any) => String(warehouse._id || warehouse));
    const warehouses = await resolveWarehouses(currentAssigned, input.defaultWarehouseId);
    employee.defaultWarehouseId = warehouses.defaultWarehouseId as any;
    employee.branchId = warehouses.defaultWarehouseId as any;
  }
  if (input.status !== undefined) {
    const nextStatus = normalizeStatus(input.status);
    if (nextStatus !== normalizeStatus(employee.status)) {
      employee.status = nextStatus;
      employee.lockedAt = nextStatus === LOCKED_STATUS ? new Date() : undefined;
      employee.tokenVersion = Number(employee.tokenVersion ?? 0) + 1;
    }
  }
  await employee.save();
  const refreshed = await User.findById(employee._id).populate('assignedWarehouseIds defaultWarehouseId createdById', 'name code email');
  await writeAuditLog(req, {
    action: 'staff.update',
    module: 'staff',
    resource: 'User',
    resourceId: employee.id,
    before,
    after: publicUser(refreshed),
  });
  res.json(publicUser(refreshed));
});

router.patch('/:id/lock', async (req, res) => {
  const employee = await findEmployee(req.params.id);
  const before = publicUser(employee);
  employee.status = LOCKED_STATUS;
  employee.lockedAt = new Date();
  employee.tokenVersion = Number(employee.tokenVersion ?? 0) + 1;
  await employee.save();
  const refreshed = await User.findById(employee._id).populate('assignedWarehouseIds defaultWarehouseId createdById', 'name code email');
  await writeAuditLog(req, { action: 'staff.lock', module: 'staff', resource: 'User', resourceId: employee.id, before, after: publicUser(refreshed) });
  res.json(publicUser(refreshed));
});

router.patch('/:id/open', async (req, res) => {
  const employee = await findEmployee(req.params.id);
  const before = publicUser(employee);
  employee.status = ACTIVE_STATUS;
  employee.lockedAt = undefined;
  employee.tokenVersion = Number(employee.tokenVersion ?? 0) + 1;
  await employee.save();
  const refreshed = await User.findById(employee._id).populate('assignedWarehouseIds defaultWarehouseId createdById', 'name code email');
  await writeAuditLog(req, { action: 'staff.open', module: 'staff', resource: 'User', resourceId: employee.id, before, after: publicUser(refreshed) });
  res.json(publicUser(refreshed));
});

router.delete('/:id', async (req, res) => {
  const employee = await findEmployee(req.params.id);
  if (normalizeStatus(employee.status) !== LOCKED_STATUS) {
    return res.status(422).json({ message: 'Phải khóa tài khoản trước khi xóa.' });
  }
  const before = publicUser(employee);
  employee.deletedAt = new Date();
  employee.isActive = false;
  employee.tokenVersion = Number(employee.tokenVersion ?? 0) + 1;
  await employee.save();
  await writeAuditLog(req, { action: 'staff.delete_soft', module: 'staff', resource: 'User', resourceId: employee.id, before });
  res.status(204).send();
});

router.post('/:id/reset-password', async (req, res) => {
  const input = ResetPasswordInput.parse(req.body);
  const employee = await findEmployee(req.params.id);
  employee.passwordHash = await bcrypt.hash(input.password, 10);
  employee.tokenVersion = Number(employee.tokenVersion ?? 0) + 1;
  await employee.save();
  await writeAuditLog(req, { action: 'staff.reset_password', module: 'staff', resource: 'User', resourceId: employee.id, metadata: { targetEmail: employee.email } });
  res.json({ ok: true });
});

router.get('/:id/stats', async (req, res) => {
  const employee = ensureEmployeeAccount(await User.findById(req.params.id));
  const userId = new Types.ObjectId(employee.id);
  const range = dateRange(req.query);
  const userFilter = {
    ...range,
    $or: [{ userId }, { authorId: userId }, { userCreatedId: userId }, { createdBy: userId }],
  };

  const [sales, refunds] = await Promise.all([
    SalePayment.find(userFilter),
    ProductRefund.find(userFilter),
  ]);

  const revenue = sales.reduce((sum, item) => sum + Number(item.value ?? 0), 0);
  const paid = sales.reduce((sum, item) => sum + Number(item.valuePayment ?? 0), 0);
  const refundValue = refunds.reduce((sum, item) => sum + Number(item.value ?? 0), 0);

  res.json({
    staff: publicUser(employee),
    summary: {
      salesCount: sales.length,
      refundCount: refunds.length,
      revenue,
      paid,
      debt: revenue - paid,
      refundValue,
    },
    recentSales: sales.slice(0, 20),
    recentRefunds: refunds.slice(0, 20),
  });
});

router.get('/:id/activity', async (req, res) => {
  const employee = ensureEmployeeAccount(await User.findById(req.params.id));
  const range = dateRange(req.query);
  const items = await AuditLog.find({ ...range, userId: employee._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ items, total: items.length });
});

export default router;
