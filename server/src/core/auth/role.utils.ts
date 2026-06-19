export const ADMIN_ROLE = 'ADMIN';
export const EMPLOYEE_ROLE = 'EMPLOYEE';
export const ACTIVE_STATUS = 'ACTIVE';
export const LOCKED_STATUS = 'LOCKED';

export function normalizeRole(role?: string | null, isRootOwner = false) {
  const value = String(role || '').trim().toUpperCase();
  if (isRootOwner || value === ADMIN_ROLE || value === 'OWNER' || value === 'SUPER_ADMIN') {
    return ADMIN_ROLE;
  }
  return EMPLOYEE_ROLE;
}

export function normalizeStatus(status?: string | null) {
  const value = String(status || '').trim().toUpperCase();
  if (value === LOCKED_STATUS || value === 'LOCK' || value === 'INACTIVE') {
    return LOCKED_STATUS;
  }
  return ACTIVE_STATUS;
}

export function isAdminRole(user: { role?: string | null; isRootOwner?: boolean | null } | undefined | null) {
  return normalizeRole(user?.role, Boolean(user?.isRootOwner)) === ADMIN_ROLE;
}
