import { compareIsoDate, listYearMonths, parseIsoDate } from './dates';
import { err, ok } from './result';
import type { DomainResult } from './result';

export interface DatedProject {
  startDate: string;
  endDate: string;
}

export type ProjectMonthError = {
  code: 'end-before-start';
  startDate: string;
  endDate: string;
};

/**
 * Months visible for a project, from the start date's month through the end
 * date's month. This does not read a grid horizon.
 */
export function projectVisibleMonths(
  project: DatedProject,
): DomainResult<readonly string[], ProjectMonthError> {
  const start = parseIsoDate(project.startDate);
  const end = parseIsoDate(project.endDate);
  if (compareIsoDate(project.endDate, project.startDate) < 0) {
    return err({
      code: 'end-before-start',
      startDate: project.startDate,
      endDate: project.endDate,
    });
  }
  return ok(listYearMonths(start, end));
}
