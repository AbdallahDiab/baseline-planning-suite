import { useState } from 'react';
import type { Project } from '@baseline/contracts';
import { requestErrorMessage } from './api';
import { ProjectSelector } from './ProjectSelector';
import { useProjectAllocations, useProjectWbs, useProjects } from './queries';
import { WbsTree } from './WbsTree';

export function ProjectWorkspace() {
  const projectsQuery = useProjects();
  const [chosenProjectId, setChosenProjectId] = useState<string | null>(null);

  if (projectsQuery.isPending) {
    return <p>Loading projects…</p>;
  }

  if (projectsQuery.isError) {
    return (
      <div>
        <p role="alert">{requestErrorMessage(projectsQuery.error)}</p>
        <button type="button" onClick={() => void projectsQuery.refetch()} disabled={projectsQuery.isFetching}>
          Retry
        </button>
      </div>
    );
  }

  const project = resolveProject(projectsQuery.data, chosenProjectId);
  if (!project) {
    return <p>No projects are available.</p>;
  }

  return (
    <>
      <ProjectSelector projects={projectsQuery.data} project={project} onSelect={setChosenProjectId} />
      <ProjectWbs key={project.id} projectId={project.id} />
    </>
  );
}

function ProjectWbs({ projectId }: { projectId: string }) {
  const wbsQuery = useProjectWbs(projectId);
  const allocationsQuery = useProjectAllocations(projectId);

  if (wbsQuery.isPending || allocationsQuery.isPending) {
    return (
      <section aria-label="Work breakdown">
        <h3>Work breakdown</h3>
        <p>Loading work breakdown…</p>
      </section>
    );
  }

  return (
    <section aria-label="Work breakdown">
      <h3>Work breakdown</h3>
      {wbsQuery.isError ? (
        <div>
          <p role="alert">{requestErrorMessage(wbsQuery.error)}</p>
          <button type="button" onClick={() => void wbsQuery.refetch()} disabled={wbsQuery.isFetching}>
            Retry work breakdown
          </button>
        </div>
      ) : null}
      {allocationsQuery.isError ? (
        <div>
          <p role="alert">{requestErrorMessage(allocationsQuery.error)}</p>
          <button type="button" onClick={() => void allocationsQuery.refetch()} disabled={allocationsQuery.isFetching}>
            Retry allocations
          </button>
        </div>
      ) : null}
      {wbsQuery.data && allocationsQuery.data ? (
        <WbsTree items={wbsQuery.data} allocations={allocationsQuery.data} />
      ) : null}
    </section>
  );
}

function resolveProject(projects: readonly Project[], chosenProjectId: string | null): Project | null {
  if (chosenProjectId !== null) {
    const chosen = projects.find((project) => project.id === chosenProjectId);
    if (chosen) {
      return chosen;
    }
  }
  return projects[0] ?? null;
}
