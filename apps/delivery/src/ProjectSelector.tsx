import type { Project } from '@baseline/contracts';

export function ProjectSelector({
  projects,
  project,
  onSelect,
}: {
  projects: readonly Project[];
  project: Project;
  onSelect: (projectId: string) => void;
}) {
  return (
    <section className="project-selector" aria-label="Selected project">
      <label htmlFor="delivery-project">
        Project
        <select
          id="delivery-project"
          value={project.id}
          onChange={(event) => {
            onSelect(event.target.value);
          }}
        >
          {projects.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </label>
      <dl className="project-details">
        <div>
          <dt>Name</dt>
          <dd>{project.name}</dd>
        </div>
        <div>
          <dt>Start date</dt>
          <dd>
            <time dateTime={project.startDate}>{project.startDate}</time>
          </dd>
        </div>
        <div>
          <dt>End date</dt>
          <dd>
            <time dateTime={project.endDate}>{project.endDate}</time>
          </dd>
        </div>
      </dl>
    </section>
  );
}
