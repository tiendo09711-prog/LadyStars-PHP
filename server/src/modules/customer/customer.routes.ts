import { Router } from 'express';
import { z } from 'zod';
import { crudController } from '../../core/utils/crud.js';
import { crudRoutes } from '../../core/utils/routeFactory.js';
import { writeAuditLog } from '../../core/audit/audit.service.js';
import { getAssignedWarehouseIds, isAdminUser, requireOwner } from '../../core/middleware/auth.js';
import { Customer, CustomerCare, CustomerGroup } from './customer.models.js';
import { buildCustomerMetricsMap, persistCustomerMetrics, recomputeCustomerMetricsByIds } from './customer.metrics.js';
import { Order } from '../orders/orders.models.js';
import { SalePayment } from '../product/product.models.js';

const router = Router();
const customerCrud = crudController(Customer);
const careCrud = crudController(CustomerCare);
const customerRouter = Router();

const CUSTOMER_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'code',
  'type',
  'phone',
  'cardId',
  'customerLevel',
  'status',
  'totalSpent',
  'points',
  'purchaseCount',
  'purchaseProductQuantity',
  'firstPurchaseDate',
  'lastPurchaseDate',
  'purchaseCycleDays',
  'daysSinceLastPurchase',
] as const;

const CUSTOMER_SORT_FIELD_SET = new Set<string>(CUSTOMER_SORT_FIELDS);
const DAY_MONTH_REGEX = /^\d{2}-\d{2}$/;

const customerListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  q: z.string().trim().optional(),
  keyword: z.string().trim().optional(),
  id: z.string().trim().optional(),
  code: z.string().trim().optional(),
  name: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().optional(),
  cardId: z.string().trim().optional(),
  type: z.enum(['person', 'company']).optional(),
  customerLevel: z.string().trim().optional(),
  groupId: z.string().trim().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  birthdayFrom: z.string().trim().regex(DAY_MONTH_REGEX).optional(),
  birthdayTo: z.string().trim().regex(DAY_MONTH_REGEX).optional(),
  totalSpentMin: z.coerce.number().min(0).optional(),
  totalSpentMax: z.coerce.number().min(0).optional(),
  pointsMin: z.coerce.number().min(0).optional(),
  pointsMax: z.coerce.number().min(0).optional(),
  purchaseCountMin: z.coerce.number().min(0).optional(),
  purchaseCountMax: z.coerce.number().min(0).optional(),
  purchaseProductQuantityMin: z.coerce.number().min(0).optional(),
  purchaseProductQuantityMax: z.coerce.number().min(0).optional(),
  purchaseCycleDaysMin: z.coerce.number().min(0).optional(),
  purchaseCycleDaysMax: z.coerce.number().min(0).optional(),
  daysSinceLastPurchaseMin: z.coerce.number().min(0).optional(),
  daysSinceLastPurchaseMax: z.coerce.number().min(0).optional(),
  firstPurchaseDateFrom: z.string().trim().optional(),
  firstPurchaseDateTo: z.string().trim().optional(),
  lastPurchaseDateFrom: z.string().trim().optional(),
  lastPurchaseDateTo: z.string().trim().optional(),
  sort: z.string().trim().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
}).superRefine((value, ctx) => {
  const pairs: Array<[string, number | undefined, string, number | undefined]> = [
    ['totalSpentMin', value.totalSpentMin, 'totalSpentMax', value.totalSpentMax],
    ['pointsMin', value.pointsMin, 'pointsMax', value.pointsMax],
    ['purchaseCountMin', value.purchaseCountMin, 'purchaseCountMax', value.purchaseCountMax],
    ['purchaseProductQuantityMin', value.purchaseProductQuantityMin, 'purchaseProductQuantityMax', value.purchaseProductQuantityMax],
    ['purchaseCycleDaysMin', value.purchaseCycleDaysMin, 'purchaseCycleDaysMax', value.purchaseCycleDaysMax],
    ['daysSinceLastPurchaseMin', value.daysSinceLastPurchaseMin, 'daysSinceLastPurchaseMax', value.daysSinceLastPurchaseMax],
  ];
  for (const [minKey, minValue, maxKey, maxValue] of pairs) {
    if (minValue !== undefined && maxValue !== undefined && minValue > maxValue) {
      ctx.addIssue({ code: 'custom', path: [minKey], message: `${minKey} phải nhỏ hơn hoặc bằng ${maxKey}` });
    }
  }
  if (value.sort && !CUSTOMER_SORT_FIELD_SET.has(value.sort)) {
    ctx.addIssue({ code: 'custom', path: ['sort'], message: 'Sort field không hợp lệ' });
  }
});

function cleanString(value: unknown) {
  const next = String(value ?? '').trim();
  return next || undefined;
}

function toObjectIdLike(value: unknown) {
  const next = String(value ?? '').trim();
  return /^[0-9a-fA-F]{24}$/.test(next) ? next : null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsRegex(value: string) {
  return { $regex: escapeRegex(value), $options: 'i' };
}

function parseDayMonth(value?: string | null) {
  if (!value || !DAY_MONTH_REGEX.test(value)) return null;
  const [month, day] = value.split('-').map((item) => Number(item));
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function toMonthDayNumber(value: { month: number; day: number }) {
  return value.month * 100 + value.day;
}

function matchesBirthdayRange(value: unknown, from?: string, to?: string) {
  if (!from || !to) return true;
  if (!value) return false;
  const date = new Date(value as any);
  if (Number.isNaN(date.getTime())) return false;
  const current = toMonthDayNumber({ month: date.getMonth() + 1, day: date.getDate() });
  const fromValue = parseDayMonth(from);
  const toValue = parseDayMonth(to);
  if (!fromValue || !toValue) return true;
  const start = toMonthDayNumber(fromValue);
  const end = toMonthDayNumber(toValue);
  return start <= end ? current >= start && current <= end : current >= start || current <= end;
}

function parseDateOnly(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function isWithinDateRange(value: unknown, from?: string, to?: string) {
  if (!from && !to) return true;
  if (!value) return false;
  const current = new Date(value as any);
  if (Number.isNaN(current.getTime())) return false;
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (start && current < start) return false;
  if (end) {
    const inclusiveEnd = new Date(end);
    inclusiveEnd.setHours(23, 59, 59, 999);
    if (current > inclusiveEnd) return false;
  }
  return true;
}

function inNumericRange(value: unknown, min?: number, max?: number) {
  if (min === undefined && max === undefined) return true;
  if (value === null || value === undefined || value === '') return false;
  const current = Number(value);
  if (!Number.isFinite(current)) return false;
  if (min !== undefined && current < min) return false;
  if (max !== undefined && current > max) return false;
  return true;
}

function compareNullable(left: unknown, right: unknown, order: 'asc' | 'desc') {
  const leftEmpty = left === null || left === undefined || left === '';
  const rightEmpty = right === null || right === undefined || right === '';
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;
  if (left instanceof Date || right instanceof Date || (typeof left === 'string' && /^\d{4}-\d{2}-\d{2}/.test(left)) || (typeof right === 'string' && /^\d{4}-\d{2}-\d{2}/.test(right))) {
    const leftTime = new Date(left as any).getTime();
    const rightTime = new Date(right as any).getTime();
    return order === 'asc' ? leftTime - rightTime : rightTime - leftTime;
  }
  if (typeof left === 'number' || typeof right === 'number') {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    return order === 'asc' ? leftNumber - rightNumber : rightNumber - leftNumber;
  }
  return order === 'asc'
    ? String(left).localeCompare(String(right), 'vi')
    : String(right).localeCompare(String(left), 'vi');
}

function mergeCustomFilter(req: any, nextFilter: Record<string, any>) {
  req.customFilter = { ...(req.customFilter || {}), ...nextFilter };
}

function scopedCustomerAccess(req: any, res: any, next: any) {
  if (isAdminUser(req.user)) return next();
  const warehouseIds = getAssignedWarehouseIds(req.user);
  if (!warehouseIds.length) return res.status(403).json({ message: 'No assigned warehouse' });

  mergeCustomFilter(req, { branchId: { $in: warehouseIds } });

  if (req.method === 'POST' || req.method === 'PATCH') {
    const targetBranchId = String(req.body.branchId || req.user?.defaultWarehouseId || warehouseIds[0] || '').trim();
    if (!warehouseIds.includes(targetBranchId)) {
      return res.status(403).json({ message: 'Customer branch is outside employee scope' });
    }
    req.body.branchId = targetBranchId;
  }
  next();
}

function normalizeCustomerPayload(body: Record<string, any>) {
  const payload = { ...body };
  if (!payload.code) {
    payload.code = `KH${Math.floor(100000 + Math.random() * 900000)}`;
  }
  if (!payload.birthday && payload.dob) {
    payload.birthday = payload.dob;
  }
  delete payload.dob;
  if (typeof payload.groups === 'string') {
    payload.groups = payload.groups
      .split(',')
      .map((item: string) => item.trim())
      .filter(Boolean);
  }
  return payload;
}

async function listCustomers(req: any, res: any) {
  const parsed = customerListQuerySchema.parse({
    page: req.query.page,
    limit: req.query.limit,
    q: cleanString(req.query.q),
    keyword: cleanString(req.query.keyword),
    id: cleanString(req.query.id),
    code: cleanString(req.query.code),
    name: cleanString(req.query.name),
    phone: cleanString(req.query.phone),
    email: cleanString(req.query.email),
    cardId: cleanString(req.query.cardId),
    type: cleanString(req.query.type),
    customerLevel: cleanString(req.query.customerLevel),
    groupId: cleanString(req.query.groupId),
    status: cleanString(req.query.status),
    birthdayFrom: cleanString(req.query.birthdayFrom),
    birthdayTo: cleanString(req.query.birthdayTo),
    totalSpentMin: req.query.totalSpentMin,
    totalSpentMax: req.query.totalSpentMax,
    pointsMin: req.query.pointsMin,
    pointsMax: req.query.pointsMax,
    purchaseCountMin: req.query.purchaseCountMin,
    purchaseCountMax: req.query.purchaseCountMax,
    purchaseProductQuantityMin: req.query.purchaseProductQuantityMin,
    purchaseProductQuantityMax: req.query.purchaseProductQuantityMax,
    purchaseCycleDaysMin: req.query.purchaseCycleDaysMin,
    purchaseCycleDaysMax: req.query.purchaseCycleDaysMax,
    daysSinceLastPurchaseMin: req.query.daysSinceLastPurchaseMin,
    daysSinceLastPurchaseMax: req.query.daysSinceLastPurchaseMax,
    firstPurchaseDateFrom: cleanString(req.query.firstPurchaseDateFrom),
    firstPurchaseDateTo: cleanString(req.query.firstPurchaseDateTo),
    lastPurchaseDateFrom: cleanString(req.query.lastPurchaseDateFrom),
    lastPurchaseDateTo: cleanString(req.query.lastPurchaseDateTo),
    sort: cleanString(req.query.sort),
    order: cleanString(req.query.order) || 'desc',
  });

  const filter: Record<string, any> = { ...((req as any).customFilter || {}) };
  const keyword = parsed.keyword || parsed.q;
  if (keyword) {
    const regex = containsRegex(keyword);
    filter.$or = [
      { name: regex },
      { phone: regex },
      { code: regex },
      { cardId: regex },
      { email: regex },
    ];
  }
  if (parsed.id) {
    const objectId = toObjectIdLike(parsed.id);
    if (objectId) filter._id = objectId;
    else filter.code = containsRegex(parsed.id);
  }
  if (parsed.code) filter.code = containsRegex(parsed.code);
  if (parsed.name) filter.name = containsRegex(parsed.name);
  if (parsed.phone) filter.phone = containsRegex(parsed.phone);
  if (parsed.email) filter.email = containsRegex(parsed.email);
  if (parsed.cardId) filter.cardId = containsRegex(parsed.cardId);
  if (parsed.type) filter.type = parsed.type;
  if (parsed.customerLevel) filter.customerLevel = { $regex: `^${escapeRegex(parsed.customerLevel)}$`, $options: 'i' };
  if (parsed.status) filter.status = parsed.status;
  if (parsed.groupId) {
    const groupIds = parsed.groupId.split(',').map((item) => item.trim()).filter(Boolean);
    if (groupIds.length) filter.groups = { $in: groupIds };
  }

  const customers = await Customer.find(filter)
    .populate('groups', 'name')
    .lean();
  const metricsMap = await buildCustomerMetricsMap(customers as any[]);
  await persistCustomerMetrics(customers as any[], metricsMap);

  const rows = customers
    .map((customer: any) => {
      const metrics = metricsMap.get(String(customer._id));
      return {
        ...customer,
        totalSpent: metrics?.totalSpent ?? Number(customer.totalSpent || 0),
        purchaseCount: metrics?.purchaseCount ?? Number(customer.purchaseCount || 0),
        purchaseProductQuantity: metrics?.purchaseProductQuantity ?? Number(customer.purchaseProductQuantity || 0),
        firstPurchaseDate: metrics?.firstPurchaseDate ?? customer.firstPurchaseDate ?? null,
        lastPurchaseDate: metrics?.lastPurchaseDate ?? customer.lastPurchaseDate ?? null,
        daysSinceLastPurchase: metrics?.daysSinceLastPurchase ?? customer.daysSinceLastPurchase ?? null,
        purchaseCycleDays: metrics?.purchaseCycleDays ?? customer.purchaseCycleDays ?? null,
        groupNames: Array.isArray(customer.groups) ? customer.groups.map((group: any) => group?.name).filter(Boolean) : [],
      };
    })
    .filter((customer) => matchesBirthdayRange(customer.birthday, parsed.birthdayFrom, parsed.birthdayTo))
    .filter((customer) => inNumericRange(customer.totalSpent, parsed.totalSpentMin, parsed.totalSpentMax))
    .filter((customer) => inNumericRange(customer.points, parsed.pointsMin, parsed.pointsMax))
    .filter((customer) => inNumericRange(customer.purchaseCount, parsed.purchaseCountMin, parsed.purchaseCountMax))
    .filter((customer) => inNumericRange(customer.purchaseProductQuantity, parsed.purchaseProductQuantityMin, parsed.purchaseProductQuantityMax))
    .filter((customer) => inNumericRange(customer.purchaseCycleDays, parsed.purchaseCycleDaysMin, parsed.purchaseCycleDaysMax))
    .filter((customer) => inNumericRange(customer.daysSinceLastPurchase, parsed.daysSinceLastPurchaseMin, parsed.daysSinceLastPurchaseMax))
    .filter((customer) => isWithinDateRange(customer.firstPurchaseDate, parsed.firstPurchaseDateFrom, parsed.firstPurchaseDateTo))
    .filter((customer) => isWithinDateRange(customer.lastPurchaseDate, parsed.lastPurchaseDateFrom, parsed.lastPurchaseDateTo));

  const sortField = parsed.sort && CUSTOMER_SORT_FIELD_SET.has(parsed.sort) ? parsed.sort : 'createdAt';
  rows.sort((left, right) => compareNullable(left[sortField], right[sortField], parsed.order));

  const total = rows.length;
  const startIndex = (parsed.page - 1) * parsed.limit;
  const items = rows.slice(startIndex, startIndex + parsed.limit);

  res.json({
    items,
    total,
    page: parsed.page,
    limit: parsed.limit,
  });
}

async function getCustomerMeta(req: any, res: any) {
  const scopedFilter = { ...((req as any).customFilter || {}) };
  const [levels, groups] = await Promise.all([
    Customer.distinct('customerLevel', { ...scopedFilter, customerLevel: { $nin: [null, ''] } }),
    CustomerGroup.find({}).sort({ name: 1 }).select('name type').lean(),
  ]);
  res.json({
    customerTypes: [
      { value: 'person', label: 'Cá nhân' },
      { value: 'company', label: 'Công ty' },
    ],
    levels: levels
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, 'vi')),
    groups,
  });
}

async function createCustomer(req: any, res: any) {
  const payload = normalizeCustomerPayload(req.body || {});
  req.body = payload;
  return customerCrud.create(req, res);
}

async function updateCustomer(req: any, res: any) {
  req.body = normalizeCustomerPayload(req.body || {});
  return customerCrud.update(req, res);
}

async function removeCustomer(req: any, res: any) {
  const customer = await Customer.findOne({ _id: req.params.id, ...((req as any).customFilter || {}) });
  if (!customer) return res.status(404).json({ message: 'Not found' });

  const phone = cleanString(customer.phone);
  const name = cleanString(customer.name);
  const [saleExists, orderExists] = await Promise.all([
    SalePayment.exists({ customerId: customer._id }),
    phone || name
      ? Order.exists({
        $or: [
          ...(phone ? [{ customerPhone: phone }] : []),
          ...(name ? [{ customerName: name }] : []),
        ],
      })
      : Promise.resolve(null),
  ]);

  if (saleExists || orderExists) {
    return res.status(409).json({ message: 'Không thể xóa khách hàng đã có lịch sử đơn hàng hoặc hóa đơn.' });
  }

  await customer.deleteOne();
  await writeAuditLog(req, {
    action: 'crud.delete',
    module: 'Customer',
    resource: 'Customer',
    resourceId: customer.id,
    before: customer,
  });
  res.status(204).send();
}

customerRouter.use(scopedCustomerAccess);
customerRouter.get('/meta', getCustomerMeta);
customerRouter.get('/', listCustomers);
customerRouter.post('/', createCustomer);
customerRouter.get('/:id', customerCrud.detail);
customerRouter.patch('/:id', updateCustomer);
customerRouter.delete('/:id', removeCustomer);

router.use('/customers', customerRouter);
router.use('/groups', requireOwner, crudRoutes(CustomerGroup));

const careRouter = Router();
careRouter.post('/', async (req, _res, next) => {
  if (req.body.customerCode) {
    const customer = await Customer.findOne({ code: req.body.customerCode });
    if (customer) {
      req.body.customerName = customer.name;
      req.body.customerPhone = customer.phone;
    }
  }
  next();
}, careCrud.create);
careRouter.get('/', careCrud.list);
careRouter.get('/:id', careCrud.detail);
careRouter.patch('/:id', careCrud.update);
careRouter.delete('/:id', careCrud.remove);
router.use('/care', requireOwner, careRouter);

router.post('/sync-metrics', requireOwner, async (req, res) => {
  const customers = await Customer.find({}).select('_id').lean();
  const metricsMap = await recomputeCustomerMetricsByIds(customers.map((customer: any) => String(customer._id)));
  res.json({
    success: true,
    message: `Đã đồng bộ ${metricsMap.size} khách hàng thành công`,
    updatedCount: metricsMap.size,
  });
});

export default router;
