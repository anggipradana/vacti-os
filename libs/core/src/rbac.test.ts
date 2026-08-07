import { describe, it, expect } from 'vitest';
import { Role, Permission, hasPermission, roleFromUser, userCan, isRoleName } from './rbac';

describe('RBAC matrix', () => {
  it('SysAdmin has every permission', () => {
    for (const p of Object.values(Permission)) {
      expect(hasPermission(Role.SysAdmin, p)).toBe(true);
    }
  });

  it('PenetrationTester has all except system config', () => {
    expect(hasPermission(Role.PenetrationTester, Permission.ModifySystemConfig)).toBe(false);
    expect(hasPermission(Role.PenetrationTester, Permission.InitiateScans)).toBe(true);
    expect(hasPermission(Role.PenetrationTester, Permission.ModifyTargets)).toBe(true);
  });

  it('Auditor is read + report only', () => {
    expect(hasPermission(Role.Auditor, Permission.ModifyReport)).toBe(true);
    expect(hasPermission(Role.Auditor, Permission.InitiateScans)).toBe(false);
    expect(hasPermission(Role.Auditor, Permission.ModifyScanResults)).toBe(false);
    expect(hasPermission(Role.Auditor, Permission.ModifyTargets)).toBe(false);
    expect(hasPermission(Role.Auditor, Permission.ModifySystemConfig)).toBe(false);
  });
});

describe('role resolution', () => {
  it('isRoleName validates', () => {
    expect(isRoleName('SysAdmin')).toBe(true);
    expect(isRoleName('nope')).toBe(false);
    expect(isRoleName(null)).toBe(false);
  });

  it('roleFromUser: explicit role wins, else isSysAdmin, else fails CLOSED to Auditor', () => {
    expect(roleFromUser({ role: 'Auditor' })).toBe(Role.Auditor);
    expect(roleFromUser({ role: 'PenetrationTester' })).toBe(Role.PenetrationTester);
    expect(roleFromUser({ role: null, isSysAdmin: true })).toBe(Role.SysAdmin);
    // A role-less / unrecognised user must NOT silently become a near-admin PenetrationTester; it falls
    // back to the least-privileged read-only Auditor (fail closed).
    expect(roleFromUser({ isSysAdmin: false })).toBe(Role.Auditor);
    expect(roleFromUser(null)).toBe(Role.Auditor);
    expect(roleFromUser({ role: 'garbage' })).toBe(Role.Auditor);
    expect(roleFromUser({ role: 'garbage', isSysAdmin: true })).toBe(Role.SysAdmin);
  });

  it('userCan composes role + permission', () => {
    expect(userCan({ role: 'Auditor' }, Permission.InitiateScans)).toBe(false);
    expect(userCan({ role: 'Auditor' }, Permission.ModifyReport)).toBe(true);
    expect(userCan({ role: 'SysAdmin' }, Permission.ModifySystemConfig)).toBe(true);
    expect(userCan(null, Permission.ModifyReport)).toBe(false);
  });
});
