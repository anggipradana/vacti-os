import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE = 'vacti_active_project';

/**
 * Resolve the active project for a page: an explicit `?project=` wins, else the sticky cookie, else
 * the project flagged as default, else the most recent project. Only returns an id that actually
 * exists. This keeps the active project consistent across navigation so you can't, say, sit in
 * project A and accidentally act on project B.
 */
export async function getActiveProjectId(
  spProject: string | undefined,
  projectRows: { id: string; isDefault?: boolean }[],
): Promise<string | undefined> {
  const ids = new Set(projectRows.map((p) => p.id));
  if (spProject && ids.has(spProject)) return spProject;
  const cookieId = (await cookies()).get(COOKIE)?.value;
  if (cookieId && ids.has(cookieId)) return cookieId;
  return projectRows.find((p) => p.isDefault)?.id ?? projectRows[0]?.id;
}

/** Persist the sticky active-project cookie. Shared by the switcher and login. */
export async function setActiveProjectCookie(projectId: string): Promise<void> {
  (await cookies()).set(COOKIE, projectId, { httpOnly: true, sameSite: 'lax', path: '/' });
}

/** Switch the sticky active project (set by the project switcher) and return to the current page. */
export async function selectProjectAction(formData: FormData): Promise<void> {
  'use server';
  const projectId = String(formData.get('project') ?? '');
  const basePath = String(formData.get('basePath') ?? '/dashboard');
  if (projectId) await setActiveProjectCookie(projectId);
  redirect(basePath);
}
