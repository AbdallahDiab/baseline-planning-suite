import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { projectVisibleMonths } from './index';

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../fixtures/baseline-seed.json',
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('project visible months', () => {
  it('includes March 2026 for prj-1 even though the grid horizon starts in April', () => {
    const parsed: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));
    if (!isRecord(parsed) || !isRecord(parsed.meta) || !Array.isArray(parsed.projects)) {
      throw new Error('Fixture is missing projects');
    }
    const horizon = parsed.meta.gridHorizon;
    if (!isRecord(horizon) || horizon.from !== '2026-04') {
      throw new Error('Expected the official grid horizon to start at 2026-04');
    }
    const project = parsed.projects.find((entry) => isRecord(entry) && entry.id === 'prj-1');
    if (!isRecord(project) || typeof project.startDate !== 'string' || typeof project.endDate !== 'string') {
      throw new Error('prj-1 is missing its dates');
    }

    const months = projectVisibleMonths({
      startDate: project.startDate,
      endDate: project.endDate,
    });
    expect(months.ok).toBe(true);
    if (!months.ok) {
      return;
    }
    expect(project.startDate).toBe('2026-03-01');
    expect(project.endDate).toBe('2027-02-28');
    expect(months.value[0]).toBe('2026-03');
    expect(months.value).toContain('2026-03');
    expect(months.value.at(-1)).toBe('2027-02');
    expect(months.value).toHaveLength(12);
    expect(months.value[0]).not.toBe(horizon.from);
  });

  it('rejects a project whose end date is before its start date', () => {
    expect(
      projectVisibleMonths({ startDate: '2026-05-01', endDate: '2026-04-30' }),
    ).toEqual({
      ok: false,
      error: {
        code: 'end-before-start',
        startDate: '2026-05-01',
        endDate: '2026-04-30',
      },
    });
  });
});
