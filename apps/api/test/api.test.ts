import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Allocation, CapacitySummary, Employee, RateRecord } from '@baseline/contracts';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { PlanningStore } from '../src/store/model';
import { readJson, send, sequentialClock, withApp } from './helpers';

describe('HTTP API', () => {
  it('reports health without leaking unexpected failures', async () => {
    await withApp(async ({ app }) => {
      const response = await send(app, '/api/health');
      expect(response.status).toBe(200);
      expect(await readJson(response)).toEqual({ status: 'ok' });
    });

    const store: PlanningStore = {
      snapshot() {
        throw new Error('secret disk path C:\\data\\baseline-store.json');
      },
      transact() {
        return Promise.reject(new Error('secret disk path C:\\data\\baseline-store.json'));
      },
    };
    const app = createApp({ store });
    const response = await app.request('/api/employees');
    expect(response.status).toBe(500);
    const body = await readJson<{ error: { code: string; message: string }; stack?: string }>(response);
    expect(body).toEqual({
      error: {
        code: 'internal_error',
        message: 'Internal server error',
      },
    });
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('searches employees by name or role without changing the register', async () => {
    await withApp(async ({ app }) => {
      const all = await send(app, '/api/employees');
      expect(all.status).toBe(200);
      const employees = await readJson<Employee[]>(all);
      expect(employees).toHaveLength(60);

      const byName = await send(app, '/api/employees?search=oKaFoR');
      const named = await readJson<Employee[]>(byName);
      expect(named.map((employee) => employee.id)).toEqual(
        employees
          .filter((employee) => employee.name.toLowerCase().includes('okafor'))
          .map((employee) => employee.id),
      );
      expect(named.map((employee) => employee.id)).toEqual(expect.arrayContaining(['emp-001', 'emp-002']));

      const byRole = await send(app, '/api/employees?search=TECH%20LEAD');
      const leads = await readJson<Employee[]>(byRole);
      expect(leads.length).toBeGreaterThan(0);
      expect(leads.every((employee) => employee.role.toLowerCase().includes('tech lead'))).toBe(true);

      const one = await send(app, '/api/employees/emp-001');
      expect(await readJson<Employee>(one)).toMatchObject({
        id: 'emp-001',
        name: 'Adaeze Okafor',
        role: 'Tech Lead',
        weeklyHours: 40,
      });

      const missing = await send(app, '/api/employees/emp-missing');
      expect(missing.status).toBe(404);
      expect(await readJson(missing)).toEqual({
        error: {
          code: 'not_found',
          message: 'Employee emp-missing was not found',
        },
      });
    });
  });

  it('adds, corrects, and deletes a rate, then keeps that history across a new store', async () => {
    await withApp(async ({ app, reload }) => {
      const before = await readJson<RateRecord[]>(await send(app, '/api/rates'));
      expect(before).toHaveLength(150);
      const originalEmployee = await readJson<Employee>(await send(app, '/api/employees/emp-004'));

      const createdResponse = await send(app, '/api/rates', {
        method: 'POST',
        json: { employeeId: 'emp-004', validFrom: '2026-09-01', hourlyCost: 110 },
      });
      expect(createdResponse.status).toBe(201);
      const created = await readJson<RateRecord>(createdResponse);
      expect(created.id.startsWith('rate-')).toBe(true);
      expect(created).toMatchObject({
        employeeId: 'emp-004',
        validFrom: '2026-09-01',
        hourlyCost: 110,
      });

      const invalidDate = await send(app, '/api/rates', {
        method: 'POST',
        json: { employeeId: 'emp-004', validFrom: '2025-02-29', hourlyCost: 10 },
      });
      expect(invalidDate.status).toBe(400);
      expect((await readJson<{ error: { code: string } }>(invalidDate)).error.code).toBe('invalid_request');

      const negative = await send(app, '/api/rates', {
        method: 'POST',
        json: { employeeId: 'emp-004', validFrom: '2026-01-01', hourlyCost: -1 },
      });
      expect(negative.status).toBe(400);

      const unknownEmployee = await send(app, '/api/rates', {
        method: 'POST',
        json: { employeeId: 'emp-missing', validFrom: '2026-01-01', hourlyCost: 10 },
      });
      expect(unknownEmployee.status).toBe(404);

      const correctedResponse = await send(app, `/api/rates/${created.id}`, {
        method: 'PATCH',
        json: { employeeId: 'emp-001', validFrom: '2024-02-29', hourlyCost: 12.5 },
      });
      expect(correctedResponse.status).toBe(200);
      expect(await readJson<RateRecord>(correctedResponse)).toEqual({
        id: created.id,
        employeeId: 'emp-004',
        validFrom: '2024-02-29',
        hourlyCost: 12.5,
      });

      const emptyPatch = await send(app, `/api/rates/${created.id}`, { method: 'PATCH', json: {} });
      expect(emptyPatch.status).toBe(400);

      const filtered = await readJson<RateRecord[]>(await send(app, '/api/rates?employeeId=emp-004'));
      expect(filtered.every((rate) => rate.employeeId === 'emp-004')).toBe(true);
      expect(filtered.some((rate) => rate.id === created.id && rate.validFrom === '2024-02-29')).toBe(true);
      expect(await readJson<Employee>(await send(app, '/api/employees/emp-004'))).toEqual(originalEmployee);

      const reloaded = await reload();
      const persisted = await readJson<RateRecord[]>(await reloaded.app.request('/api/rates?employeeId=emp-004'));
      expect(persisted.find((rate) => rate.id === created.id)).toEqual({
        id: created.id,
        employeeId: 'emp-004',
        validFrom: '2024-02-29',
        hourlyCost: 12.5,
      });

      const removed = await reloaded.app.request(`/api/rates/${created.id}`, { method: 'DELETE' });
      expect(removed.status).toBe(204);
      expect(await removed.text()).toBe('');
      const afterDelete = await reload();
      const remaining = await readJson<RateRecord[]>(await afterDelete.app.request('/api/rates'));
      expect(remaining).toHaveLength(150);
      expect(remaining.some((rate) => rate.id === created.id)).toBe(false);

      const missingDelete = await afterDelete.app.request(`/api/rates/${created.id}`, { method: 'DELETE' });
      expect(missingDelete.status).toBe(404);
    });
  });

  it('keeps People routes independent of the Delivery domain package', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../src/routes/people.ts'), 'utf8');
    expect(source).not.toMatch(/from ['"]@baseline\/delivery-domain['"]/);
    const contracts = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../../packages/contracts/src/index.ts'),
      'utf8',
    );
    expect(contracts).not.toContain('@baseline/delivery-domain');
  });

  it('validates WBS creation with the Delivery domain rules', async () => {
    await withApp(async ({ app }) => {
      const missingParent = await send(app, '/api/projects/prj-1/wbs', {
        method: 'POST',
        json: { parentId: 'wbs-missing', name: 'Orphan' },
      });
      expect(missingParent.status).toBe(409);
      expect((await readJson<{ error: { code: string } }>(missingParent)).error.code).toBe('parent-not-found');

      const crossProject = await send(app, '/api/projects/prj-1/wbs', {
        method: 'POST',
        json: { parentId: 'wbs-027', name: 'Cross' },
      });
      expect(crossProject.status).toBe(409);
      expect((await readJson<{ error: { code: string } }>(crossProject)).error.code).toBe('cross-project-parent');

      const allocatedParent = await send(app, '/api/projects/prj-1/wbs', {
        method: 'POST',
        json: { parentId: 'wbs-012', name: 'Under allocated' },
      });
      expect(allocatedParent.status).toBe(409);
      expect((await readJson<{ error: { code: string } }>(allocatedParent)).error.code).toBe('allocated-leaf');

      const root = await readJson<{ id: string; parentId: string | null; projectId: string }>(
        await send(app, '/api/projects/prj-1/wbs', {
          method: 'POST',
          json: { parentId: null, name: 'New root' },
        }),
      );
      const mid = await readJson<{ id: string }>(
        await send(app, '/api/projects/prj-1/wbs', {
          method: 'POST',
          json: { parentId: root.id, name: 'Mid' },
        }),
      );
      const leaf = await readJson<{ id: string }>(
        await send(app, '/api/projects/prj-1/wbs', {
          method: 'POST',
          json: { parentId: mid.id, name: 'Leaf' },
        }),
      );
      const tooDeep = await send(app, '/api/projects/prj-1/wbs', {
        method: 'POST',
        json: { parentId: leaf.id, name: 'Too deep' },
      });
      expect(tooDeep.status).toBe(409);
      expect((await readJson<{ error: { code: string } }>(tooDeep)).error.code).toBe('depth-exceeded');
      expect(root).toMatchObject({ parentId: null, projectId: 'prj-1' });

      const missingProject = await send(app, '/api/projects/prj-missing/wbs', {
        method: 'POST',
        json: { parentId: null, name: 'Nope' },
      });
      expect(missingProject.status).toBe(404);
    });
  });

  it('validates WBS moves, including rejection under an allocated leaf', async () => {
    await withApp(async ({ app }) => {
      const parent = await readJson<{ id: string }>(
        await send(app, '/api/projects/prj-1/wbs', {
          method: 'POST',
          json: { parentId: null, name: 'Allocated parent' },
        }),
      );
      const allocatedLeaf = await readJson<{ id: string; parentId: string | null }>(
        await send(app, '/api/projects/prj-1/wbs', {
          method: 'POST',
          json: { parentId: parent.id, name: 'Allocated leaf' },
        }),
      );
      const moving = await readJson<{ id: string; name: string; parentId: string | null }>(
        await send(app, '/api/projects/prj-1/wbs', {
          method: 'POST',
          json: { parentId: null, name: 'Mover' },
        }),
      );
      const allocation = await send(app, '/api/allocations/cell', {
        method: 'PUT',
        json: {
          breakdownItemId: allocatedLeaf.id,
          employeeId: 'emp-010',
          month: '2026-06',
          amount: 0.25,
        },
      });
      expect(allocation.status).toBe(200);

      const rejected = await send(app, `/api/wbs/${moving.id}`, {
        method: 'PATCH',
        json: { parentId: allocatedLeaf.id },
      });
      expect(rejected.status).toBe(409);
      expect((await readJson<{ error: { code: string } }>(rejected)).error.code).toBe('allocated-leaf');

      const crossProject = await send(app, `/api/wbs/${moving.id}`, {
        method: 'PATCH',
        json: { parentId: 'wbs-027' },
      });
      expect(crossProject.status).toBe(409);
      expect((await readJson<{ error: { code: string } }>(crossProject)).error.code).toBe('cross-project');

      const renamed = await readJson<{ id: string; name: string; parentId: string | null; projectId: string }>(
        await send(app, `/api/wbs/${moving.id}`, {
          method: 'PATCH',
          json: { name: 'Renamed mover', projectId: 'prj-2' },
        }),
      );
      expect(renamed).toMatchObject({
        id: moving.id,
        name: 'Renamed mover',
        parentId: null,
        projectId: 'prj-1',
      });

      const moved = await readJson<{ parentId: string | null; name: string }>(
        await send(app, `/api/wbs/${moving.id}`, {
          method: 'PATCH',
          json: { parentId: parent.id },
        }),
      );
      expect(moved).toEqual({ parentId: parent.id, name: 'Renamed mover', id: moving.id, projectId: 'prj-1' });

      const backToRoot = await readJson<{ parentId: string | null }>(
        await send(app, `/api/wbs/${moving.id}`, {
          method: 'PATCH',
          json: { parentId: null },
        }),
      );
      expect(backToRoot.parentId).toBeNull();

      const cycle = await send(app, '/api/wbs/wbs-001', {
        method: 'PATCH',
        json: { parentId: 'wbs-004' },
      });
      expect(cycle.status).toBe(409);
      expect((await readJson<{ error: { code: string } }>(cycle)).error.code).toBe('cycle');

      const omitted = await send(app, `/api/wbs/${moving.id}`, { method: 'PATCH', json: {} });
      expect(omitted.status).toBe(400);
    });
  });

  it('rejects WBS deletion while children or allocations remain', async () => {
    await withApp(async ({ app }) => {
      const withChildren = await send(app, '/api/wbs/wbs-001', { method: 'DELETE' });
      expect(withChildren.status).toBe(409);
      expect((await readJson<{ error: { code: string } }>(withChildren)).error.code).toBe('has-children');

      const withAllocations = await send(app, '/api/wbs/wbs-012', { method: 'DELETE' });
      expect(withAllocations.status).toBe(409);
      expect((await readJson<{ error: { code: string } }>(withAllocations)).error.code).toBe('has-allocations');

      const created = await readJson<{ id: string }>(
        await send(app, '/api/projects/prj-2/wbs', {
          method: 'POST',
          json: { parentId: null, name: 'Disposable' },
        }),
      );
      const removed = await send(app, `/api/wbs/${created.id}`, { method: 'DELETE' });
      expect(removed.status).toBe(204);
      const missing = await send(app, `/api/wbs/${created.id}`, { method: 'DELETE' });
      expect(missing.status).toBe(404);
    });
  });

  it('upserts canonical person-months and keeps March 2026 visible for prj-1', async () => {
    const now = sequentialClock();
    await withApp(async ({ app, reload }) => {
      const projects = await readJson<Array<{ id: string }>>(await send(app, '/api/projects'));
      expect(projects).toHaveLength(4);

      const allocations = await readJson<Allocation[]>(await send(app, '/api/projects/prj-1/allocations'));
      const march = allocations.find((allocation) => allocation.id === 'alloc-001');
      expect(march).toEqual({
        id: 'alloc-001',
        breakdownItemId: 'wbs-012',
        employeeId: 'emp-001',
        month: '2026-03',
        amount: 0.5,
        updatedAt: null,
      });

      const nonLeaf = await send(app, '/api/allocations/cell', {
        method: 'PUT',
        json: { breakdownItemId: 'wbs-001', employeeId: 'emp-002', month: '2026-06', amount: 0.2 },
      });
      expect(nonLeaf.status).toBe(409);
      expect((await readJson<{ error: { code: string } }>(nonLeaf)).error.code).toBe('not-a-leaf');

      const outsideProject = await send(app, '/api/allocations/cell', {
        method: 'PUT',
        json: { breakdownItemId: 'wbs-012', employeeId: 'emp-002', month: '2027-03', amount: 0.2 },
      });
      expect(outsideProject.status).toBe(409);
      expect((await readJson<{ error: { code: string } }>(outsideProject)).error.code).toBe('month-out-of-range');

      const malformedMonth = await send(app, '/api/allocations/cell', {
        method: 'PUT',
        json: { breakdownItemId: 'wbs-012', employeeId: 'emp-002', month: '2026-3', amount: 0.2 },
      });
      expect(malformedMonth.status).toBe(400);

      const createdResponse = await send(app, '/api/allocations/cell', {
        method: 'PUT',
        json: { breakdownItemId: 'wbs-012', employeeId: 'emp-002', month: '2026-03', amount: 1.23456789 },
      });
      expect(createdResponse.status).toBe(200);
      const created = await readJson<Allocation>(createdResponse);
      expect(created.amount).toBe(1.23456789);
      expect(created.updatedAt).toBe('2026-10-04T09:00:01.000Z');
      expect(created.id.startsWith('alloc-')).toBe(true);

      const updated = await readJson<Allocation>(
        await send(app, '/api/allocations/cell', {
          method: 'PUT',
          json: { breakdownItemId: 'wbs-012', employeeId: 'emp-002', month: '2026-03', amount: 0 },
        }),
      );
      expect(updated.id).toBe(created.id);
      expect(updated.amount).toBe(0);
      expect(updated.updatedAt).toBe('2026-10-04T09:00:02.000Z');

      const reloaded = await reload();
      const persisted = await readJson<Allocation[]>(
        await reloaded.app.request('/api/projects/prj-1/allocations'),
      );
      expect(persisted.find((allocation) => allocation.id === 'alloc-001')).toMatchObject({
        month: '2026-03',
        amount: 0.5,
        updatedAt: null,
      });
      expect(persisted.find((allocation) => allocation.id === created.id)).toEqual(updated);
    }, { now });
  });

  it('projects seeded over-capacity across projects and names a cause only after a real edit', async () => {
    const now = sequentialClock();
    await withApp(async ({ app }) => {
      const henrik = await readJson<CapacitySummary[]>(
        await send(app, '/api/capacity?employeeId=emp-023&month=2026-06'),
      );
      expect(henrik).toEqual([
        {
          employeeId: 'emp-023',
          month: '2026-06',
          totalPersonMonths: 1.3,
          overCapacity: true,
          causeAllocationId: null,
        },
      ]);

      const milan = await readJson<CapacitySummary[]>(
        await send(app, '/api/capacity?employeeId=emp-003&month=2026-06'),
      );
      expect(milan).toEqual([
        {
          employeeId: 'emp-003',
          month: '2026-06',
          totalPersonMonths: 1.18,
          overCapacity: true,
          causeAllocationId: null,
        },
      ]);

      const projectIds = ['prj-1', 'prj-2', 'prj-3', 'prj-4'];
      const contributing: Allocation[] = [];
      for (const projectId of projectIds) {
        const rows = await readJson<Allocation[]>(await send(app, `/api/projects/${projectId}/allocations`));
        contributing.push(
          ...rows.filter((allocation) => allocation.employeeId === 'emp-023' && allocation.month === '2026-06'),
        );
      }
      expect(contributing.map((allocation) => allocation.amount).sort()).toEqual([0.65, 0.65]);
      expect(contributing.every((allocation) => allocation.updatedAt === null)).toBe(true);

      const [first, second] = contributing;
      if (!first || !second) {
        throw new Error('Expected two June allocations for emp-023');
      }
      await send(app, '/api/allocations/cell', {
        method: 'PUT',
        json: {
          breakdownItemId: first.breakdownItemId,
          employeeId: first.employeeId,
          month: first.month,
          amount: first.amount,
        },
      });
      await send(app, '/api/allocations/cell', {
        method: 'PUT',
        json: {
          breakdownItemId: second.breakdownItemId,
          employeeId: second.employeeId,
          month: second.month,
          amount: second.amount,
        },
      });

      const after = await readJson<CapacitySummary[]>(
        await send(app, '/api/capacity?employeeId=emp-023&month=2026-06'),
      );
      expect(after).toEqual([
        {
          employeeId: 'emp-023',
          month: '2026-06',
          totalPersonMonths: 1.3,
          overCapacity: true,
          causeAllocationId: second.id,
        },
      ]);
    }, { now });
  });
});
