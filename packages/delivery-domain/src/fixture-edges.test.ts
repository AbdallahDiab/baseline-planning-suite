import { describe, expect, it } from 'vitest';
import {
  priceMonthlyAllocation,
  rollupEffortAndCost,
  summarizeEmployeeCapacity,
  validateAddWbsChild,
  validateDeleteWbsItem,
  validateLeafAllocationTarget,
  validateWbsTree,
  weekdaySunday0,
} from './index';
import { loadBaselineSeed } from './testing/load-baseline-seed';

const seed = loadBaselineSeed();

function requireEmployee(id: string) {
  const employee = seed.employees.find((entry) => entry.id === id);
  if (!employee) {
    throw new Error(`Missing employee ${id}`);
  }
  return employee;
}

function ratesFor(employeeId: string) {
  return seed.rateRecords.filter((rate) => rate.employeeId === employeeId);
}

describe('official fixture edge cases', () => {
  it('applies a Saturday rate on the next working day for a seeded August allocation', () => {
    expect(weekdaySunday0(2026, 8, 1)).toBe(6);
    const employee = requireEmployee('emp-038');
    const rates = ratesFor('emp-038');
    const saturdayRate = rates.find((rate) => rate.validFrom === '2026-08-01');
    const august = seed.allocations.find(
      (allocation) => allocation.employeeId === 'emp-038' && allocation.month === '2026-08',
    );
    if (!saturdayRate || !august) {
      throw new Error('Expected emp-038 to have a Saturday rate and an August allocation');
    }

    const priced = priceMonthlyAllocation({
      personMonths: august.personMonths,
      weeklyHours: employee.weeklyHours,
      month: '2026-08',
      rates,
    });
    expect(priced.coverage).toEqual({ status: 'full' });
    expect(priced.splits).toHaveLength(1);
    expect(priced.splits[0]).toMatchObject({
      rateId: saturdayRate.id,
      validFrom: '2026-08-01',
      workingDays: priced.workingDays,
    });

    const july = priceMonthlyAllocation({
      personMonths: 1,
      weeklyHours: employee.weeklyHours,
      month: '2026-07',
      rates,
    });
    expect(july.splits.some((split) => split.rateId === saturdayRate.id)).toBe(false);
  });

  it('prices a seeded mid-month rate decrease', () => {
    const employee = requireEmployee('emp-012');
    const rates = ratesFor('emp-012');
    const decreased = rates.find((rate) => rate.validFrom === '2026-06-11');
    const previous = rates
      .filter((rate) => rate.validFrom < '2026-06-11')
      .sort((left, right) => left.validFrom.localeCompare(right.validFrom))
      .at(-1);
    const june = seed.allocations.find(
      (allocation) => allocation.id === 'alloc-067' && allocation.employeeId === 'emp-012',
    );
    if (!decreased || !previous || !june) {
      throw new Error('Expected emp-012 June decrease records');
    }
    expect(decreased.hourlyCost).toBeLessThan(previous.hourlyCost);

    const priced = priceMonthlyAllocation({
      personMonths: june.personMonths,
      weeklyHours: employee.weeklyHours,
      month: june.month,
      rates,
    });
    expect(priced.coverage).toEqual({ status: 'full' });
    expect(priced.splits.map((split) => [split.rateId, split.hourlyCost, split.workingDays])).toEqual([
      [previous.id, previous.hourlyCost, 8],
      [decreased.id, decreased.hourlyCost, 14],
    ]);
  });

  it('finds the six seeded oversubscribed employee-months across projects', () => {
    const projectByItem = new Map(seed.breakdownItems.map((item) => [item.id, item.projectId]));
    const summaries = summarizeEmployeeCapacity(seed.allocations);
    const oversubscribed = summaries.filter((summary) => summary.oversubscribed);

    expect(oversubscribed.map((summary) => [summary.employeeId, summary.month, summary.personMonths])).toEqual([
      ['emp-002', '2026-09', 1.05],
      ['emp-003', '2026-06', 1.18],
      ['emp-012', '2026-05', 1.12],
      ['emp-023', '2026-06', 1.3],
      ['emp-031', '2026-12', 1.02],
      ['emp-043', '2026-10', 1.07],
    ]);
    expect(oversubscribed.every((summary) => summary.cause === null)).toBe(true);

    const emp023 = seed.allocations.filter(
      (allocation) => allocation.employeeId === 'emp-023' && allocation.month === '2026-06',
    );
    expect(emp023.map((allocation) => allocation.personMonths)).toEqual([0.65, 0.65]);
    expect(emp023.map((allocation) => projectByItem.get(allocation.breakdownItemId)).sort()).toEqual([
      'prj-1',
      'prj-4',
    ]);
    const ledgerOnly = seed.allocations.filter(
      (allocation) => projectByItem.get(allocation.breakdownItemId) === 'prj-1',
    );
    const ledgerJune = summarizeEmployeeCapacity(ledgerOnly).find(
      (summary) => summary.employeeId === 'emp-023' && summary.month === '2026-06',
    );
    expect(ledgerJune).toMatchObject({ personMonths: 0.65, oversubscribed: false });

    const emp003 = seed.allocations.filter(
      (allocation) => allocation.employeeId === 'emp-003' && allocation.month === '2026-06',
    );
    expect(emp003.reduce((sum, allocation) => sum + allocation.personMonths, 0)).toBe(1.18);
    expect(emp003.map((allocation) => projectByItem.get(allocation.breakdownItemId)).sort()).toEqual([
      'prj-1',
      'prj-3',
    ]);
  });

  it('keeps the seeded breakdown inside three levels and refuses unsafe edits', () => {
    expect(seed.gridHorizon.from).toBe('2026-04');
    expect(validateWbsTree(seed.breakdownItems)).toEqual({ ok: true, value: undefined });

    for (const allocation of seed.allocations) {
      expect(validateLeafAllocationTarget(seed.breakdownItems, allocation.breakdownItemId)).toEqual({
        ok: true,
        value: undefined,
      });
    }

    expect(validateAddWbsChild(seed.breakdownItems, 'wbs-012', seed.allocations)).toEqual({
      ok: false,
      error: { code: 'allocated-leaf', parentId: 'wbs-012' },
    });
    expect(validateDeleteWbsItem(seed.breakdownItems, 'wbs-001', seed.allocations)).toEqual({
      ok: false,
      error: { code: 'has-children', itemId: 'wbs-001' },
    });
    expect(validateDeleteWbsItem(seed.breakdownItems, 'wbs-012', seed.allocations)).toEqual({
      ok: false,
      error: { code: 'has-allocations', itemId: 'wbs-012' },
    });
  });

  it('rolls seeded leaf effort up to the project roots', () => {
    const items = seed.breakdownItems.filter((item) => item.projectId === 'prj-1');
    const itemIds = new Set(items.map((item) => item.id));
    const contributions = seed.allocations
      .filter((allocation) => itemIds.has(allocation.breakdownItemId))
      .map((allocation) => ({
        itemId: allocation.breakdownItemId,
        personMonths: allocation.personMonths,
        cost: 0,
      }));
    const rolled = rollupEffortAndCost(items, contributions);
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) {
      return;
    }
    const leafTotal = contributions.reduce((sum, contribution) => sum + contribution.personMonths, 0);
    const rootTotal = items
      .filter((item) => item.parentId === null)
      .reduce((sum, item) => sum + (rolled.value.get(item.id)?.personMonths ?? 0), 0);
    // Addition order can move the raw sum by one binary ulp. The fixture amounts
    // are hundredths of a person-month, so the rolled total must still match in cents.
    expect(Math.abs(rootTotal - leafTotal)).toBeLessThan(1e-9);
    expect(Math.round(rootTotal * 100)).toBe(Math.round(leafTotal * 100));
  });
});
