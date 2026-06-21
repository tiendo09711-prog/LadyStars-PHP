export function normalizeRole(role?: string | null) {
  const value = String(role || '').trim().toUpperCase();
  if (value === 'ADMIN' || value === 'OWNER' || value === 'SUPER_ADMIN') {
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
  return !['/staff', '/settings', '/accounting', '/reports', '/warehouse/branches'].some((prefix) => pathname.startsWith(prefix));
}
