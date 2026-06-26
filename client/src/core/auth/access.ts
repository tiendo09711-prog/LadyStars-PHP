export function normalizeRole(role?: string | null) {
  const value = String(role || '').trim().toUpperCase();
  if (value === 'ADMIN') {
    return 'ADMIN';
  }
  return 'EMPLOYEE';
}

export function isAdminRole(role?: string | null) {
  return normalizeRole(role) === 'ADMIN';
}

export function roleLabel(role?: string | null) {
  return isAdminRole(role) ? 'Quan tri vien' : 'Nhan vien';
}

export function canAccessPath(role: string | null | undefined, pathname: string) {
  if (isAdminRole(role)) return true;
  if (pathname === '/' || pathname === '/dashboard') return true;
  if (pathname.startsWith('/products')) return true;
  if (pathname.startsWith('/warehouse') && !pathname.startsWith('/warehouse/branches')) return true;
  if (pathname.startsWith('/sales-channels')) return true;
  if (pathname.startsWith('/customers')) return true;
  if (pathname.startsWith('/settings')) return true;
  return false;
}
