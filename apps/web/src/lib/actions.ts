'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { hashPassword, verifyPassword, generateApiToken, needsRehash, normalizeEmail } from '@vacti/auth';
import { Role, Permission, isRoleName } from '@vacti/core';
import { isSector } from '@vacti/threat-intel';
import { users, projects, projectMembers, apiTokens, loginAttempts } from '@vacti/db';
import { getDb } from './db';
import { createSession, destroySession, destroyAllSessions, getCurrentUser, userCount } from './session';
import { requirePermission } from './authz';
import { requireProjectMember } from './tenancy';
import { recordAudit } from './audit';
import { setActiveProjectCookie } from './active-project';

export async function createAdminAction(formData: FormData) {
  if ((await userCount()) > 0) redirect('/login');
  const email = normalizeEmail(formData.get('email'));
  const password = String(formData.get('password') ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) redirect('/login?error=weak');
  // onConflictDoNothing + the re-check close the count-then-insert race: two concurrent first-run
  // submissions must not both become SysAdmin.
  if ((await userCount()) > 0) redirect('/login');
  const [user] = await getDb()
    .insert(users)
    .values({ email, passwordHash: await hashPassword(password), isSysAdmin: true, role: Role.SysAdmin })
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (!user) redirect('/login');
  await createSession(user.id);
  redirect('/dashboard');
}

// Brute-force throttle policy (PG-backed, no Redis): after MAX_FAILURES failed logins inside a
// rolling WINDOW_MS window, soft-lock the email for LOCK_MS.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
// A real argon2id hash of a throwaway value. Verifying a wrong password against this costs the same
// as verifying against a real user hash, so a missing user and a wrong password take the same time
// (closes the timing oracle that otherwise leaks which emails exist). Generated via @node-rs/argon2.
const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$R7jRjLdtWq9DTVutwp4WdQ$aeDo1ZYR767GfIcVp2509x/hKRpRSupzDVTqUa4RJTc';

export async function loginAction(formData: FormData) {
  // Normalize exactly like every write path (createAdmin/addUser/changeOwnEmail store normalized),
  // otherwise a login typed with different casing or a stray space never matches the stored row.
  const email = normalizeEmail(formData.get('email'));
  const password = String(formData.get('password') ?? '');
  const db = getDb();
  const now = new Date();

  // If this email is currently soft-locked, reject before touching the password (no oracle, no work).
  const [attempt] = await db.select().from(loginAttempts).where(eq(loginAttempts.email, email));
  if (attempt?.lockedUntil && attempt.lockedUntil.getTime() > now.getTime()) {
    redirect('/login?error=locked');
  }

  const [user] = await db.select().from(users).where(eq(users.email, email));
  // Always pay the argon2 cost, even for a non-existent user, so both paths take the same time.
  const ok = user
    ? await verifyPassword(password, user.passwordHash)
    : (await verifyPassword(password, DUMMY_ARGON2_HASH), false);

  if (!user || !ok) {
    // Rolling window: a stale window resets the counter and starts a fresh one.
    const windowStale = !attempt || attempt.windowStartedAt.getTime() < now.getTime() - LOGIN_WINDOW_MS;
    const failures = windowStale ? 1 : attempt.failures + 1;
    const windowStartedAt = windowStale ? now : attempt.windowStartedAt;
    const lockedUntil = failures >= LOGIN_MAX_FAILURES ? new Date(now.getTime() + LOGIN_LOCK_MS) : null;
    await db
      .insert(loginAttempts)
      .values({ email, failures, windowStartedAt, lockedUntil, updatedAt: now })
      .onConflictDoUpdate({
        target: loginAttempts.email,
        set: { failures, windowStartedAt, lockedUntil, updatedAt: now },
      });
    // actorId is null for a non-existent email (audit_log.actor_id is nullable, onDelete set null).
    await recordAudit({
      actorId: (user?.id ?? null) as string,
      action: 'user.login_failed',
      resource: `user:${email}`,
    });
    redirect('/login?error=invalid');
  }

  // Successful login: clear the failure counter for this email.
  await db.delete(loginAttempts).where(eq(loginAttempts.email, email));
  // Transparently upgrade legacy scrypt hashes to argon2id on successful login.
  if (needsRehash(user.passwordHash)) {
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(users.id, user.id));
  }
  await createSession(user.id);
  // Land on the default project (if one is flagged) so login always opens the chosen workspace.
  const [def] = await db.select({ id: projects.id }).from(projects).where(eq(projects.isDefault, true)).limit(1);
  if (def) await setActiveProjectCookie(def.id);
  redirect('/dashboard');
}

export async function logoutAction() {
  await destroySession();
  redirect('/login');
}

/** Self-service: the logged-in user changes their OWN password (verifies the current one first). */
export async function changeOwnPasswordAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (!(await verifyPassword(current, user.passwordHash))) redirect('/settings/account?error=current');
  if (next.length < 8) redirect('/settings/account?error=weak');
  if (next !== confirm) redirect('/settings/account?error=mismatch');
  await getDb()
    .update(users)
    .set({ passwordHash: await hashPassword(next), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  // Sign out every other device on a password change, then re-mint this session so the actor stays in.
  await destroyAllSessions(user.id);
  await createSession(user.id);
  await recordAudit({ actorId: user.id, action: 'user.password_change', resource: `user:${user.id}` });
  redirect('/settings/account?ok=1');
}

/** Self-service: the logged-in user changes their OWN email. Validated + deduped + audited. */
export async function changeOwnEmailAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const email = normalizeEmail(formData.get('email'));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect('/settings/account?error=email');
  if (email === user.email) redirect('/settings/account?ok=email');
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing && existing.id !== user.id) redirect('/settings/account?error=emailtaken');
  await db.update(users).set({ email, updatedAt: new Date() }).where(eq(users.id, user.id));
  await recordAudit({ actorId: user.id, action: 'user.email_change', resource: `user:${user.id}` });
  redirect('/settings/account?ok=email');
}

/** Self-service: revoke all of the user's sessions (sign out everywhere), then log out. */
export async function signOutEverywhereAction() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  await destroyAllSessions(user.id);
  await recordAudit({ actorId: user.id, action: 'user.sessions_revoked', resource: `user:${user.id}` });
  redirect('/login');
}

export async function createProjectAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifyTargets);
  const name = String(formData.get('name') ?? '').trim();
  const slug = String(formData.get('slug') ?? '').trim();
  if (!name || !/^[a-z][a-z0-9-]*$/.test(slug)) redirect('/settings/projects?error=invalid');
  const db = getDb();
  const [project] = await db.insert(projects).values({ name, slug }).returning();
  await db.insert(projectMembers).values({ projectId: project!.id, userId: user!.id, role: Role.SysAdmin });
  await recordAudit({
    actorId: user.id,
    action: 'project.create',
    resource: `project:${project!.id}`,
    projectId: project!.id,
    metadata: { slug },
  });
  revalidatePath('/settings/projects');
}

/** Edit a project's name, sector, and (optionally) slug. Requires ModifyTargets + audit. */
export async function editProjectAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifyTargets);
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const sector = String(formData.get('sector') ?? '');
  const slug = String(formData.get('slug') ?? '').trim();
  if (!id || !name || !isSector(sector)) redirect('/settings/projects?error=invalid');
  await requireProjectMember(actor, id);
  const set: { name: string; sector: string; updatedAt: Date; slug?: string } = {
    name,
    sector,
    updatedAt: new Date(),
  };
  // Only touch the slug when a (valid) one is supplied; blank keeps the current slug.
  if (slug) {
    if (!/^[a-z][a-z0-9-]*$/.test(slug)) redirect('/settings/projects?error=invalid');
    set.slug = slug;
  }
  await getDb().update(projects).set(set).where(eq(projects.id, id));
  await recordAudit({ actorId: actor.id, action: 'project.update', resource: `project:${id}`, projectId: id });
  revalidatePath('/settings/projects');
}

/** Delete a project and all its scoped data (cascades via FK). Requires ModifyTargets + audit. */
export async function deleteProjectAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifyTargets);
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await requireProjectMember(actor, id);
  await getDb().delete(projects).where(eq(projects.id, id));
  await recordAudit({ actorId: actor.id, action: 'project.delete', resource: `project:${id}`, projectId: id });
  revalidatePath('/settings/projects');
}

/** Mark a project as the default workspace (shown on login). At most one project is default. */
export async function setDefaultProjectAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifyTargets);
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  await requireProjectMember(actor, id);
  const db = getDb();
  // Single default: clear the flag everywhere, then set it on the chosen project.
  await db.update(projects).set({ isDefault: false }).where(eq(projects.isDefault, true));
  await db.update(projects).set({ isDefault: true }).where(eq(projects.id, id));
  await setActiveProjectCookie(id);
  await recordAudit({ actorId: actor.id, action: 'project.set_default', resource: `project:${id}`, projectId: id });
  revalidatePath('/settings/projects');
}

/** Add a member to a project (by email). SysAdmin-only; idempotent; audited. */
export async function addProjectMemberAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const projectId = String(formData.get('projectId') ?? '');
  const email = normalizeEmail(formData.get('email'));
  if (!projectId || !email) redirect('/settings/projects?error=nouser');
  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.email, email));
  if (!target) redirect('/settings/projects?error=nouser');
  // Grant membership at the user's global role. onConflictDoNothing keeps it idempotent.
  await db.insert(projectMembers).values({ projectId, userId: target.id, role: target.role }).onConflictDoNothing();
  await recordAudit({
    actorId: actor.id,
    action: 'project.member_added',
    resource: `project:${projectId}:user:${target.id}`,
    projectId,
  });
  revalidatePath('/settings/projects');
}

/** Remove a member from a project. SysAdmin-only; never the last member; audited. */
export async function removeProjectMemberAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const projectId = String(formData.get('projectId') ?? '');
  const userId = String(formData.get('userId') ?? '');
  if (!projectId || !userId) return;
  const db = getDb();
  // Never orphan a project: keep at least one member.
  const members = (await db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId))).length;
  if (members <= 1) redirect('/settings/projects?error=lastmember');
  await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  await recordAudit({
    actorId: actor.id,
    action: 'project.member_removed',
    resource: `project:${projectId}:user:${userId}`,
    projectId,
  });
  revalidatePath('/settings/projects');
}

/** Create a user (email + password + role). SysAdmin-only; deduped by email; audited. */
export async function addUserAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const email = normalizeEmail(formData.get('email'));
  const password = String(formData.get('password') ?? '');
  const role = String(formData.get('role') ?? Role.PenetrationTester);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8 || !isRoleName(role)) {
    redirect('/settings/users?error=invalid');
  }
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) redirect('/settings/users?error=exists');
  const [u] = await db
    .insert(users)
    .values({ email, passwordHash: await hashPassword(password), role, isSysAdmin: role === Role.SysAdmin })
    .returning();
  await recordAudit({ actorId: actor.id, action: 'user.create', resource: `user:${u!.id}`, metadata: { role } });
  revalidatePath('/settings/users');
}

/** Delete a user. SysAdmin-only; never self or the last SysAdmin; audited. */
export async function deleteUserAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const id = String(formData.get('id') ?? '');
  if (!id || id === actor.id) return; // never delete yourself
  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, id));
  if (!target) return;
  if (target.role === Role.SysAdmin) {
    const admins = (await db.select().from(users).where(eq(users.role, Role.SysAdmin))).length;
    if (admins <= 1) return; // keep at least one SysAdmin
  }
  await db.delete(users).where(eq(users.id, id));
  await recordAudit({ actorId: actor.id, action: 'user.delete', resource: `user:${id}` });
  revalidatePath('/settings/users');
}

/** SysAdmin-only: reset another user's password (no current-password check). Audited. */
export async function resetUserPasswordAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const id = String(formData.get('id') ?? '');
  const password = String(formData.get('password') ?? '');
  if (!id || password.length < 8) redirect('/settings/users?error=weak');
  await getDb()
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, id));
  // Force the target to re-login everywhere: revoke all their sessions (no re-mint - not the actor).
  await destroyAllSessions(id);
  await recordAudit({ actorId: actor.id, action: 'user.password_reset', resource: `user:${id}` });
  revalidatePath('/settings/users');
}

export async function createTokenAction(_prev: unknown, formData: FormData) {
  // API tokens authenticate to the API - SysAdmin only.
  const user = await requirePermission(Permission.ModifySystemConfig);
  const label = String(formData.get('label') ?? '').trim() || 'token';
  const { plaintext, hash } = generateApiToken();
  await getDb().insert(apiTokens).values({ userId: user.id, label, tokenHash: hash });
  revalidatePath('/settings/tokens');
  return { token: plaintext };
}

export async function revokeTokenAction(formData: FormData) {
  const user = await requirePermission(Permission.ModifySystemConfig);
  const id = String(formData.get('id') ?? '');
  await getDb()
    .delete(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, user.id)));
  revalidatePath('/settings/tokens');
}

/** SysAdmin-only: change a user's global RBAC role. */
export async function changeUserRoleAction(formData: FormData) {
  const actor = await requirePermission(Permission.ModifySystemConfig);
  const id = String(formData.get('id') ?? '');
  const role = String(formData.get('role') ?? '');
  if (!id || !isRoleName(role)) return;
  // Don't let an admin demote themselves out of the last SysAdmin seat.
  if (id === actor.id && role !== Role.SysAdmin) {
    const admins = (await getDb().select().from(users).where(eq(users.role, Role.SysAdmin))).length;
    if (admins <= 1) return;
  }
  await getDb()
    .update(users)
    .set({ role, isSysAdmin: role === Role.SysAdmin, updatedAt: new Date() })
    .where(eq(users.id, id));
  await recordAudit({ actorId: actor.id, action: 'user.role_change', resource: `user:${id}`, metadata: { role } });
  revalidatePath('/settings/users');
}
