import { redirect } from 'next/navigation';

// Projects moved into Settings; keep the old URL working for bookmarks and stale links.
export default function ProjectsRedirect() {
  redirect('/settings/projects');
}
