/**
 * Role-based access control for vacti: a standard three-role model defined in the
 * platform-foundation epic (task 005). Enforcement happens server-side.
 */
export const Role = {
  SysAdmin: 'SysAdmin',
  PenetrationTester: 'PenetrationTester',
  Auditor: 'Auditor',
} as const;

export type RoleName = (typeof Role)[keyof typeof Role];

export const Permission = {
  ModifySystemConfig: 'modify_system_config',
  ModifyScanConfig: 'modify_scan_config',
  ModifyScanResults: 'modify_scan_results',
  ModifyReport: 'modify_report',
  InitiateScans: 'initiate_scans',
  ModifyTargets: 'modify_targets',
} as const;

export type PermissionName = (typeof Permission)[keyof typeof Permission];

const ALL: PermissionName[] = Object.values(Permission);

/** Permission matrix. SysAdmin = all; Penetration Tester = all but system config; Auditor = report only (+ implicit read). */
export const ROLE_PERMISSIONS: Record<RoleName, ReadonlySet<PermissionName>> = {
  [Role.SysAdmin]: new Set(ALL),
  [Role.PenetrationTester]: new Set(ALL.filter((p) => p !== Permission.ModifySystemConfig)),
  [Role.Auditor]: new Set<PermissionName>([Permission.ModifyReport]),
};

export function hasPermission(role: RoleName, permission: PermissionName): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function isRoleName(s: unknown): s is RoleName {
  return typeof s === 'string' && (Object.values(Role) as string[]).includes(s);
}

/**
 * Resolve a user's effective global role: explicit `role` wins, else legacy `isSysAdmin`. A user with NO
 * recognised role falls back to the LEAST-privileged role (Auditor, read-only), never PenetrationTester:
 * an unspecified/corrupted role must fail CLOSED, so a role-less row (a future SSO auto-provision, a bad
 * migration, a dropped field) can never silently gain write access to every project.
 */
export function roleFromUser(user: { role?: string | null; isSysAdmin?: boolean | null } | null | undefined): RoleName {
  if (user && isRoleName(user.role)) return user.role;
  return user?.isSysAdmin ? Role.SysAdmin : Role.Auditor;
}

/** Does this user hold a permission? */
export function userCan(
  user: { role?: string | null; isSysAdmin?: boolean | null } | null | undefined,
  permission: PermissionName,
): boolean {
  if (!user) return false;
  return hasPermission(roleFromUser(user), permission);
}

/** Human labels for the UI. */
export const ROLE_LABEL: Record<RoleName, string> = {
  [Role.SysAdmin]: 'System Admin',
  [Role.PenetrationTester]: 'Penetration Tester',
  [Role.Auditor]: 'Auditor (read-only)',
};
