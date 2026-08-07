import { Select } from './ui/select';
import { SubmitButton } from './ui/submit-button';
import { selectProjectAction } from '../lib/active-project';

/**
 * Active-project selector for project-scoped pages (dashboard, targets, scans, schedules). Switching
 * persists the choice in a cookie (via selectProjectAction) so every page stays on the same project
 * as you navigate, rather than each page independently defaulting to the most recent project.
 */
export function ProjectSwitcher({
  projects,
  current,
  basePath,
}: {
  projects: { id: string; name: string }[];
  current?: string;
  basePath: string;
}) {
  if (projects.length === 0) return null;
  return (
    <form action={selectProjectAction} className="flex items-center gap-2">
      <input type="hidden" name="basePath" value={basePath} />
      <Select name="project" defaultValue={current} aria-label="Active project" className="w-52">
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
      <SubmitButton variant="ghost" size="sm">
        Switch
      </SubmitButton>
    </form>
  );
}
