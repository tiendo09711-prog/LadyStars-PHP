import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { requireAuth, requireOwner } from '../middleware/auth.js';
import { User } from '../auth/user.model.js';
import {
  createBranchRecord,
  deleteBranchRecord,
  getBranchByIdForUser,
  getBranchUsageSummary,
  listBranchesForUser,
  setDefaultBranchRecord,
  toggleBranchActiveRecord,
  updateBranchRecord,
} from './branch.service.js';

const router = Router();

const InvoiceProfileInput = z.object({
  displayName: z.string().optional().or(z.literal('')),
  templateId: z.enum(['retail-a4-classic']).optional(),
  footerText: z.string().optional().or(z.literal('')),
  showBranchName: z.boolean().optional(),
  showCashier: z.boolean().optional(),
  showProductCode: z.boolean().optional(),
  showLogo: z.boolean().optional(),
});

const CreateBranchInput = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  address: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  invoiceProfile: InvoiceProfileInput.optional(),
  adminPassword: z.string().min(1),
});

const UpdateBranchInput = z.object({
  name: z.string().min(1),
  address: z.string().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  invoiceProfile: InvoiceProfileInput.optional(),
  adminPassword: z.string().min(1),
});

const AdminPasswordInput = z.object({
  adminPassword: z.string().min(1),
});

async function verifyAdminPassword(req: any, password: string) {
  const userId = req.user?.sub;
  const user = await User.findById(userId).select('passwordHash deletedAt isActive');
  if (!user || user.deletedAt || user.isActive === false) {
    const error: any = new Error('Không tìm thấy tài khoản Admin đang đăng nhập.');
    error.status = 401;
    throw error;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    const error: any = new Error('Mật khẩu Admin không đúng.');
    error.status = 401;
    throw error;
  }
}

router.use(requireAuth);

router.get('/', async (req, res) => {
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 15);
  const q = String(req.query.q || '');
  const status = String(req.query.status || '').trim();
  const includeInactive = String(req.query.includeInactive || '').trim().toLowerCase() === 'true';
  const result = await listBranchesForUser((req as any).user, {
    page,
    limit,
    q,
    includeInactive,
    status: status === 'active' || status === 'inactive' || status === 'all' ? status : undefined,
  });
  res.json(result);
});

router.get('/:id', async (req, res) => {
  const includeInactive = String(req.query.includeInactive || '').trim().toLowerCase() === 'true';
  const branch = await getBranchByIdForUser((req as any).user, String(req.params.id || ''), includeInactive);
  res.json(branch);
});

router.post('/', requireOwner, async (req, res) => {
  const input = CreateBranchInput.parse(req.body);
  await verifyAdminPassword(req, input.adminPassword);
  const branch = await createBranchRecord(req, input);
  res.status(201).json(branch);
});

router.patch('/:id', requireOwner, async (req, res) => {
  const input = UpdateBranchInput.parse(req.body);
  await verifyAdminPassword(req, input.adminPassword);
  const branch = await updateBranchRecord(req, String(req.params.id || ''), input);
  res.json(branch);
});

router.post('/:id/set-default', requireOwner, async (req, res) => {
  const input = AdminPasswordInput.parse(req.body);
  await verifyAdminPassword(req, input.adminPassword);
  const branch = await setDefaultBranchRecord(req, String(req.params.id || ''));
  res.json(branch);
});

router.post('/:id/activate', requireOwner, async (req, res) => {
  const input = AdminPasswordInput.parse(req.body);
  await verifyAdminPassword(req, input.adminPassword);
  const branch = await toggleBranchActiveRecord(req, String(req.params.id || ''), true);
  res.json(branch);
});

router.post('/:id/deactivate', requireOwner, async (req, res) => {
  const input = AdminPasswordInput.parse(req.body);
  await verifyAdminPassword(req, input.adminPassword);
  const branch = await toggleBranchActiveRecord(req, String(req.params.id || ''), false);
  res.json(branch);
});

router.get('/:id/usage', requireOwner, async (req, res) => {
  const usage = await getBranchUsageSummary(String(req.params.id || ''));
  res.json(usage);
});

router.delete('/:id', requireOwner, async (req, res) => {
  const input = AdminPasswordInput.parse(req.body || {});
  await verifyAdminPassword(req, input.adminPassword);
  const result = await deleteBranchRecord(req, String(req.params.id || ''));
  res.json(result);
});

export default router;
