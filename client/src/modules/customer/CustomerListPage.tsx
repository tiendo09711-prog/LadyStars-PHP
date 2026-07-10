import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpDown,
  Check,
  ChevronDown,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
  FileDown,
  X,
  HeartHandshake,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { http } from '../../core/api/http';
import { Pagination } from '../../core/components/Pagination';
import './customer-list-page.css';
import * as XLSX from 'xlsx';
import { ExportExcelModal, type ColumnOption } from '../product/components/ExportExcelModal';

type SortField =
  | 'createdAt'
  | 'updatedAt'
  | 'name'
  | 'code'
  | 'type'
  | 'phone'
  | 'cardId'
  | 'customerLevel'
  | 'status'
  | 'totalSpent'
  | 'points'
  | 'purchaseCount'
  | 'purchaseProductQuantity'
  | 'firstPurchaseDate'
  | 'lastPurchaseDate'
  | 'purchaseCycleDays'
  | 'daysSinceLastPurchase';

type SortOrder = 'asc' | 'desc';
type PresetKey = 'all' | 'buyalot' | 'birthday' | 'buyregularly' | 'longtimereturn';

type CustomerFilters = {
  preset: PresetKey;
  keyword: string;
  type: string;
  customerLevel: string;
  groupId: string;
  status: string;
  id: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  cardId: string;
  birthdayFrom: string;
  birthdayTo: string;
  totalSpentMin: string;
  totalSpentMax: string;
  pointsMin: string;
  pointsMax: string;
  purchaseCountMin: string;
  purchaseCountMax: string;
  purchaseProductQuantityMin: string;
  purchaseProductQuantityMax: string;
  purchaseCycleDaysMin: string;
  purchaseCycleDaysMax: string;
  daysSinceLastPurchaseMin: string;
  daysSinceLastPurchaseMax: string;
  firstPurchaseDateFrom: string;
  firstPurchaseDateTo: string;
  lastPurchaseDateFrom: string;
  lastPurchaseDateTo: string;
};

type CustomerRow = {
  _id: string;
  code?: string;
  name?: string;
  type?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  cardId?: string;
  customerLevel?: string;
  birthday?: string;
  address?: string;
  addressLocation?: string;
  note?: string;
  status?: string;
  branchId?: string;
  groups?: Array<{ _id: string; name: string }>;
  groupNames?: string[];
  totalSpent?: number;
  points?: number;
  purchaseCount?: number;
  purchaseProductQuantity?: number;
  firstPurchaseDate?: string | null;
  lastPurchaseDate?: string | null;
  purchaseCycleDays?: number | null;
  daysSinceLastPurchase?: number | null;
  createdAt?: string;
  updatedAt?: string;
};

type CustomerMetaResponse = {
  customerTypes: Array<{ value: string; label: string }>;
  levels: string[];
  groups: Array<{ _id: string; name: string }>;
};

type BranchOption = {
  _id: string;
  name: string;
  code?: string;
};

type CustomerFormState = {
  branchId: string;
  code: string;
  name: string;
  type: string;
  phone: string;
  phone2: string;
  email: string;
  cardId: string;
  customerLevel: string;
  birthday: string;
  addressLocation: string;
  address: string;
  note: string;
  groups: string[];
};

const PAGE_SIZE = 20;

const DEFAULT_FILTERS: CustomerFilters = {
  preset: 'all',
  keyword: '',
  type: '',
  customerLevel: '',
  groupId: '',
  status: '',
  id: '',
  code: '',
  name: '',
  phone: '',
  email: '',
  cardId: '',
  birthdayFrom: '',
  birthdayTo: '',
  totalSpentMin: '',
  totalSpentMax: '',
  pointsMin: '',
  pointsMax: '',
  purchaseCountMin: '',
  purchaseCountMax: '',
  purchaseProductQuantityMin: '',
  purchaseProductQuantityMax: '',
  purchaseCycleDaysMin: '',
  purchaseCycleDaysMax: '',
  daysSinceLastPurchaseMin: '',
  daysSinceLastPurchaseMax: '',
  firstPurchaseDateFrom: '',
  firstPurchaseDateTo: '',
  lastPurchaseDateFrom: '',
  lastPurchaseDateTo: '',
};

const EMPTY_FORM: CustomerFormState = {
  branchId: '',
  code: '',
  name: '',
  type: 'person',
  phone: '',
  phone2: '',
  email: '',
  cardId: '',
  customerLevel: '',
  birthday: '',
  addressLocation: '',
  address: '',
  note: '',
  groups: [],
};

const SORT_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: 'createdAt', label: 'Khách mới tạo' },
  { value: 'name', label: 'Khách hàng' },
  { value: 'totalSpent', label: 'Tổng tiền' },
  { value: 'points', label: 'Điểm' },
  { value: 'purchaseCount', label: 'Số lần mua' },
  { value: 'purchaseProductQuantity', label: 'Số lượng sản phẩm' },
  { value: 'lastPurchaseDate', label: 'Ngày mua gần nhất' },
  { value: 'purchaseCycleDays', label: 'Chu kỳ mua hàng' },
  { value: 'daysSinceLastPurchase', label: 'Số ngày chưa mua' },
];

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN').format(date);
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatCycleDays(value?: number | null) {
  if (value === null || value === undefined) return 'Chưa đủ dữ liệu';
  return `${value} ngày`;
}

function currentMonthPresetRange() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return { birthdayFrom: `${month}-01`, birthdayTo: `${month}-31` };
}

function applyPresetToFilters(preset: PresetKey, source?: CustomerFilters): CustomerFilters {
  const base: CustomerFilters = {
    ...(source || DEFAULT_FILTERS),
    preset,
  };
  if (preset === 'all') {
    return {
      ...base,
      purchaseCountMin: '',
      purchaseCycleDaysMax: '',
      daysSinceLastPurchaseMin: '',
      birthdayFrom: '',
      birthdayTo: '',
    };
  }
  if (preset === 'buyalot') {
    return {
      ...base,
      purchaseCountMin: base.purchaseCountMin || '4',
      purchaseCycleDaysMax: '',
      daysSinceLastPurchaseMin: '',
      birthdayFrom: '',
      birthdayTo: '',
    };
  }
  if (preset === 'birthday') {
    const range = currentMonthPresetRange();
    return {
      ...base,
      purchaseCountMin: base.purchaseCountMin || '4',
      birthdayFrom: base.birthdayFrom || range.birthdayFrom,
      birthdayTo: base.birthdayTo || range.birthdayTo,
      purchaseCycleDaysMax: '',
      daysSinceLastPurchaseMin: '',
    };
  }
  if (preset === 'buyregularly') {
    return {
      ...base,
      purchaseCountMin: base.purchaseCountMin || '4',
      purchaseCycleDaysMax: base.purchaseCycleDaysMax || '60',
      birthdayFrom: '',
      birthdayTo: '',
      daysSinceLastPurchaseMin: '',
    };
  }
  return {
    ...base,
    purchaseCountMin: base.purchaseCountMin || '4',
    purchaseCycleDaysMax: base.purchaseCycleDaysMax || '60',
    daysSinceLastPurchaseMin: base.daysSinceLastPurchaseMin || '60',
    birthdayFrom: '',
    birthdayTo: '',
  };
}

function normalizeLegacyQuery(params: URLSearchParams) {
  const tab = params.get('tab');
  if (!tab) return null;
  const next = new URLSearchParams(params);
  next.delete('tab');
  const threshold = params.get('fromBills') || '4';
  if (tab === 'buyalot') {
    next.set('preset', 'buyalot');
    next.set('purchaseCountMin', threshold);
  } else if (tab === 'birthday') {
    const range = currentMonthPresetRange();
    next.set('preset', 'birthday');
    next.set('purchaseCountMin', threshold);
    next.set('birthdayFrom', range.birthdayFrom);
    next.set('birthdayTo', range.birthdayTo);
  } else if (tab === 'buyregularly') {
    next.set('preset', 'buyregularly');
    next.set('purchaseCountMin', threshold);
    next.set('purchaseCycleDaysMax', params.get('purchaseCycleDaysMax') || '60');
  } else if (tab === 'longtimereturn') {
    next.set('preset', 'longtimereturn');
    next.set('purchaseCountMin', threshold);
    next.set('purchaseCycleDaysMax', params.get('purchaseCycleDaysMax') || '60');
    next.set('daysSinceLastPurchaseMin', params.get('daysSinceLastPurchaseMin') || '60');
  } else {
    next.set('preset', 'all');
  }
  next.delete('fromBills');
  return next;
}

function parseFiltersFromParams(params: URLSearchParams): CustomerFilters {
  const merged = { ...DEFAULT_FILTERS };
  for (const key of Object.keys(DEFAULT_FILTERS) as Array<keyof CustomerFilters>) {
    const value = params.get(key);
    if (value !== null) {
      if (key === 'preset') {
        merged.preset = ['all', 'buyalot', 'birthday', 'buyregularly', 'longtimereturn'].includes(value)
          ? (value as PresetKey)
          : 'all';
      } else {
        merged[key] = value as CustomerFilters[typeof key];
      }
    }
  }
  if (!merged.preset) merged.preset = 'all';
  return merged;
}

function parsePageFromParams(params: URLSearchParams) {
  const value = Number(params.get('page') || 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function parseSortFieldFromParams(params: URLSearchParams): SortField {
  const value = params.get('sort') as SortField | null;
  return SORT_OPTIONS.some((option) => option.value === value) ? (value as SortField) : 'createdAt';
}

function parseSortOrderFromParams(params: URLSearchParams): SortOrder {
  return params.get('order') === 'asc' ? 'asc' : 'desc';
}

function serializeStateToParams(filters: CustomerFilters, page: number, sort: SortField, order: SortOrder) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set('page', String(page));
  if (sort !== 'createdAt') params.set('sort', sort);
  if (order !== 'desc') params.set('order', order);
  return params;
}

function buildApiParams(filters: CustomerFilters, page: number, sort: SortField, order: SortOrder) {
  const params: Record<string, string | number> = { page, limit: PAGE_SIZE, sort, order };
  for (const [key, value] of Object.entries(filters)) {
    if (value) params[key] = value;
  }
  return params;
}

function buildFilterChips(filters: CustomerFilters, meta: CustomerMetaResponse | null) {
  const chips: Array<{ key: keyof CustomerFilters; label: string; value: string }> = [];
  const groupName = meta?.groups.find((group) => group._id === filters.groupId)?.name;
  const pushChip = (key: keyof CustomerFilters, label: string, value: string) => {
    if (value) chips.push({ key, label, value });
  };
  pushChip('keyword', 'Tìm kiếm', filters.keyword);
  pushChip('type', 'Loại', filters.type === 'person' ? 'Cá nhân' : filters.type === 'company' ? 'Công ty' : filters.type);
  pushChip('customerLevel', 'Cấp độ', filters.customerLevel);
  pushChip('groupId', 'Nhóm', groupName || filters.groupId);
  pushChip('status', 'Trạng thái', filters.status);
  pushChip('cardId', 'Mã thẻ', filters.cardId);
  pushChip('id', 'ID/Mã', filters.id);
  pushChip('code', 'Mã khách', filters.code);
  pushChip('name', 'Tên', filters.name);
  pushChip('phone', 'SĐT', filters.phone);
  pushChip('email', 'Email', filters.email);
  pushChip('purchaseCountMin', 'Lần mua từ', filters.purchaseCountMin);
  pushChip('purchaseCycleDaysMax', 'Chu kỳ tối đa', filters.purchaseCycleDaysMax ? `${filters.purchaseCycleDaysMax} ngày` : '');
  pushChip('daysSinceLastPurchaseMin', 'Chưa mua từ', filters.daysSinceLastPurchaseMin ? `${filters.daysSinceLastPurchaseMin} ngày` : '');
  pushChip('birthdayFrom', 'Sinh nhật', filters.birthdayFrom && filters.birthdayTo ? `${filters.birthdayFrom} đến ${filters.birthdayTo}` : '');
  pushChip('totalSpentMin', 'Tổng tiền', filters.totalSpentMin || filters.totalSpentMax ? `${filters.totalSpentMin || '0'} - ${filters.totalSpentMax || '∞'}` : '');
  pushChip('pointsMin', 'Điểm', filters.pointsMin || filters.pointsMax ? `${filters.pointsMin || '0'} - ${filters.pointsMax || '∞'}` : '');
  pushChip('purchaseProductQuantityMin', 'SL đã mua', filters.purchaseProductQuantityMin || filters.purchaseProductQuantityMax ? `${filters.purchaseProductQuantityMin || '0'} - ${filters.purchaseProductQuantityMax || '∞'}` : '');
  pushChip('lastPurchaseDateFrom', 'Mua gần nhất', filters.lastPurchaseDateFrom || filters.lastPurchaseDateTo ? `${filters.lastPurchaseDateFrom || '—'} đến ${filters.lastPurchaseDateTo || '—'}` : '');
  return chips;
}

function getModalInitialState(currentUserBranchId: string, branches: BranchOption[]) {
  return {
    ...EMPTY_FORM,
    branchId: currentUserBranchId || branches[0]?._id || '',
  };
}

const ADVANCED_FILTER_KEYS: Array<keyof CustomerFilters> = [
  'id', 'code', 'name', 'phone', 'email', 'cardId', 'status',
  'birthdayFrom', 'birthdayTo',
  'totalSpentMin', 'totalSpentMax',
  'pointsMin', 'pointsMax',
  'purchaseCountMin', 'purchaseCountMax',
  'purchaseProductQuantityMin', 'purchaseProductQuantityMax',
  'purchaseCycleDaysMin', 'purchaseCycleDaysMax',
  'daysSinceLastPurchaseMin', 'daysSinceLastPurchaseMax',
  'firstPurchaseDateFrom', 'firstPurchaseDateTo',
  'lastPurchaseDateFrom', 'lastPurchaseDateTo',
];

function countActiveAdvancedFilters(filters: CustomerFilters) {
  return ADVANCED_FILTER_KEYS.reduce((count, key) => (filters[key] ? count + 1 : count), 0);
}

export function CustomerListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [meta, setMeta] = useState<CustomerMetaResponse | null>(null);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [currentUserBranchId, setCurrentUserBranchId] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tableBusy, setTableBusy] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedRef = useRef<HTMLDivElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRow | null>(null);
  const [formState, setFormState] = useState<CustomerFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [syncingMetrics, setSyncingMetrics] = useState(false);
  const [openActionId, setOpenActionId] = useState<string | null>(null);

  const filters = useMemo(() => parseFiltersFromParams(searchParams), [searchParams]);
  const page = useMemo(() => parsePageFromParams(searchParams), [searchParams]);
  const sortField = useMemo(() => parseSortFieldFromParams(searchParams), [searchParams]);
  const sortOrder = useMemo(() => parseSortOrderFromParams(searchParams), [searchParams]);

  const [draftFilters, setDraftFilters] = useState<CustomerFilters>(filters);

  useEffect(() => {
    const normalized = normalizeLegacyQuery(searchParams);
    if (normalized && normalized.toString() !== searchParams.toString()) {
      setSearchParams(normalized, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setDraftFilters(filters);
  }, [filters]);

  useEffect(() => {
    if (!advancedOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (advancedRef.current && !advancedRef.current.contains(event.target as Node)) {
        setAdvancedOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAdvancedOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [advancedOpen]);

  useEffect(() => {
    if (!openActionId) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.customer-actions-menu')) setOpenActionId(null);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenActionId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openActionId]);

  const activeAdvancedCount = useMemo(() => countActiveAdvancedFilters(filters), [filters]);

  const filterChips = useMemo(() => buildFilterChips(filters, meta), [filters, meta]);

  const loadMeta = async () => {
    const [metaRes, branchesRes, meRes] = await Promise.all([
      http.get<CustomerMetaResponse>('/customers/customers/meta'),
      http.get<{ items: BranchOption[] }>('/system/branches', { params: { limit: 5000 } }).catch(() => ({ data: { items: [] } })),
      http.get('/auth/me').catch(() => ({ data: {} })),
    ]);
    setMeta(metaRes.data);
    setBranches(branchesRes.data?.items || []);
    setCurrentUserBranchId(String(meRes.data?.defaultWarehouseId || meRes.data?.branchId || ''));
    setIsAdmin(String(meRes.data?.role || '').toUpperCase() === 'ADMIN');
  };

  const loadCustomers = async () => {
    setError('');
    setLoading(items.length === 0);
    setTableBusy(items.length > 0);
    try {
      const response = await http.get('/customers/customers', {
        params: buildApiParams(filters, page, sortField, sortOrder),
      });
      const nextItems = response.data?.items || [];
      const nextTotal = Number(response.data?.total || 0);
      if (page > 1 && nextItems.length === 0 && nextTotal > 0) {
        const nextParams = serializeStateToParams(filters, page - 1, sortField, sortOrder);
        setSearchParams(nextParams, { replace: true });
        return;
      }
      setItems(nextItems);
      setTotal(nextTotal);
      setSelectedIds((current) => {
        const validIds = new Set(nextItems.map((item: CustomerRow) => item._id));
        return new Set([...current].filter((id) => validIds.has(id)));
      });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không tải được danh sách khách hàng.');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
      setTableBusy(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadMeta(), loadCustomers()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, sortField, sortOrder]);

  const applyFilters = (nextFilters: CustomerFilters, nextPage = 1, nextSort = sortField, nextOrder = sortOrder) => {
    setSearchParams(serializeStateToParams(nextFilters, nextPage, nextSort, nextOrder));
  };

  const handleSubmitFilters = (event?: FormEvent) => {
    event?.preventDefault();
    applyFilters(draftFilters, 1);
  };

  const handleApplyAdvancedFilters = () => {
    applyFilters(draftFilters, 1);
    setAdvancedOpen(false);
  };

  const handleClearFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    applyFilters(DEFAULT_FILTERS, 1, 'createdAt', 'desc');
  };

  const handleSelectPreset = (preset: PresetKey) => {
    const nextFilters = applyPresetToFilters(preset, draftFilters);
    setDraftFilters(nextFilters);
    applyFilters(nextFilters, 1);
  };

  const handleRemoveChip = (key: keyof CustomerFilters) => {
    const next = { ...filters, [key]: '', preset: 'all' as PresetKey };
    setDraftFilters(next);
    applyFilters(next, 1);
  };

  const handleSort = (field: SortField) => {
    const nextOrder: SortOrder = sortField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    applyFilters(filters, 1, field, nextOrder);
  };

  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item._id));

  const toggleSelectAll = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      setSelectedIds(new Set(items.map((item) => item._id)));
      return;
    }
    setSelectedIds(new Set());
  };

  const toggleRowSelection = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const openCreateModal = () => {
    setEditingCustomer(null);
    setFormError('');
    setFormState(getModalInitialState(currentUserBranchId, branches));
    setModalOpen(true);
  };

  const openEditModal = (customer: CustomerRow) => {
    setEditingCustomer(customer);
    setFormError('');
    setFormState({
      branchId: String(customer.branchId || currentUserBranchId || branches[0]?._id || ''),
      code: customer.code || '',
      name: customer.name || '',
      type: customer.type || 'person',
      phone: customer.phone || '',
      phone2: customer.phone2 || '',
      email: customer.email || '',
      cardId: customer.cardId || '',
      customerLevel: customer.customerLevel || '',
      birthday: customer.birthday ? String(customer.birthday).slice(0, 10) : '',
      addressLocation: customer.addressLocation || '',
      address: customer.address || '',
      note: customer.note || '',
      groups: Array.isArray(customer.groups) ? customer.groups.map((group) => group._id) : [],
    });
    setModalOpen(true);
  };

  const handleFormChange = (key: keyof CustomerFormState, value: string | string[]) => {
    setFormState((current) => ({ ...current, [key]: value }));
  };

  const handleGroupsChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    handleFormChange('groups', values);
  };

  // Toggle helper for improved groups multi-select (checkboxes instead of native multiple for better UX)
  const toggleGroup = (groupId: string, checked: boolean) => {
    setFormState((current) => {
      const groups = current.groups || [];
      const next = checked ? [...groups, groupId] : groups.filter((id) => id !== groupId);
      return { ...current, groups: next };
    });
  };

  const handleSaveCustomer = async (event: FormEvent) => {
    event.preventDefault();
    if (!formState.name.trim()) {
      setFormError('Vui lòng nhập tên khách hàng.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        branchId: formState.branchId || undefined,
        code: formState.code.trim() || undefined,
        name: formState.name.trim(),
        type: formState.type,
        phone: formState.phone.trim(),
        phone2: formState.phone2.trim(),
        email: formState.email.trim(),
        cardId: formState.cardId.trim(),
        customerLevel: formState.customerLevel.trim(),
        birthday: formState.birthday || undefined,
        addressLocation: formState.addressLocation.trim(),
        address: formState.address.trim(),
        note: formState.note.trim(),
        groups: formState.groups,
      };
      if (editingCustomer?._id) {
        await http.patch(`/customers/customers/${editingCustomer._id}`, payload);
      } else {
        await http.post('/customers/customers', payload);
      }
      setModalOpen(false);
      await Promise.all([loadMeta(), loadCustomers()]);
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Không lưu được khách hàng.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCustomer = async (customer: CustomerRow) => {
    if (!window.confirm(`Xóa khách hàng "${customer.name || customer.code || customer._id}"?`)) return;
    setDeletingId(customer._id);
    try {
      await http.delete(`/customers/customers/${customer._id}`);
      if (items.length === 1 && page > 1) {
        applyFilters(filters, page - 1);
      } else {
        await loadCustomers();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không xóa được khách hàng.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!window.confirm(`Xóa ${count} khách hàng đã chọn?\nHành động này KHÔNG THỂ hoàn tác.`)) return;
    setTableBusy(true);
    setError('');
    try {
      const ids = Array.from(selectedIds);
      // Sequential to be safe with backend
      for (const id of ids) {
        try {
          await http.delete(`/customers/customers/${id}`);
        } catch {
          // continue with others; partial success is acceptable
        }
      }
      setSelectedIds(new Set());
      // Adjust page if needed
      if (items.length <= count && page > 1) {
        applyFilters(filters, page - 1);
      } else {
        await loadCustomers();
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Xóa hàng loạt gặp lỗi.');
    } finally {
      setTableBusy(false);
    }
  };

  const handleSyncMetrics = async () => {
    setSyncingMetrics(true);
    setError('');
    try {
      await http.post('/customers/sync-metrics');
      // Stub: backend currently returns success without recomputing metrics from sales/refunds.
      // No data change occurs. Reload skipped to avoid confusion.
      // The "(stub)" label + title on button clarifies this to users.
    } catch (err: any) {
      setError(err.response?.data?.message || 'Không đồng bộ được chỉ số khách hàng.');
    } finally {
      setSyncingMetrics(false);
    }
  };

  const selectedCount = selectedIds.size;

  const exportColumns: ColumnOption[] = useMemo(
    () => [
      { label: 'Mã khách', key: 'code', getValue: (c: CustomerRow) => c.code || '—' },
      { label: 'Tên khách hàng', key: 'name', getValue: (c: CustomerRow) => c.name || '—' },
      { label: 'Loại', key: 'type', getValue: (c: CustomerRow) => (c.type === 'person' ? 'Cá nhân' : c.type === 'company' ? 'Công ty' : (c.type || '—')) },
      { label: 'SĐT', key: 'phone', getValue: (c: CustomerRow) => c.phone || '—' },
      { label: 'Email', key: 'email', getValue: (c: CustomerRow) => c.email || '—' },
      { label: 'Mã thẻ', key: 'cardId', getValue: (c: CustomerRow) => c.cardId || '—' },
      { label: 'Cấp độ', key: 'customerLevel', getValue: (c: CustomerRow) => c.customerLevel || '—' },
      { label: 'Nhóm', key: 'groups', getValue: (c: CustomerRow) => (c.groupNames?.join(', ') || c.groups?.map((g) => g.name).join(', ') || '—') },
      { label: 'Sinh nhật', key: 'birthday', getValue: (c: CustomerRow) => (c.birthday ? formatDate(c.birthday) : '—') },
      { label: 'Tổng chi', key: 'totalSpent', getValue: (c: CustomerRow) => c.totalSpent ?? 0 },
      { label: 'Điểm', key: 'points', getValue: (c: CustomerRow) => c.points ?? 0 },
      { label: 'Số lần mua', key: 'purchaseCount', getValue: (c: CustomerRow) => c.purchaseCount ?? 0 },
      { label: 'SL sản phẩm đã mua', key: 'purchaseProductQuantity', getValue: (c: CustomerRow) => c.purchaseProductQuantity ?? 0 },
      { label: 'Ngày mua đầu', key: 'firstPurchaseDate', getValue: (c: CustomerRow) => (c.firstPurchaseDate ? formatDate(c.firstPurchaseDate) : '—') },
      { label: 'Ngày mua gần nhất', key: 'lastPurchaseDate', getValue: (c: CustomerRow) => (c.lastPurchaseDate ? formatDate(c.lastPurchaseDate) : '—') },
      { label: 'Chu kỳ mua (ngày)', key: 'purchaseCycleDays', getValue: (c: CustomerRow) => (c.purchaseCycleDays != null ? c.purchaseCycleDays : 'Chưa đủ dữ liệu') },
      { label: 'Số ngày chưa mua', key: 'daysSinceLastPurchase', getValue: (c: CustomerRow) => (c.daysSinceLastPurchase != null ? c.daysSinceLastPurchase : '—') },
      { label: 'Trạng thái', key: 'status', getValue: (c: CustomerRow) => c.status || '—' },
      { label: 'Địa chỉ', key: 'address', getValue: (c: CustomerRow) => [c.address, c.addressLocation].filter(Boolean).join(', ') || '—' },
      { label: 'Ghi chú', key: 'note', getValue: (c: CustomerRow) => c.note || '—' },
      { label: 'Ngày tạo', key: 'createdAt', getValue: (c: CustomerRow) => (c.createdAt ? formatDate(c.createdAt) : '—') },
    ],
    [],
  );

  const handleExcelExport = async (
    exportType: 'current' | 'all',
    filename: string,
    sheetName: string,
    selectedColumns: { key: string; customLabel: string }[],
  ) => {
    setExportLoading(true);
    try {
      let dataToExport: CustomerRow[] = [];
      if (exportType === 'current') {
        dataToExport = items;
      } else {
        // FIX: Sử dụng buildApiParams(...) để đảm bảo query params (filter, sort, order) gửi cho export "all"
        // giống hệt như khi load danh sách (không gửi các key rỗng '', tránh lệch filter với backend).
        // Trước đây spread {...filters} đưa nhiều '' vào query string, có thể khiến backend trả items=[] dù list hiển thị đúng.
        // Dùng buildApiParams + override limit để export được toàn bộ theo filter+sort hiện tại.
        // Dùng pageSize=5000 (max backend cho phép) để giảm roundtrip khi <5000 records (trường hợp 1609 KH).
        const pageSize = 5000;
        const fetchPage = (nextPage: number, nextLimit: number) => {
          const params = buildApiParams(filters, nextPage, sortField, sortOrder);
          params.limit = nextLimit;
          return http.get('/customers/customers', { params });
        };
        const firstResponse = await fetchPage(1, pageSize);
        const firstItems = firstResponse.data?.items || [];
        let allItems: CustomerRow[] = [...firstItems];
        const totalItems = Number(firstResponse.data?.total || 0);
        if (totalItems > pageSize) {
          const pagesToFetch = Math.ceil(totalItems / pageSize);
          const responses = await Promise.all(
            Array.from({ length: pagesToFetch - 1 }, (_, index) => fetchPage(index + 2, pageSize)),
          );
          responses.forEach((response) => { allItems = allItems.concat(response.data?.items || []); });
        }
        dataToExport = allItems;
      }
      if (!dataToExport.length) {
        setError('Không có dữ liệu để xuất.');
        return;
      }
      const mappedRows = dataToExport.map((customer) => {
        const row: Record<string, unknown> = {};
        selectedColumns.forEach((col) => {
          const exportColumn = exportColumns.find((c) => c.key === col.key);
          row[col.customLabel] = exportColumn ? exportColumn.getValue(customer) : '';
        });
        return row;
      });
      const worksheet = XLSX.utils.json_to_sheet(mappedRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, `${filename}.xlsx`);
      setShowExportModal(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Xuất Excel thất bại.');
    } finally {
      setExportLoading(false);
    }
  };
  return (
    <div className="page-stack customer-list-page compact-page" data-testid="customers-list-page">
      <div className="page-heading customer-list-heading compact-toolbar-card">
        <div className="page-title-block compact-header">
          <span className="compact-badge">CUSTOMERS</span>
          <div className="page-icon"><Users size={20} /></div>
          <div>
            <h1 className="compact-title">Khách hàng</h1>
            <p className="compact-desc">Danh sách khách hàng dùng chung cho bán lẻ, bán sỉ và các luồng chọn khách trong hệ thống.</p>
          </div>
        </div>
        <div className="page-actions customer-list-actions compact-header-actions">
          {isAdmin && (
            <button
              className="btn btn-outline"
              type="button"
              onClick={handleSyncMetrics}
              disabled={syncingMetrics}
              title="Chức năng đồng bộ chỉ số hiện đang ở chế độ stub (không tính lại metrics từ dữ liệu bán hàng)"
            >
              <RefreshCw size={16} className={syncingMetrics ? 'spin' : ''} /> {syncingMetrics ? 'Đang đồng bộ...' : 'Đồng bộ chỉ số (stub)'}
            </button>
          )}
          <span className="record-badge">{formatNumber(total)} khách hàng</span>
          <Link to="/customers/care" className="btn btn-outline">
            <HeartHandshake size={16} /> Phiếu chăm sóc
          </Link>
          <button className="btn btn-primary" type="button" onClick={openCreateModal} data-testid="add-customer-button">
            <Plus size={16} /> Thêm khách hàng
          </button>
        </div>
      </div>

      <section className="data-card customer-filter-card">
        <form className="customer-filter-shell" onSubmit={handleSubmitFilters}>
          <div className="customer-filter-topline">
            <label className="customer-filter-item customer-filter-search">
              <span>Tìm kiếm</span>
              <div className="search-box">
                <Search size={16} />
                <input
                  value={draftFilters.keyword}
                  placeholder="Tên khách, SĐT, mã khách, mã thẻ, email"
                  onChange={(event) => setDraftFilters((current) => ({ ...current, keyword: event.target.value }))}
                  data-testid="customers-keyword-filter"
                />
              </div>
            </label>

            <label className="customer-filter-item">
              <span>Mẫu lọc nhanh</span>
              <div className="customer-select-wrap">
                <select
                  value={draftFilters.preset}
                  onChange={(event) => handleSelectPreset(event.target.value as PresetKey)}
                  data-testid="customers-preset-filter"
                >
                  <option value="all">Tất cả khách hàng</option>
                  <option value="buyalot">Mua nhiều</option>
                  <option value="birthday">Mua nhiều, sinh nhật trong kỳ</option>
                  <option value="buyregularly">Mua thường xuyên</option>
                  <option value="longtimereturn">Lâu chưa mua</option>
                </select>
                <ChevronDown size={16} />
              </div>
            </label>
          </div>

          <div className="customer-filter-grid">
            <label className="customer-filter-item">
              <span>Loại khách hàng</span>
              <div className="customer-select-wrap">
                <select value={draftFilters.type} onChange={(event) => setDraftFilters((current) => ({ ...current, type: event.target.value }))}>
                  <option value="">Tất cả</option>
                  {meta?.customerTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <ChevronDown size={16} />
              </div>
            </label>

            <label className="customer-filter-item">
              <span>Cấp độ</span>
              <div className="customer-select-wrap">
                <select value={draftFilters.customerLevel} onChange={(event) => setDraftFilters((current) => ({ ...current, customerLevel: event.target.value }))}>
                  <option value="">Tất cả</option>
                  {meta?.levels.map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
                <ChevronDown size={16} />
              </div>
            </label>

            <label className="customer-filter-item">
              <span>Nhóm</span>
              <div className="customer-select-wrap">
                <select value={draftFilters.groupId} onChange={(event) => setDraftFilters((current) => ({ ...current, groupId: event.target.value }))}>
                  <option value="">Tất cả</option>
                  {meta?.groups.map((group) => <option key={group._id} value={group._id}>{group.name}</option>)}
                </select>
                <ChevronDown size={16} />
              </div>
            </label>

            <div className="customer-filter-actions-inline">
              <button className="btn btn-primary" type="submit">
                <Search size={16} /> Lọc
              </button>
              <button className="btn btn-outline" type="button" onClick={handleClearFilters}>
                <RotateCcw size={16} /> Xóa bộ lọc
              </button>
              <div className="customer-advanced-popover-wrap" ref={advancedRef}>
                <button
                  className={`btn btn-outline customer-advanced-toggle${advancedOpen ? ' is-active' : ''}`}
                  type="button"
                  onClick={() => setAdvancedOpen((current) => !current)}
                  data-testid="customers-advanced-toggle"
                  aria-expanded={advancedOpen}
                >
                  <SlidersHorizontal size={16} /> Bộ lọc nâng cao
                  {activeAdvancedCount > 0 && <span className="customer-advanced-badge">{activeAdvancedCount}</span>}
                  <ChevronDown size={14} className={`customer-advanced-caret${advancedOpen ? ' is-open' : ''}`} />
                </button>
                {advancedOpen && (
                  <div className="customer-advanced-popover" data-testid="customers-advanced-panel" role="dialog" aria-label="Bộ lọc nâng cao">
                    <div className="customer-advanced-popover-header">
                      <span className="customer-advanced-popover-title"><SlidersHorizontal size={16} /> Bộ lọc nâng cao</span>
                      <button type="button" className="customer-advanced-popover-close" onClick={() => setAdvancedOpen(false)} aria-label="Đóng bộ lọc nâng cao">
                        <X size={16} />
                      </button>
                    </div>
                    <div className="customer-advanced-popover-scroll">
                      <div className="customer-advanced-group">
                        <h3>Thông tin khách hàng</h3>
                        <div className="customer-advanced-grid">
                          <label><span>ID / Mã khách</span><input value={draftFilters.id} onChange={(event) => setDraftFilters((current) => ({ ...current, id: event.target.value }))} /></label>
                          <label><span>Mã khách</span><input value={draftFilters.code} onChange={(event) => setDraftFilters((current) => ({ ...current, code: event.target.value }))} /></label>
                          <label><span>Tên</span><input value={draftFilters.name} onChange={(event) => setDraftFilters((current) => ({ ...current, name: event.target.value }))} /></label>
                          <label><span>Số điện thoại</span><input value={draftFilters.phone} onChange={(event) => setDraftFilters((current) => ({ ...current, phone: event.target.value }))} /></label>
                          <label><span>Email</span><input value={draftFilters.email} onChange={(event) => setDraftFilters((current) => ({ ...current, email: event.target.value }))} /></label>
                          <label><span>Mã thẻ</span><input value={draftFilters.cardId} onChange={(event) => setDraftFilters((current) => ({ ...current, cardId: event.target.value }))} /></label>
                          <label><span>Trạng thái</span>
                            <div className="customer-select-wrap">
                              <select value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}>
                                <option value="">Tất cả</option>
                                <option value="active">Đang hoạt động</option>
                                <option value="inactive">Ngừng hoạt động</option>
                              </select>
                              <ChevronDown size={16} />
                            </div>
                          </label>
                          <label><span>Sinh nhật từ (MM-DD)</span><input value={draftFilters.birthdayFrom} placeholder="06-01" onChange={(event) => setDraftFilters((current) => ({ ...current, birthdayFrom: event.target.value }))} /></label>
                          <label><span>Sinh nhật đến (MM-DD)</span><input value={draftFilters.birthdayTo} placeholder="06-30" onChange={(event) => setDraftFilters((current) => ({ ...current, birthdayTo: event.target.value }))} /></label>
                        </div>
                      </div>

                      <div className="customer-advanced-group">
                        <h3>Chỉ số mua hàng</h3>
                        <div className="customer-advanced-grid">
                          <label><span>Tổng tiền từ</span><input type="number" min="0" value={draftFilters.totalSpentMin} onChange={(event) => setDraftFilters((current) => ({ ...current, totalSpentMin: event.target.value }))} /></label>
                          <label><span>Tổng tiền đến</span><input type="number" min="0" value={draftFilters.totalSpentMax} onChange={(event) => setDraftFilters((current) => ({ ...current, totalSpentMax: event.target.value }))} /></label>
                          <label><span>Điểm từ</span><input type="number" min="0" value={draftFilters.pointsMin} onChange={(event) => setDraftFilters((current) => ({ ...current, pointsMin: event.target.value }))} /></label>
                          <label><span>Điểm đến</span><input type="number" min="0" value={draftFilters.pointsMax} onChange={(event) => setDraftFilters((current) => ({ ...current, pointsMax: event.target.value }))} /></label>
                          <label><span>Số lần mua từ</span><input type="number" min="0" value={draftFilters.purchaseCountMin} onChange={(event) => setDraftFilters((current) => ({ ...current, purchaseCountMin: event.target.value }))} /></label>
                          <label><span>Số lần mua đến</span><input type="number" min="0" value={draftFilters.purchaseCountMax} onChange={(event) => setDraftFilters((current) => ({ ...current, purchaseCountMax: event.target.value }))} /></label>
                          <label><span>SL sản phẩm từ</span><input type="number" min="0" value={draftFilters.purchaseProductQuantityMin} onChange={(event) => setDraftFilters((current) => ({ ...current, purchaseProductQuantityMin: event.target.value }))} /></label>
                          <label><span>SL sản phẩm đến</span><input type="number" min="0" value={draftFilters.purchaseProductQuantityMax} onChange={(event) => setDraftFilters((current) => ({ ...current, purchaseProductQuantityMax: event.target.value }))} /></label>
                          <label><span>Ngày mua gần nhất từ</span><input type="date" value={draftFilters.lastPurchaseDateFrom} onChange={(event) => setDraftFilters((current) => ({ ...current, lastPurchaseDateFrom: event.target.value }))} /></label>
                          <label><span>Ngày mua gần nhất đến</span><input type="date" value={draftFilters.lastPurchaseDateTo} onChange={(event) => setDraftFilters((current) => ({ ...current, lastPurchaseDateTo: event.target.value }))} /></label>
                          <label><span>Chu kỳ mua từ</span><input type="number" min="0" value={draftFilters.purchaseCycleDaysMin} onChange={(event) => setDraftFilters((current) => ({ ...current, purchaseCycleDaysMin: event.target.value }))} /></label>
                          <label><span>Chu kỳ mua đến</span><input type="number" min="0" value={draftFilters.purchaseCycleDaysMax} onChange={(event) => setDraftFilters((current) => ({ ...current, purchaseCycleDaysMax: event.target.value }))} /></label>
                          <label><span>Số ngày chưa mua từ</span><input type="number" min="0" value={draftFilters.daysSinceLastPurchaseMin} onChange={(event) => setDraftFilters((current) => ({ ...current, daysSinceLastPurchaseMin: event.target.value }))} /></label>
                          <label><span>Số ngày chưa mua đến</span><input type="number" min="0" value={draftFilters.daysSinceLastPurchaseMax} onChange={(event) => setDraftFilters((current) => ({ ...current, daysSinceLastPurchaseMax: event.target.value }))} /></label>
                        </div>
                      </div>

                      <div className="customer-advanced-group">
                        <h3>Sắp xếp</h3>
                        <div className="customer-advanced-grid compact">
                          <label>
                            <span>Trường sắp xếp</span>
                            <div className="customer-select-wrap">
                              <select value={sortField} onChange={(event) => applyFilters(draftFilters, 1, event.target.value as SortField, sortOrder)}>
                                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                              <ChevronDown size={16} />
                            </div>
                          </label>
                          <label>
                            <span>Thứ tự</span>
                            <div className="customer-select-wrap">
                              <select value={sortOrder} onChange={(event) => applyFilters(draftFilters, 1, sortField, event.target.value as SortOrder)}>
                                <option value="desc">Giảm dần</option>
                                <option value="asc">Tăng dần</option>
                              </select>
                              <ChevronDown size={16} />
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>
                    <div className="customer-advanced-popover-footer">
                      <button className="btn btn-outline" type="button" onClick={() => setAdvancedOpen(false)}>Đóng</button>
                      <button className="btn btn-primary" type="button" onClick={handleApplyAdvancedFilters}>
                        <Check size={16} /> Áp dụng
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>

        {(filterChips.length > 0 || selectedCount > 0) && (
          <div className="customer-chip-bar" data-testid="customers-filter-chips">
            <div className="customer-chip-list">
              {filterChips.map((chip) => (
                <button key={`${chip.key}-${chip.value}`} type="button" className="customer-chip" onClick={() => handleRemoveChip(chip.key)}>
                  <span>{chip.label}: {chip.value}</span>
                  <X size={14} />
                </button>
              ))}
            </div>
            <div className="customer-chip-actions">
              {selectedCount > 0 && <span className="record-badge">{selectedCount} khách đang chọn</span>}
              {selectedCount > 0 && <button className="btn btn-outline" type="button" onClick={() => setSelectedIds(new Set())}>Bỏ chọn</button>}
              {selectedCount > 0 && (
                <button className="btn btn-danger" type="button" onClick={() => void handleBulkDelete()}>
                  Xóa đã chọn
                </button>
              )}
              {filterChips.length > 0 && <button className="btn btn-outline" type="button" onClick={handleClearFilters}>Xóa tất cả</button>}
            </div>
          </div>
        )}
      </section>

      <section className="data-card customer-table-card">
        <div className="data-card-header customer-table-header">
          <div>
            <h2>Danh sách khách hàng</h2>
            <p>Kết quả đang hiển thị đúng theo điều kiện lọc, sắp xếp và phân trang từ API.</p>
          </div>
          {tableBusy && <span className="record-badge">Đang cập nhật dữ liệu…</span>}
          <button className="btn btn-outline" type="button" onClick={() => setShowExportModal(true)}>
            <FileDown size={15} /> Xuất dữ liệu
          </button>
        </div>

        {error && (
          <div className="customer-feedback error">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button className="btn btn-outline" type="button" onClick={() => void loadCustomers()}>Thử lại</button>
          </div>
        )}

        <div className="table-scroll">
          <table className="data-table customer-table">
            <thead>
              <tr>
                <th className="checkbox-col">
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Chọn tất cả khách hàng" />
                </th>
                <th>
                  <button type="button" className="customer-sort-button" onClick={() => handleSort('name')}>
                    Khách hàng <ArrowUpDown size={14} />
                  </button>
                </th>
                <th>Loại</th>
                <th>
                  <button type="button" className="customer-sort-button" onClick={() => handleSort('phone')}>
                    Số điện thoại <ArrowUpDown size={14} />
                  </button>
                </th>
                <th>
                  <button type="button" className="customer-sort-button" onClick={() => handleSort('customerLevel')}>
                    Cấp độ <ArrowUpDown size={14} />
                  </button>
                </th>
                <th>Nhóm</th>
                <th className="align-right">
                  <button type="button" className="customer-sort-button align-right" onClick={() => handleSort('totalSpent')}>
                    Tổng tiền <ArrowUpDown size={14} />
                  </button>
                </th>
                <th className="align-right">
                  <button type="button" className="customer-sort-button align-right" onClick={() => handleSort('points')}>
                    Điểm <ArrowUpDown size={14} />
                  </button>
                </th>
                <th className="align-right">
                  <button type="button" className="customer-sort-button align-right" onClick={() => handleSort('purchaseCount')}>
                    Lần mua <ArrowUpDown size={14} />
                  </button>
                </th>
                <th className="align-right">
                  <button type="button" className="customer-sort-button align-right" onClick={() => handleSort('purchaseProductQuantity')}>
                    SL <ArrowUpDown size={14} />
                  </button>
                </th>
                <th className="align-right">
                  <button type="button" className="customer-sort-button align-right" onClick={() => handleSort('purchaseCycleDays')}>
                    Chu kỳ mua hàng <ArrowUpDown size={14} />
                  </button>
                </th>
                <th className="align-right">
                  <button type="button" className="customer-sort-button align-right" onClick={() => handleSort('lastPurchaseDate')}>
                    Mua gần nhất <ArrowUpDown size={14} />
                  </button>
                </th>
                <th className="align-right">
                  <button type="button" className="customer-sort-button align-right" onClick={() => handleSort('daysSinceLastPurchase')}>
                    Chưa mua (ngày) <ArrowUpDown size={14} />
                  </button>
                </th>
                <th className="action-col">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }).map((_, index) => (
                <tr key={`loading-${index}`} className="customer-skeleton-row">
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box tall" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                  <td><div className="customer-skeleton-box short" /></td>
                </tr>
              ))}

              {!loading && items.length === 0 && !error && (
                <tr>
                  <td colSpan={14}>
                    <div className="customer-empty-state">
                      <strong>Không có khách hàng phù hợp</strong>
                      <span>Hãy đổi điều kiện lọc hoặc tạo khách hàng mới để bắt đầu.</span>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && items.map((customer) => (
                <tr key={customer._id}>
                  <td className="checkbox-col">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(customer._id)}
                      onChange={(event) => toggleRowSelection(customer._id, event.target.checked)}
                      aria-label={`Chọn ${customer.name || customer.code || customer._id}`}
                    />
                  </td>
                  <td>
                    <button type="button" className="customer-name-button" onClick={() => openEditModal(customer)}>
                      <strong>{customer.name || '—'}</strong>
                      <span>{customer.code || customer.cardId || customer._id}</span>
                    </button>
                  </td>
                  <td>{customer.type === 'company' ? 'Công ty' : customer.type === 'person' ? 'Cá nhân' : '—'}</td>
                  <td>{customer.phone || '—'}</td>
                  <td>{customer.customerLevel || '—'}</td>
                  <td className="customer-groups-cell">{customer.groupNames?.length ? customer.groupNames.join(', ') : '—'}</td>
                  <td className="align-right">{formatMoney(customer.totalSpent)}</td>
                  <td className="align-right">{formatNumber(customer.points)}</td>
                  <td className="align-right">{formatNumber(customer.purchaseCount)}</td>
                  <td className="align-right">{formatNumber(customer.purchaseProductQuantity)}</td>
                  <td className="align-right">{formatCycleDays(customer.purchaseCycleDays)}</td>
                  <td className="align-right">{customer.lastPurchaseDate ? formatDate(customer.lastPurchaseDate) : '—'}</td>
                  <td className="align-right">{formatCycleDays(customer.daysSinceLastPurchase)}</td>
                  <td className="action-col">
                    <div className="customer-actions-menu">
                      <button
                        className="icon-button"
                        type="button"
                        title="Thao tác"
                        aria-haspopup="menu"
                        aria-expanded={openActionId === customer._id}
                        onClick={() => setOpenActionId((current) => current === customer._id ? null : customer._id)}
                      >
                        <MoreVertical size={16} />
                      </button>
                      {openActionId === customer._id && (
                        <div className="customer-actions-dropdown" role="menu">
                          <button type="button" role="menuitem" onClick={() => { setOpenActionId(null); openEditModal(customer); }}>
                            <Pencil size={15} /> Sửa
                          </button>
                          <Link role="menuitem" to={`/customers/list/${customer._id}`} onClick={() => setOpenActionId(null)}>
                            <Users size={15} /> Xem chi tiết
                          </Link>
                          <button
                            className="danger"
                            type="button"
                            role="menuitem"
                            onClick={() => { setOpenActionId(null); void handleDeleteCustomer(customer); }}
                            disabled={deletingId === customer._id}
                          >
                            <Trash2 size={15} /> Xóa
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pagination page={page} total={total} limit={PAGE_SIZE} onPageChange={(nextPage) => applyFilters(filters, nextPage)} />
      </section>

      {modalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => !saving && setModalOpen(false)}>
          <div className="modal-card modal-card-wide customer-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{editingCustomer ? 'Cập nhật khách hàng' : 'Thêm khách hàng'}</h2>
                <p>{editingCustomer ? 'Sửa thông tin khách hàng từ dữ liệu thật trong hệ thống.' : 'Tạo khách hàng mới để dùng chung cho bán lẻ và bán sỉ.'}</p>
              </div>
              <button className="icon-button" type="button" onClick={() => !saving && setModalOpen(false)} aria-label="Đóng">
                <X size={18} />
              </button>
            </div>

            <form className="customer-modal-body" onSubmit={handleSaveCustomer}>
              <div className="customer-modal-grid">
                <label className="form-field">
                  <span>Cửa hàng / kho gán</span>
                  <div className="customer-select-wrap">
                    <select value={formState.branchId} onChange={(event) => handleFormChange('branchId', event.target.value)}>
                      <option value="">Tự động theo quyền hiện tại</option>
                      {branches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}{branch.code ? ` (${branch.code})` : ''}</option>)}
                    </select>
                    <ChevronDown size={16} />
                  </div>
                </label>
                <label className="form-field">
                  <span>Mã khách</span>
                  <input value={formState.code} onChange={(event) => handleFormChange('code', event.target.value)} placeholder="Tự sinh nếu để trống" />
                </label>
                <label className="form-field">
                  <span>Tên khách hàng *</span>
                  <input required value={formState.name} onChange={(event) => handleFormChange('name', event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Loại khách hàng</span>
                  <div className="customer-select-wrap">
                    <select value={formState.type} onChange={(event) => handleFormChange('type', event.target.value)}>
                      <option value="person">Cá nhân</option>
                      <option value="company">Công ty</option>
                    </select>
                    <ChevronDown size={16} />
                  </div>
                </label>
                <label className="form-field">
                  <span>Số điện thoại</span>
                  <input value={formState.phone} onChange={(event) => handleFormChange('phone', event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Số điện thoại 2</span>
                  <input value={formState.phone2} onChange={(event) => handleFormChange('phone2', event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Email</span>
                  <input type="email" value={formState.email} onChange={(event) => handleFormChange('email', event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Mã thẻ</span>
                  <input value={formState.cardId} onChange={(event) => handleFormChange('cardId', event.target.value)} />
                </label>
                <label className="form-field">
                  <span>Cấp độ</span>
                  <input value={formState.customerLevel} onChange={(event) => handleFormChange('customerLevel', event.target.value)} list="customer-level-options" />
                  <datalist id="customer-level-options">
                    {meta?.levels.map((level) => <option key={level} value={level} />)}
                  </datalist>
                </label>
                <label className="form-field">
                  <span>Ngày sinh</span>
                  <input type="date" value={formState.birthday} onChange={(event) => handleFormChange('birthday', event.target.value)} />
                </label>
                <div className="form-field form-field-wide">
                  <span>Nhóm khách hàng (có thể chọn nhiều)</span>
                  <div className="customer-groups-checkboxes" style={{ maxHeight: 120, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 4, padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {meta?.groups && meta.groups.length > 0 ? (
                      meta.groups.map((group) => (
                        <label key={group._id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={formState.groups.includes(group._id)}
                            onChange={(e) => toggleGroup(group._id, e.target.checked)}
                          />
                          <span>{group.name}</span>
                        </label>
                      ))
                    ) : (
                      <span style={{ color: '#64748b', fontSize: 12 }}>Chưa có nhóm khách hàng nào</span>
                    )}
                  </div>
                </div>
                <label className="form-field form-field-wide">
                  <span>Khu vực</span>
                  <input value={formState.addressLocation} onChange={(event) => handleFormChange('addressLocation', event.target.value)} />
                </label>
                <label className="form-field form-field-wide">
                  <span>Địa chỉ</span>
                  <input value={formState.address} onChange={(event) => handleFormChange('address', event.target.value)} />
                </label>
                <label className="form-field form-field-wide">
                  <span>Ghi chú</span>
                  <textarea rows={3} value={formState.note} onChange={(event) => handleFormChange('note', event.target.value)} />
                </label>
              </div>

              {formError && <div className="customer-feedback error"><AlertCircle size={18} /><span>{formError}</span></div>}

              <div className="modal-footer customer-modal-footer">
                <button className="btn btn-outline" type="button" onClick={() => !saving && setModalOpen(false)} disabled={saving}>Đóng</button>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? <RefreshCw size={16} className="spin" /> : <Check size={16} />}
                  {saving ? 'Đang lưu...' : 'Lưu khách hàng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showExportModal ? (
        <ExportExcelModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          title="Xuất Excel - Danh sách khách hàng"
          defaultFilename={`danh-sach-khach-hang-${new Date().toISOString().slice(0, 10)}`}
          columns={exportColumns}
          onExport={handleExcelExport}
          loading={exportLoading}
        />
      ) : null}
    </div>
  );
}