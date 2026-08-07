import 'server-only';
import { redirect } from 'next/navigation';
import { userCan, type PermissionName } from '@vacti/core';
import { getCurrentUser } from './session';

/** Resolve the session user or redirect to login. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * Server-side RBAC guard for mutating server actions. Returns the user when allowed; redirects to
 * login when unauthenticated and throws a Forbidden error when the role lacks the permission.
 */
export async function requirePermission(permission: PermissionName) {
  const user = await requireUser();
  if (!userCan(user, permission)) {
    throw new Error(`Forbidden: your role lacks "${permission}"`);
  }
  return user;
}
