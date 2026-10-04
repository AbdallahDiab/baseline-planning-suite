import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { JsonStore, resolveSeedFile } from '../src/store/json-store';
import { withApp } from './helpers';

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('JSON working store', () => {
  it('copies and normalizes the seed on first initialization', async () => {
    await withApp(async ({ store, dataFile, seedFile }) => {
      const snapshot = store.snapshot();
      const seed = JSON.parse(await readFile(seedFile, 'utf8')) as {
        meta: { gridHorizon: { from: string } };
        allocations: Array<{ id: string; amount: number; updatedAt?: unknown }>;
        employees: Array<{ id: string; name: string; role: string; weeklyHours: number }>;
      };

      expect(snapshot.meta).toEqual(seed.meta);
      expect(snapshot.employees.map((employee) => employee.id)).toEqual(seed.employees.map((employee) => employee.id));
      expect(snapshot.employees[0]).toEqual(seed.employees[0]);
      expect(seed.allocations.every((allocation) => !('updatedAt' in allocation))).toBe(true);
      expect(snapshot.allocations.every((allocation) => allocation.updatedAt === null)).toBe(true);
      expect(snapshot.allocations.map((allocation) => [allocation.id, allocation.amount])).toEqual(
        seed.allocations.map((allocation) => [allocation.id, allocation.amount]),
      );
      expect(snapshot.meta.gridHorizon.from).toBe('2026-04');

      const persisted = JSON.parse(await readFile(dataFile, 'utf8')) as {
        allocations: Array<{ updatedAt: string | null }>;
      };
      expect(persisted.allocations.every((allocation) => allocation.updatedAt === null)).toBe(true);
    });
  });

  it('does not modify the immutable fixture', async () => {
    const seedFile = resolveSeedFile();
    const before = sha256(seedFile);
    await withApp(async ({ store }) => {
      await store.transact((draft) => {
        const rate = draft.rateRecords[0];
        if (!rate) {
          throw new Error('Expected a seeded rate');
        }
        rate.hourlyCost = 1;
        return null;
      });
    });
    expect(sha256(seedFile)).toBe(before);
  });

  it('keeps the official fixture counts', async () => {
    await withApp(async ({ store }) => {
      const snapshot = store.snapshot();
      expect(snapshot.employees).toHaveLength(60);
      expect(snapshot.rateRecords).toHaveLength(150);
      expect(snapshot.projects).toHaveLength(4);
      expect(snapshot.breakdownItems).toHaveLength(90);
      expect(snapshot.allocations).toHaveLength(720);
    });
  });

  it('reloads an existing store without reseeding', async () => {
    await withApp(async ({ dataFile, seedFile, store }) => {
      await store.transact((draft) => {
        draft.rateRecords.push({
          id: 'rate-reload',
          employeeId: 'emp-001',
          validFrom: '2024-01-01',
          hourlyCost: 12.5,
        });
        return null;
      });
      const reloaded = await JsonStore.open({ dataFile, seedFile });
      const rates = reloaded.snapshot().rateRecords;
      expect(rates).toHaveLength(151);
      expect(rates.find((rate) => rate.id === 'rate-reload')).toEqual({
        id: 'rate-reload',
        employeeId: 'emp-001',
        validFrom: '2024-01-01',
        hourlyCost: 12.5,
      });
      expect(reloaded.snapshot().employees).toHaveLength(60);
    });
  });

  it('serializes concurrent writes so none are lost', async () => {
    await withApp(async ({ store, reload }) => {
      await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          store.transact((draft) => {
            draft.rateRecords.push({
              id: `rate-concurrent-${index}`,
              employeeId: 'emp-001',
              validFrom: '2026-01-01',
              hourlyCost: index,
            });
            return null;
          }),
        ),
      );
      expect(store.snapshot().rateRecords).toHaveLength(170);
      const reloaded = await reload();
      expect(reloaded.store.snapshot().rateRecords).toHaveLength(170);
      expect(reloaded.store.snapshot().rateRecords.some((rate) => rate.id === 'rate-concurrent-0')).toBe(true);
      expect(reloaded.store.snapshot().rateRecords.some((rate) => rate.id === 'rate-concurrent-19')).toBe(true);
    });
  });
});
