import mongoose from 'mongoose';
import { Branch } from './branch.model.js';
import { StoreSetting } from '../settings/settings.model.js';
import { User } from '../auth/user.model.js';
import { writeAuditLog } from '../audit/audit.service.js';
import {
  Batch,
  Product,
  ProductBranchStock,
  ProductRefund,
  SalePayment,
  StockAdjustment,
} from '../../modules/product/product.models.js';
import {
  InventoryAudit,
  InventoryCheck,
  InventoryCheckProduct,
  InventoryProduct,
  InventoryVoucher,
  WarehouseTransfer,
} from '../../modules/warehouse/warehouse.models.js';

const DEFAULT_FOOTER = 'Cảm ơn quý khách đã mua hàng!';

const INVOICE_PROFILE_DEFAULTS = {
  displayName: '',
  templateId: 'retail-a4-classic',
  footerText: DEFAULT_FOOTER,
  showBranchName: false,
  showCashier: true,
  showProductCode: false,
  showLogo: false,
};

const CANONICAL_BRANCHES = {
  hanoi: {
    key: 'hanoi',
    name: 'Kho Hà Nội',
    canonicalCode: 'KHO-HN',
    legacyCodes: ['HN'],
    aliases: ['Kho Hà Nội', 'Hà Nội', 'HN'],
  },
  hcm: {
    key: 'hcm',
    name: 'Kho HCM',
    canonicalCode: 'KHO-HCM',
    legacyCodes: ['HCM'],
    aliases: ['Kho HCM', 'Kho Hồ Chí Minh', 'Hồ Chí Minh', 'HCM', 'TP HCM'],
  },
} as const;

type CanonicalBranchKey = keyof typeof CANONICAL_BRANCHES;
type MutationAction = 'branch.create' | 'branch.update' | 'branch.set_default' | 'branch.activate' | 'branch.deactivate' | 'branch.delete' | 'branch.delete_blocked';

type MutationContext = {
  req: any;
  branchId?: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

type BranchListQuery = {
  page?: number;
  limit?: number;
  q?: string;
  includeInactive?: boolean;
  status?: 'active' | 'inactive' | 'all';
};

export type BranchUsageSummary = {
  branchId: string;
  branchName: string;
  isDefault: boolean;
  isActive: boolean;
  links: Record<string, number>;
  totalLinked: number;
};

type MigrationSummary = {
  branches: {
    hanoi: { outcome: 'existing' | 'created' | 'skipped'; branchId?: string; code?: string; isDefault?: boolean; isActive?: boolean };
    hcm: { outcome: 'existing' | 'created' | 'skipped'; branchId?: string; code?: string; isDefault?: boolean; isActive?: boolean };
  };
  productBranchStocksBackfilled: number;
  documentsBackfilled: number;
  skippedDocuments: number;
  warnings: string[];
};

function trim(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCode(value: unknown) {
  return trim(value).toUpperCase();
}

function normalizePhone(value: unknown) {
  const phone = trim(value);
  if (!phone) return '';
  return /^[0-9+\-()\s]+$/.test(phone) ? phone : '';
}

function normalizeAlias(value: unknown) {
  return trim(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanObject<T extends Record<string, any>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function ensureInvoiceProfile(invoiceProfile: any) {
  return {
    ...INVOICE_PROFILE_DEFAULTS,
    ...(invoiceProfile && typeof invoiceProfile === 'object' ? invoiceProfile : {}),
    displayName: trim(invoiceProfile?.displayName),
    footerText: trim(invoiceProfile?.footerText) || DEFAULT_FOOTER,
    templateId: invoiceProfile?.templateId === 'retail-a4-classic' ? 'retail-a4-classic' : 'retail-a4-classic',
    showBranchName: Boolean(invoiceProfile?.showBranchName),
    showCashier: invoiceProfile?.showCashier !== false,
    showProductCode: Boolean(invoiceProfile?.showProductCode),
    showLogo: Boolean(invoiceProfile?.showLogo),
  };
}

function sanitizeBranchPayload(input: any) {
  return {
    name: trim(input?.name),
    code: normalizeCode(input?.code),
    address: trim(input?.address),
    phone: normalizePhone(input?.phone),
    invoiceProfile: ensureInvoiceProfile(input?.invoiceProfile),
  };
}

function sanitizeBranchForAudit(branch: any) {
  if (!branch) return branch;
  const raw = typeof branch.toObject === 'function' ? branch.toObject() : { ...branch };
  return {
    _id: String(raw._id || raw.id || ''),
    name: raw.name || '',
    code: raw.code || '',
    address: raw.address || '',
    phone: raw.phone || '',
    isDefault: Boolean(raw.isDefault),
    isActive: raw.isActive !== false,
    invoiceProfile: ensureInvoiceProfile(raw.invoiceProfile),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function legacyAliasesForKey(key: CanonicalBranchKey | 'central') {
  if (key === 'central') return ['Chi nhánh trung tâm', 'CN001'];
  return [...CANONICAL_BRANCHES[key].aliases, ...CANONICAL_BRANCHES[key].legacyCodes, CANONICAL_BRANCHES[key].canonicalCode];
}

function canonicalKeyFromValue(value: unknown): CanonicalBranchKey | null {
  const normalized = normalizeAlias(value);
  if (!normalized) return null;
  if (['kho ha noi', 'ha noi', 'hn'].includes(normalized)) return 'hanoi';
  if (['kho hcm', 'kho ho chi minh', 'ho chi minh', 'hcm', 'tp hcm', 'tphcm'].includes(normalized)) return 'hcm';
  return null;
}

function branchLegacyBucket(branch: any): CanonicalBranchKey | 'central' | 'unknown' {
  const code = normalizeCode(branch?.code);
  const name = normalizeAlias(branch?.name);
  const hanoiCodes: string[] = [CANONICAL_BRANCHES.hanoi.canonicalCode, ...CANONICAL_BRANCHES.hanoi.legacyCodes];
  const hcmCodes: string[] = [CANONICAL_BRANCHES.hcm.canonicalCode, ...CANONICAL_BRANCHES.hcm.legacyCodes];
  if (hanoiCodes.includes(code) || ['kho ha noi', 'ha noi', 'hn'].includes(name)) return 'hanoi';
  if (hcmCodes.includes(code) || ['kho hcm', 'kho ho chi minh', 'ho chi minh', 'hcm', 'tp hcm', 'tphcm'].includes(name)) return 'hcm';
  if (['CN001', 'STOCKCN'].includes(code) || name === 'chi nhanh trung tam') return 'central';
  return 'unknown';
}

function buildLegacyTextQuery(field: string, aliases: string[]) {
  return {
    $or: aliases.map((alias) => ({ [field]: new RegExp(`^${escapeRegExp(alias)}$`, 'i') })),
  };
}

async function writeBranchAudit(action: MutationAction, context: MutationContext) {
  await writeAuditLog(context.req, {
    action,
    module: 'branch',
    resource: 'Branch',
    resourceId: context.branchId,
    before: context.before,
    after: context.after,
    metadata: context.metadata,
  });
}

async function activeDefaultBranch(excludeId?: string, session?: mongoose.ClientSession) {
  const query = Branch.findOne(cleanObject({ isDefault: true, isActive: { $ne: false }, _id: excludeId ? { $ne: excludeId } : undefined }));
  return session ? query.session(session) : query;
}

async function findMatchingBranchByCanonicalKey(key: CanonicalBranchKey) {
  const meta = CANONICAL_BRANCHES[key];
  const byCode = await Branch.findOne({ code: meta.canonicalCode });
  if (byCode) return byCode;

  const branches = await Branch.find({ code: { $in: [...meta.legacyCodes, meta.canonicalCode] as string[] } });
  if (branches.length) return branches[0];

  const allBranches = await Branch.find({}).select('name code isDefault isActive phone address invoiceProfile createdAt updatedAt');
  const aliasSet = new Set(meta.aliases.map((alias) => normalizeAlias(alias)));
  return allBranches.find((branch: any) => aliasSet.has(normalizeAlias(branch.name))) || null;
}

async function enrichExistingBranch(existingBranch: any, storeSetting: any) {
  const invoiceProfile = ensureInvoiceProfile(existingBranch.invoiceProfile);
  const nextAddress = trim(existingBranch.address) || trim(storeSetting?.address);
  const nextPhone = normalizePhone(existingBranch.phone) || normalizePhone(storeSetting?.phone);
  const needsProfile = JSON.stringify(existingBranch.invoiceProfile || {}) !== JSON.stringify(invoiceProfile);
  const needsAddress = !trim(existingBranch.address) && Boolean(nextAddress);
  const needsPhone = !trim(existingBranch.phone) && Boolean(nextPhone);
  if (!needsProfile && !needsAddress && !needsPhone) return false;

  await Branch.collection.updateOne(
    { _id: existingBranch._id },
    {
      $set: cleanObject({
        invoiceProfile,
        address: needsAddress ? nextAddress : undefined,
        phone: needsPhone ? nextPhone : undefined,
      }),
    },
  );
  return true;
}

async function ensureCanonicalBranch(key: CanonicalBranchKey, storeSetting: any, hasDefaultBranch: boolean, warnings: string[]) {
  const meta = CANONICAL_BRANCHES[key];
  const existing = await findMatchingBranchByCanonicalKey(key);
  if (existing) {
    await enrichExistingBranch(existing, storeSetting);
    return {
      branch: await Branch.findById(existing._id),
      outcome: 'existing' as const,
    };
  }

  const conflictingCode = await Branch.findOne({ code: meta.canonicalCode }).lean();
  if (conflictingCode) {
    warnings.push(`Bỏ qua tạo branch ${meta.name} vì mã ${meta.canonicalCode} đang thuộc branch khác.`);
    return { branch: null, outcome: 'skipped' as const };
  }

  const created = await Branch.create({
    name: meta.name,
    code: meta.canonicalCode,
    address: trim(storeSetting?.address) || undefined,
    phone: normalizePhone(storeSetting?.phone) || undefined,
    isActive: true,
    isDefault: hasDefaultBranch ? false : undefined,
    invoiceProfile: ensureInvoiceProfile(undefined),
  });
  return { branch: created, outcome: 'created' as const };
}

function documentNeedsObjectId(value: unknown) {
  return !value || !mongoose.isValidObjectId(String(value));
}

async function ensureBranchMap() {
  const branches = await Branch.find({}).lean();
  const byId = new Map<string, any>();
  const byCode = new Map<string, any>();
  for (const branch of branches) {
    byId.set(String(branch._id), branch);
    byCode.set(normalizeCode(branch.code), branch);
  }
  return { branches, byId, byCode };
}

function exactCodeMatchBranch(branchesByCode: Map<string, any>, value: unknown) {
  const normalized = normalizeCode(value);
  return normalized ? branchesByCode.get(normalized) || null : null;
}

function exactCentralMatch(branches: any[], value: unknown) {
  const normalized = normalizeAlias(value);
  const code = normalizeCode(value);
  return branches.find((branch) => {
    const bucket = branchLegacyBucket(branch);
    if (bucket !== 'central') return false;
    return normalizeAlias(branch.name) === normalized || normalizeCode(branch.code) === code || legacyAliasesForKey('central').some((alias) => normalizeAlias(alias) === normalized || normalizeCode(alias) === code);
  }) || null;
}

function certainMappedBranch(branches: any[], branchesByCode: Map<string, any>, warehouseText?: unknown, warehouseCode?: unknown) {
  const directCode = exactCodeMatchBranch(branchesByCode, warehouseCode) || exactCodeMatchBranch(branchesByCode, warehouseText);
  if (directCode) return directCode;

  const canonicalKey = canonicalKeyFromValue(warehouseText) || canonicalKeyFromValue(warehouseCode);
  if (canonicalKey) {
    const aliasSet = new Set(legacyAliasesForKey(canonicalKey).map((alias) => normalizeAlias(alias)));
    return branches.find((branch) => aliasSet.has(normalizeAlias(branch.name)) || legacyAliasesForKey(canonicalKey).map(normalizeCode).includes(normalizeCode(branch.code))) || null;
  }

  const central = exactCentralMatch(branches, warehouseCode) || exactCentralMatch(branches, warehouseText);
  return central || null;
}

async function backfillProductStocks(branchLookup: { branches: any[]; byCode: Map<string, any> }, warnings: string[]) {
  let count = 0;
  const defaultBranch = branchLookup.branches.find((branch) => branch.isDefault);
  const defaultBranchBucket = defaultBranch ? branchLegacyBucket(defaultBranch) : 'unknown';
  const productCursor = Product.find({}).lean().cursor();

  for await (const product of productCursor as any) {
    const legacyLines = [
      { value: product.stockHanoi, branch: certainMappedBranch(branchLookup.branches, branchLookup.byCode, 'Kho Hà Nội') },
      { value: product.stockHCM, branch: certainMappedBranch(branchLookup.branches, branchLookup.byCode, 'Kho HCM') },
      {
        value: product.stockCN,
        branch: defaultBranch && defaultBranchBucket === 'central' ? defaultBranch : null,
        warnWhenSkipped: Boolean(product.stockCN) && defaultBranch && defaultBranchBucket !== 'central',
      },
    ];

    if (legacyLines[2].warnWhenSkipped) {
      warnings.push(`Bỏ qua stockCN của sản phẩm ${product.code || product._id} vì không xác định chắc chắn branch mặc định trung tâm.`);
    }

    for (const line of legacyLines) {
      const qty = Number(line.value);
      if (!line.branch || !Number.isFinite(qty) || qty <= 0) continue;
      const existing = await ProductBranchStock.findOne({ productId: product._id, branchId: line.branch._id }).lean();
      if (existing) continue;
      await ProductBranchStock.create({
        productId: product._id,
        branchId: line.branch._id,
        qty,
        minQuantity: Number(product.minQuantity || 0),
        maxQuantity: Number(product.maxQuantity || 999999999),
      });
      count += 1;
    }
  }

  return count;
}

async function backfillCollectionBranchId(options: {
  model: any;
  branchLookup: { branches: any[]; byCode: Map<string, any> };
  textField?: string;
  codeField?: string;
  branchIdField?: string;
  updateBuilder?: (doc: any, branch: any) => Record<string, any> | null;
}) {
  let backfilled = 0;
  let skipped = 0;
  const cursor = options.model.find({}).lean().cursor();
  for await (const doc of cursor as any) {
    const branchIdField = options.branchIdField || 'branchId';
    const currentBranchId = doc[branchIdField];
    if (!documentNeedsObjectId(currentBranchId)) continue;

    const branch = certainMappedBranch(
      options.branchLookup.branches,
      options.branchLookup.byCode,
      options.textField ? doc[options.textField] : undefined,
      options.codeField ? doc[options.codeField] : undefined,
    );
    if (!branch) {
      skipped += 1;
      continue;
    }

    const payload = options.updateBuilder
      ? options.updateBuilder(doc, branch)
      : { [branchIdField]: branch._id };
    if (!payload || Object.keys(payload).length === 0) continue;
    await options.model.collection.updateOne({ _id: doc._id }, { $set: payload });
    backfilled += 1;
  }
  return { backfilled, skipped };
}

async function backfillUserWarehouseLinks(branchLookup: { branches: any[]; byCode: Map<string, any> }) {
  let backfilled = 0;
  let skipped = 0;
  const users = await User.find({}).select('branchId defaultWarehouseId assignedWarehouseIds').lean();
  for (const user of users) {
    const updates: Record<string, any> = {};
    const branch = documentNeedsObjectId(user.branchId)
      ? certainMappedBranch(branchLookup.branches, branchLookup.byCode, user.branchId, user.branchId)
      : null;
    if (branch) updates.branchId = branch._id;

    const defaultWarehouse = documentNeedsObjectId(user.defaultWarehouseId)
      ? certainMappedBranch(branchLookup.branches, branchLookup.byCode, user.defaultWarehouseId, user.defaultWarehouseId)
      : null;
    if (defaultWarehouse) updates.defaultWarehouseId = defaultWarehouse._id;

    if (Array.isArray(user.assignedWarehouseIds) && user.assignedWarehouseIds.length) {
      const nextAssigned = user.assignedWarehouseIds.map((value: any) => {
        if (!documentNeedsObjectId(value)) return value;
        return certainMappedBranch(branchLookup.branches, branchLookup.byCode, value, value)?._id || null;
      }).filter(Boolean);
      if (nextAssigned.length) updates.assignedWarehouseIds = [...new Set(nextAssigned.map((value: any) => String(value)))].map((value) => new mongoose.Types.ObjectId(value));
    }

    if (!Object.keys(updates).length) {
      skipped += 1;
      continue;
    }

    await User.collection.updateOne({ _id: user._id }, { $set: updates });
    backfilled += 1;
  }
  return { backfilled, skipped };
}

export async function runBranchDataMigration() {
  const storeSetting = await StoreSetting.findOne({ singletonKey: 'store' }).lean();
  const warnings: string[] = [];
  const currentDefault = await Branch.findOne({ isDefault: true }).lean();
  const hanoi = await ensureCanonicalBranch('hanoi', storeSetting, Boolean(currentDefault), warnings);
  const hasDefaultAfterHanoi = Boolean(currentDefault || hanoi.branch?.isDefault);
  const hcm = await ensureCanonicalBranch('hcm', storeSetting, hasDefaultAfterHanoi, warnings);
  const branchLookup = await ensureBranchMap();

  const productBranchStocksBackfilled = await backfillProductStocks(branchLookup, warnings);

  let documentsBackfilled = 0;
  let skippedDocuments = 0;
  const collectionResults = await Promise.all([
    backfillCollectionBranchId({ model: InventoryVoucher, branchLookup, textField: 'warehouse', codeField: 'warehouseCode' }),
    backfillCollectionBranchId({ model: InventoryProduct, branchLookup, textField: 'warehouse' }),
    backfillCollectionBranchId({ model: InventoryCheck, branchLookup, textField: 'warehouse', branchIdField: 'warehouseId' }),
    backfillCollectionBranchId({ model: InventoryCheckProduct, branchLookup, textField: 'warehouse' }),
    backfillCollectionBranchId({ model: StockAdjustment, branchLookup, textField: 'warehouse' }),
    backfillUserWarehouseLinks(branchLookup),
    (async () => {
      let backfilled = 0;
      let skipped = 0;
      const cursor = WarehouseTransfer.find({}).lean().cursor();
      for await (const doc of cursor as any) {
        const payload: Record<string, any> = {};
        if (documentNeedsObjectId(doc.sourceWarehouseId)) {
          const source = certainMappedBranch(branchLookup.branches, branchLookup.byCode, doc.sourceWarehouseName || doc.warehouse, doc.sourceWarehouseCode || doc.sourceWarehouseId);
          if (source?._id) {
            payload.sourceWarehouseId = source._id;
            if (documentNeedsObjectId(doc.fromWarehouse)) payload.fromWarehouse = source._id;
          }
        }
        if (documentNeedsObjectId(doc.destinationWarehouseId)) {
          const destination = certainMappedBranch(branchLookup.branches, branchLookup.byCode, doc.destinationWarehouseName, doc.destinationWarehouseCode || doc.destinationWarehouseId);
          if (destination?._id) {
            payload.destinationWarehouseId = destination._id;
            if (documentNeedsObjectId(doc.toWarehouse)) payload.toWarehouse = destination._id;
          }
        }
        if (!Object.keys(payload).length) {
          skipped += 1;
          continue;
        }
        await WarehouseTransfer.collection.updateOne({ _id: doc._id }, { $set: payload });
        backfilled += 1;
      }
      return { backfilled, skipped };
    })(),
  ]);

  for (const result of collectionResults) {
    documentsBackfilled += Number(result.backfilled || 0);
    skippedDocuments += Number(result.skipped || 0);
  }

  const summary: MigrationSummary = {
    branches: {
      hanoi: {
        outcome: hanoi.outcome,
        branchId: hanoi.branch ? String(hanoi.branch._id) : undefined,
        code: hanoi.branch?.code,
        isDefault: hanoi.branch?.isDefault,
        isActive: hanoi.branch?.isActive,
      },
      hcm: {
        outcome: hcm.outcome,
        branchId: hcm.branch ? String(hcm.branch._id) : undefined,
        code: hcm.branch?.code,
        isDefault: hcm.branch?.isDefault,
        isActive: hcm.branch?.isActive,
      },
    },
    productBranchStocksBackfilled,
    documentsBackfilled,
    skippedDocuments,
    warnings,
  };

  await writeAuditLog(undefined, {
    action: 'branch.migration_backfill',
    module: 'branch',
    resource: 'Branch',
    metadata: summary,
  });

  return summary;
}

export async function resolveBranchReference(input: { branchId?: unknown; warehouse?: unknown; warehouseCode?: unknown; allowInactive?: boolean }) {
  if (input.branchId && mongoose.isValidObjectId(String(input.branchId))) {
    const branch = await Branch.findById(String(input.branchId));
    if (branch && (input.allowInactive || branch.isActive !== false)) return branch;
  }
  const lookup = await ensureBranchMap();
  const branch = certainMappedBranch(lookup.branches, lookup.byCode, input.warehouse, input.warehouseCode);
  if (branch && (input.allowInactive || branch.isActive !== false)) return Branch.findById(branch._id);
  if (input.allowInactive) {
    return await Branch.findOne({ isDefault: true }) || await Branch.findOne();
  }
  return await Branch.findOne({ isDefault: true, isActive: { $ne: false } }) || await Branch.findOne({ isActive: { $ne: false } });
}

export async function listBranchesForUser(user: any, query: BranchListQuery) {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 15), 1), 200);
  const filter: Record<string, any> = {};
  const isAdmin = String(user?.role || '').toUpperCase() === 'ADMIN' || user?.isRootOwner === true;

  if (!isAdmin) {
    const ids = [user?.branchId, ...(Array.isArray(user?.assignedWarehouseIds) ? user.assignedWarehouseIds : []), user?.defaultWarehouseId]
      .filter(Boolean)
      .map((value: any) => String(value));
    filter._id = { $in: [...new Set(ids)] };
    filter.isActive = { $ne: false };
  } else if (query.status === 'active') {
    filter.isActive = { $ne: false };
  } else if (query.status === 'inactive') {
    filter.isActive = false;
  } else if (query.includeInactive !== true) {
    if (query.status === 'all') {
      // keep admin default behavior: all branches
    }
  }

  if (!isAdmin && query.includeInactive) {
    const error: any = new Error('Bạn không có quyền xem kho ngừng hoạt động.');
    error.status = 403;
    throw error;
  }

  const text = trim(query.q);
  if (text) {
    filter.$or = [
      { name: new RegExp(escapeRegExp(text), 'i') },
      { code: new RegExp(escapeRegExp(text), 'i') },
      { address: new RegExp(escapeRegExp(text), 'i') },
      { phone: new RegExp(escapeRegExp(text), 'i') },
    ];
  }

  const [items, total] = await Promise.all([
    Branch.find(filter).sort({ isDefault: -1, isActive: -1, name: 1 }).skip((page - 1) * limit).limit(limit),
    Branch.countDocuments(filter),
  ]);

  return { items, total, page, limit };
}

export async function getBranchByIdForUser(user: any, branchId: string, includeInactive = false) {
  const isAdmin = String(user?.role || '').toUpperCase() === 'ADMIN' || user?.isRootOwner === true;
  const filter: Record<string, any> = { _id: branchId };
  if (!isAdmin) {
    const ids = [user?.branchId, ...(Array.isArray(user?.assignedWarehouseIds) ? user.assignedWarehouseIds : []), user?.defaultWarehouseId]
      .filter(Boolean)
      .map((value: any) => String(value));
    if (!ids.includes(branchId)) {
      const error: any = new Error('Kho hàng nằm ngoài phạm vi được phân công.');
      error.status = 403;
      throw error;
    }
    filter.isActive = { $ne: false };
  } else if (!includeInactive) {
    // Admin can still read inactive by default; no extra filter.
  }

  const branch = await Branch.findOne(filter);
  if (!branch) {
    const error: any = new Error('Không tìm thấy kho hàng.');
    error.status = 404;
    throw error;
  }
  return branch;
}

export async function createBranchRecord(req: any, input: any) {
  const payload = sanitizeBranchPayload(input);
  if (!payload.name) {
    const error: any = new Error('Tên kho là bắt buộc.');
    error.status = 422;
    throw error;
  }
  if (!payload.code) {
    const error: any = new Error('Mã kho là bắt buộc.');
    error.status = 422;
    throw error;
  }

  const existing = await Branch.findOne({ code: payload.code });
  if (existing) {
    const error: any = new Error('Mã kho đã tồn tại.');
    error.status = 409;
    throw error;
  }

  const branch = await Branch.create({
    ...payload,
    isActive: true,
    isDefault: false,
  });

  await writeBranchAudit('branch.create', {
    req,
    branchId: String(branch._id),
    after: sanitizeBranchForAudit(branch),
  });

  return branch;
}

export async function updateBranchRecord(req: any, branchId: string, input: any) {
  const branch = await Branch.findById(branchId);
  if (!branch) {
    const error: any = new Error('Không tìm thấy kho hàng.');
    error.status = 404;
    throw error;
  }

  const before = sanitizeBranchForAudit(branch);
  const payload = sanitizeBranchPayload(input);
  branch.name = payload.name || branch.name;
  branch.address = payload.address;
  branch.phone = payload.phone;
  branch.invoiceProfile = ensureInvoiceProfile(payload.invoiceProfile) as any;
  await branch.save();

  await writeBranchAudit('branch.update', {
    req,
    branchId,
    before,
    after: sanitizeBranchForAudit(branch),
  });

  return branch;
}

export async function setDefaultBranchRecord(req: any, branchId: string) {
  const session = await mongoose.startSession();
  let updatedBranch: any = null;
  let previousDefault: any = null;
  try {
    await session.withTransaction(async () => {
      const branch = await Branch.findById(branchId).session(session);
      if (!branch) {
        const error: any = new Error('Không tìm thấy kho hàng.');
        error.status = 404;
        throw error;
      }
      if (branch.isActive === false) {
        const error: any = new Error('Chỉ kho đang hoạt động mới được đặt mặc định.');
        error.status = 409;
        throw error;
      }

      previousDefault = await Branch.findOne({ isDefault: true }).session(session);
      await Branch.updateMany({ isDefault: true }, { $set: { isDefault: false } }, { session });
      branch.isDefault = true;
      await branch.save({ session });
      updatedBranch = branch;
    });
  } finally {
    await session.endSession();
  }

  await writeBranchAudit('branch.set_default', {
    req,
    branchId,
    before: previousDefault ? sanitizeBranchForAudit(previousDefault) : null,
    after: sanitizeBranchForAudit(updatedBranch),
  });

  return updatedBranch;
}

export async function toggleBranchActiveRecord(req: any, branchId: string, nextActive: boolean) {
  const branch = await Branch.findById(branchId);
  if (!branch) {
    const error: any = new Error('Không tìm thấy kho hàng.');
    error.status = 404;
    throw error;
  }

  if (!nextActive && branch.isDefault) {
    const alternative = await activeDefaultBranch(branchId);
    if (!alternative) {
      const error: any = new Error('Không thể ngừng hoạt động kho mặc định khi chưa có kho mặc định hoạt động khác.');
      error.status = 409;
      throw error;
    }
  }

  const before = sanitizeBranchForAudit(branch);
  branch.isActive = nextActive;
  await branch.save();

  await writeBranchAudit(nextActive ? 'branch.activate' : 'branch.deactivate', {
    req,
    branchId,
    before,
    after: sanitizeBranchForAudit(branch),
  });

  return branch;
}

export async function getBranchUsageSummary(branchId: string) {
  const branch = await Branch.findById(branchId).lean();
  if (!branch) {
    const error: any = new Error('Không tìm thấy kho hàng.');
    error.status = 404;
    throw error;
  }

  const bucket = branchLegacyBucket(branch);
  const aliases = bucket === 'unknown' ? [branch.name, branch.code].filter(Boolean) : legacyAliasesForKey(bucket);
  const saleIds = await SalePayment.find({ branchId: branch._id }).distinct('_id');
  const links: Record<string, number> = {
    productBranchStocks: await ProductBranchStock.countDocuments({ branchId: branch._id }),
    salePayments: await SalePayment.countDocuments({ branchId: branch._id }),
    productRefunds: saleIds.length ? await ProductRefund.countDocuments({ paymentId: { $in: saleIds } }) : 0,
    inventoryVouchers: await InventoryVoucher.countDocuments({ $or: [{ branchId: branch._id }, buildLegacyTextQuery('warehouse', aliases)] }),
    inventoryProducts: await InventoryProduct.countDocuments({ $or: [{ branchId: branch._id }, buildLegacyTextQuery('warehouse', aliases)] }),
    warehouseTransferSource: await WarehouseTransfer.countDocuments({ $or: [{ sourceWarehouseId: branch._id }, { fromWarehouse: branch._id }, buildLegacyTextQuery('sourceWarehouseName', aliases)] }),
    warehouseTransferDestination: await WarehouseTransfer.countDocuments({ $or: [{ destinationWarehouseId: branch._id }, { toWarehouse: branch._id }, buildLegacyTextQuery('destinationWarehouseName', aliases)] }),
    inventoryAudits: await InventoryAudit.countDocuments({ warehouseId: branch._id }),
    inventoryChecks: await InventoryCheck.countDocuments({ $or: [{ warehouseId: branch._id }, buildLegacyTextQuery('warehouse', aliases)] }),
    inventoryCheckProducts: await InventoryCheckProduct.countDocuments(buildLegacyTextQuery('warehouse', aliases)),
    stockAdjustments: await StockAdjustment.countDocuments({ branchId: branch._id }),
    batches: await Batch.countDocuments({ branchId: branch._id }),
    usersBranchId: await User.countDocuments({ branchId: branch._id }),
    usersDefaultWarehouseId: await User.countDocuments({ defaultWarehouseId: branch._id }),
    usersAssignedWarehouseIds: await User.countDocuments({ assignedWarehouseIds: branch._id }),
  };
  const totalLinked = Object.values(links).reduce((sum, value) => sum + Number(value || 0), 0);
  return {
    branchId: String(branch._id),
    branchName: branch.name,
    isDefault: Boolean(branch.isDefault),
    isActive: branch.isActive !== false,
    links,
    totalLinked,
  } satisfies BranchUsageSummary;
}

export async function deleteBranchRecord(req: any, branchId: string) {
  const branch = await Branch.findById(branchId);
  if (!branch) {
    const error: any = new Error('Không tìm thấy kho hàng.');
    error.status = 404;
    throw error;
  }

  const usage = await getBranchUsageSummary(branchId);
  if (branch.isDefault || usage.totalLinked > 0) {
    const error: any = new Error(branch.isDefault ? 'Không thể xóa kho mặc định.' : 'Không thể xóa kho còn dữ liệu liên kết.');
    error.status = 409;
    error.usage = usage;
    await writeBranchAudit('branch.delete_blocked', {
      req,
      branchId,
      before: sanitizeBranchForAudit(branch),
      metadata: { usage },
    });
    throw error;
  }

  const before = sanitizeBranchForAudit(branch);
  await branch.deleteOne();
  await writeBranchAudit('branch.delete', {
    req,
    branchId,
    before,
  });

  return { ok: true };
}
