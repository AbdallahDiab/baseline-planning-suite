import { useState } from 'react';
import type { DisplayCurrency, PlanningEventBus, Project } from '@baseline/contracts';
import { requestErrorMessage } from './api';
import { ProjectSelector } from './ProjectSelector';
import { useCapacity, useEmployees, useProjectAllocations, useProjectWbs, useProjects, useRates } from './queries';
import { StaffingGrid } from './StaffingGrid';
import { firstStaffingItemId } from './staffing-view';
import { WbsTree } from './WbsTree';

export function ProjectWorkspace({
  displayCurrency,
  planningEvents,
}: {
  displayCurrency: DisplayCurrency;
  planningEvents?: PlanningEventBus;
}) {
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
      <ProjectPanel key={project.id} project={project} displayCurrency={displayCurrency} planningEvents={planningEvents} />
    </>
  );
}

function ProjectPanel({
  project,
  displayCurrency,
  planningEvents,
}: {
  project: Project;
  displayCurrency: DisplayCurrency;
  planningEvents?: PlanningEventBus;
}) {
  const wbsQuery = useProjectWbs(project.id);
  const [chosenItemId, setChosenItemId] = useState<string | null>(null);
  const items = wbsQuery.data ?? [];
  const selectedItemId = items.some((item) => item.id === chosenItemId) ? chosenItemId : firstStaffingItemId(items);

  return (
    <>
      <WorkBreakdown
        projectId={project.id}
        selectedItemId={selectedItemId}
        onSelectStaffing={setChosenItemId}
      />
      <StaffingSection
        project={project}
        displayCurrency={displayCurrency}
        selectedItemId={selectedItemId}
        planningEvents={planningEvents}
      />
    </>
  );
}

function WorkBreakdown({
  projectId,
  selectedItemId,
  onSelectStaffing,
}: {
  projectId: string;
  selectedItemId: string | null;
  onSelectStaffing: (itemId: string) => void;
}) {
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
        <WbsTree
          projectId={projectId}
          items={wbsQuery.data}
          allocations={allocationsQuery.data}
          selectedItemId={selectedItemId}
          onSelectStaffing={onSelectStaffing}
        />
      ) : null}
    </section>
  );
}

function StaffingSection({
  project,
  displayCurrency,
  selectedItemId,
  planningEvents,
}: {
  project: Project;
  displayCurrency: DisplayCurrency;
  selectedItemId: string | null;
  planningEvents?: PlanningEventBus;
}) {
  const wbsQuery = useProjectWbs(project.id);
  const allocationsQuery = useProjectAllocations(project.id);
  const employeesQuery = useEmployees();
  const ratesQuery = useRates();
  const capacityQuery = useCapacity();

  return (
    <section aria-label="Staffing">
      <h3>Staffing</h3>
      {employeesQuery.isPending || ratesQuery.isPending || wbsQuery.isPending || allocationsQuery.isPending ? (
        <p>Loading staffing…</p>
      ) : null}
      {employeesQuery.isError ? (
        <StaffingError
          message={requestErrorMessage(employeesQuery.error)}
          label="Retry employees"
          pending={employeesQuery.isFetching}
          onRetry={() => void employeesQuery.refetch()}
        />
      ) : null}
      {ratesQuery.isError ? (
        <StaffingError
          message={requestErrorMessage(ratesQuery.error)}
          label="Retry rates"
          pending={ratesQuery.isFetching}
          onRetry={() => void ratesQuery.refetch()}
        />
      ) : null}
      {wbsQuery.isError ? (
        <StaffingError
          message={requestErrorMessage(wbsQuery.error)}
          label="Retry staffing work breakdown"
          pending={wbsQuery.isFetching}
          onRetry={() => void wbsQuery.refetch()}
        />
      ) : null}
      {allocationsQuery.isError ? (
        <StaffingError
          message={requestErrorMessage(allocationsQuery.error)}
          label="Retry staffing allocations"
          pending={allocationsQuery.isFetching}
          onRetry={() => void allocationsQuery.refetch()}
        />
      ) : null}
      {wbsQuery.data && allocationsQuery.data && employeesQuery.data && ratesQuery.data ? (
        wbsQuery.data.length === 0 ? (
          <p>This project has no work breakdown items yet.</p>
        ) : selectedItemId === null ? (
          <p>No leaf work breakdown item is available.</p>
        ) : (
          <>
            {capacityQuery.isPending ? <p>Checking capacity…</p> : null}
            {capacityQuery.isError ? (
              <StaffingError
                message={requestErrorMessage(capacityQuery.error)}
                label="Retry capacity"
                pending={capacityQuery.isFetching}
                onRetry={() => void capacityQuery.refetch()}
              />
            ) : null}
            <StaffingGrid
              projectId={project.id}
              project={project}
              items={wbsQuery.data}
              allocations={allocationsQuery.data}
              employees={employeesQuery.data}
              rates={ratesQuery.data}
              capacity={capacityQuery.isSuccess ? capacityQuery.data : null}
              selectedItemId={selectedItemId}
              displayCurrency={displayCurrency}
              planningEvents={planningEvents}
            />
          </>
        )
      ) : null}
    </section>
  );
}

function StaffingError({
  message,
  label,
  pending,
  onRetry,
}: {
  message: string;
  label: string;
  pending: boolean;
  onRetry: () => void;
}) {
  return (
    <div>
      <p role="alert">{message}</p>
      <button type="button" onClick={onRetry} disabled={pending}>
        {label}
      </button>
    </div>
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
