import { http } from './http';

const DEFAULT_FOOTER = 'CẢM ƠN QUÝ KHÁCH ĐÃ MUA HÀNG!';

export type BranchInvoiceProfile = {
  displayName?: string;
  templateId?: 'retail-a4-classic';
  footerText?: string;
  showBranchName?: boolean;
  showCashier?: boolean;
  showProductCode?: boolean;
  showLogo?: boolean;
};

export type BranchRecord = {
  _id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  isDefault?: boolean;
  isActive?: boolean;
  invoiceProfile?: BranchInvoiceProfile;
  createdAt?: string;
  updatedAt?: string;
};

export type BranchListResponse = {
  items: BranchRecord[];
  total: number;
  page: number;
  limit: number;
};

export type BranchUsageSummary = {
  branchId: string;
  branchName: string;
  isDefault: boolean;
  isActive: boolean;
  totalLinked: number;
  links: Record<string, number>;
};

export type StoreSettingRecord = {
  shopName?: string;
  logoUrl?: string;
  address?: string;
  phone?: string;
};

function trim(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildInvoiceProfile(branch?: BranchRecord | null, storeSetting?: StoreSettingRecord | null) {
  const invoiceProfile = branch?.invoiceProfile || {};
  const hasBranch = Boolean(branch?._id || branch?.name || branch?.address || branch?.phone);
  return {
    templateId: 'retail-a4-classic' as const,
    brandName: trim(invoiceProfile.displayName) || (hasBranch ? trim(branch?.name) : trim(storeSetting?.shopName)) || 'Cửa hàng',
    address: hasBranch ? trim(branch?.address) : trim(storeSetting?.address),
    phone: hasBranch ? trim(branch?.phone) : trim(storeSetting?.phone),
    footerText: DEFAULT_FOOTER,
    branchName: trim(branch?.name) || '',
    showBranchName: Boolean(invoiceProfile.showBranchName),
    showCashier: false,
    showProductCode: false,
    showLogo: false,
    logoUrl: '',
  };
}

export async function listBranches(params?: Record<string, unknown>) {
  const response = await http.get<BranchListResponse>('/system/branches', { params });
  return response.data;
}

export async function getBranch(branchId: string, params?: Record<string, unknown>) {
  const response = await http.get<BranchRecord>(`/system/branches/${branchId}`, { params });
  return response.data;
}

export async function getStoreSetting() {
  const response = await http.get<StoreSettingRecord>('/settings/store');
  return response.data;
}

export async function createBranch(payload: {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  invoiceProfile?: BranchInvoiceProfile;
  adminPassword: string;
}) {
  const response = await http.post<BranchRecord>('/system/branches', payload);
  return response.data;
}

export async function updateBranch(branchId: string, payload: {
  name: string;
  address?: string;
  phone?: string;
  invoiceProfile?: BranchInvoiceProfile;
  adminPassword: string;
}) {
  const response = await http.patch<BranchRecord>(`/system/branches/${branchId}`, payload);
  return response.data;
}

export async function setDefaultBranch(branchId: string, adminPassword: string) {
  const response = await http.post<BranchRecord>(`/system/branches/${branchId}/set-default`, { adminPassword });
  return response.data;
}

export async function activateBranch(branchId: string, adminPassword: string) {
  const response = await http.post<BranchRecord>(`/system/branches/${branchId}/activate`, { adminPassword });
  return response.data;
}

export async function deactivateBranch(branchId: string, adminPassword: string) {
  const response = await http.post<BranchRecord>(`/system/branches/${branchId}/deactivate`, { adminPassword });
  return response.data;
}

export async function getBranchUsage(branchId: string) {
  const response = await http.get<BranchUsageSummary>(`/system/branches/${branchId}/usage`);
  return response.data;
}

export async function deleteBranch(branchId: string, adminPassword: string) {
  const response = await http.delete<{ ok: true }>(`/system/branches/${branchId}`, {
    data: { adminPassword },
  });
  return response.data;
}
