export const ADMIN_ROLE = 'ADMIN';
export const EMPLOYEE_ROLE = 'EMPLOYEE';
export const ACTIVE_STATUS = 'ACTIVE';
export const LOCKED_STATUS = 'LOCKED';

export const ROLE_VALUES = [ADMIN_ROLE, EMPLOYEE_ROLE] as const;

export function normalizeRole(role?: string | null, isRootOwner = false) {
  const value = String(role || '').trim().toUpperCase();
  if (isRootOwner || value === ADMIN_ROLE) {
    return ADMIN_ROLE;
  }
  return EMPLOYEE_ROLE;
}

export function normalizeStoredRole(role?: string | null) {
  return String(role || '').trim().toUpperCase() === ADMIN_ROLE ? ADMIN_ROLE : EMPLOYEE_ROLE;
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
