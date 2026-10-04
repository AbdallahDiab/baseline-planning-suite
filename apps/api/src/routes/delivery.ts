import type {
  WbsAddChildError,
  WbsDeleteError,
  WbsLeafError,
  WbsMoveError,
  WbsTreeError,
} from '@baseline/delivery-domain';
import {
  projectVisibleMonths,
  summarizeEmployeeCapacity,
  validateAddWbsChild,
  validateDeleteWbsItem,
  validateLeafAllocationTarget,
  validateMoveWbsItem,
  validateWbsTree,
} from '@baseline/delivery-domain';
import type { Allocation, BreakdownItem, CapacitySummary } from '@baseline/contracts';
import type { DomainAllocation } from '@baseline/delivery-domain';
import type { Hono } from 'hono';
import { conflict, notFound } from '../errors';
import { createId } from '../ids';
import {
  allocationCellSchema,
  capacityQuerySchema,
  createWbsSchema,
  parseSchema,
  parseWbsPatch,
  readJsonBody,
} from '../schema';
import type { PlanningStore, WorkingStore } from '../store/model';

export function registerDeliveryRoutes(app: Hono, store: PlanningStore, now: () => string): void {
  app.get('/api/projects', (c) => {
    return c.json(store.snapshot().projects);
  });

  app.get('/api/projects/:projectId/wbs', (c) => {
    const projectId = c.req.param('projectId');
    const snapshot = store.snapshot();
    requireProject(snapshot, projectId);
    return c.json(snapshot.breakdownItems.filter((item) => item.projectId === projectId));
  });

  app.get('/api/projects/:projectId/allocations', (c) => {
    const projectId = c.req.param('projectId');
    const snapshot = store.snapshot();
    requireProject(snapshot, projectId);
    const itemIds = new Set(
      snapshot.breakdownItems.filter((item) => item.projectId === projectId).map((item) => item.id),
    );
    return c.json(snapshot.allocations.filter((allocation) => itemIds.has(allocation.breakdownItemId)));
  });

  app.post('/api/projects/:projectId/wbs', async (c) => {
    const projectId = c.req.param('projectId');
    const body = parseSchema(createWbsSchema, await readJsonBody(c.req));
    const created = await store.transact((draft) => {
      requireProject(draft, projectId);
      const item: BreakdownItem = {
        id: createId('wbs'),
        projectId,
        parentId: body.parentId,
        name: body.name,
      };
      if (body.parentId !== null) {
        const added = validateAddWbsChild(draft.breakdownItems, body.parentId, allocationRefs(draft));
        if (!added.ok) {
          throw mapAddChildError(added.error);
        }
      }
      const tree = validateWbsTree([...draft.breakdownItems, item]);
      if (!tree.ok) {
        throw mapTreeError(tree.error);
      }
      draft.breakdownItems.push(item);
      return item;
    });
    return c.json(created, 201);
  });

  app.patch('/api/wbs/:itemId', async (c) => {
    const itemId = c.req.param('itemId');
    const patch = parseWbsPatch(await readJsonBody(c.req));
    const updated = await store.transact((draft) => {
      const item = draft.breakdownItems.find((entry) => entry.id === itemId);
      if (!item) {
        throw notFound(`WBS item ${itemId} was not found`);
      }
      if (patch.parentProvided) {
        const parentId = patch.parentId ?? null;
        const moved = validateMoveWbsItem(draft.breakdownItems, itemId, parentId, allocationRefs(draft));
        if (!moved.ok) {
          throw mapMoveError(moved.error);
        }
        item.parentId = parentId;
      }
      if (patch.name !== undefined) {
        item.name = patch.name;
      }
      return item;
    });
    return c.json(updated);
  });

  app.delete('/api/wbs/:itemId', async (c) => {
    const itemId = c.req.param('itemId');
    await store.transact((draft) => {
      const result = validateDeleteWbsItem(draft.breakdownItems, itemId, allocationRefs(draft));
      if (!result.ok) {
        throw mapDeleteError(result.error);
      }
      draft.breakdownItems = draft.breakdownItems.filter((item) => item.id !== itemId);
      return null;
    });
    return c.body(null, 204);
  });

  app.put('/api/allocations/cell', async (c) => {
    const body = parseSchema(allocationCellSchema, await readJsonBody(c.req));
    const saved = await store.transact((draft) => {
      const item = draft.breakdownItems.find((entry) => entry.id === body.breakdownItemId);
      if (!item) {
        throw notFound(`Breakdown item ${body.breakdownItemId} was not found`);
      }
      const employee = draft.employees.find((entry) => entry.id === body.employeeId);
      if (!employee) {
        throw notFound(`Employee ${body.employeeId} was not found`);
      }
      const leaf = validateLeafAllocationTarget(draft.breakdownItems, item.id);
      if (!leaf.ok) {
        throw mapLeafError(leaf.error);
      }
      const project = draft.projects.find((entry) => entry.id === item.projectId);
      if (!project) {
        throw notFound(`Project ${item.projectId} was not found`);
      }
      const months = projectVisibleMonths(project);
      if (!months.ok || !months.value.includes(body.month)) {
        throw conflict(
          'month-out-of-range',
          `Month ${body.month} is outside project ${project.id} (${project.startDate} to ${project.endDate})`,
        );
      }
      const updatedAt = now();
      const existing = draft.allocations.find(
        (entry) =>
          entry.breakdownItemId === body.breakdownItemId &&
          entry.employeeId === body.employeeId &&
          entry.month === body.month,
      );
      if (existing) {
        existing.amount = body.amount;
        existing.updatedAt = updatedAt;
        return existing;
      }
      const created: Allocation = {
        id: createId('alloc'),
        breakdownItemId: body.breakdownItemId,
        employeeId: body.employeeId,
        month: body.month,
        amount: body.amount,
        updatedAt,
      };
      draft.allocations.push(created);
      return created;
    });
    return c.json(saved);
  });

  app.get('/api/capacity', (c) => {
    const query = parseSchema(capacityQuerySchema, {
      employeeId: c.req.query('employeeId'),
      month: c.req.query('month'),
    });
    const summaries = summarizeEmployeeCapacity(store.snapshot().allocations.map(toDomainAllocation));
    const filtered = summaries.filter((summary) => {
      if (query.employeeId && summary.employeeId !== query.employeeId) {
        return false;
      }
      if (query.month && summary.month !== query.month) {
        return false;
      }
      return true;
    });
    const body: CapacitySummary[] = filtered.map((summary) => ({
      employeeId: summary.employeeId,
      month: summary.month,
      totalPersonMonths: summary.personMonths,
      overCapacity: summary.oversubscribed,
      causeAllocationId: summary.cause?.allocationId ?? null,
    }));
    return c.json(body);
  });
}

function requireProject(store: WorkingStore, projectId: string): void {
  if (!store.projects.some((project) => project.id === projectId)) {
    throw notFound(`Project ${projectId} was not found`);
  }
}

function allocationRefs(store: WorkingStore): Array<{ breakdownItemId: string }> {
  return store.allocations.map((allocation) => ({ breakdownItemId: allocation.breakdownItemId }));
}

function toDomainAllocation(allocation: Allocation): DomainAllocation {
  return {
    id: allocation.id,
    breakdownItemId: allocation.breakdownItemId,
    employeeId: allocation.employeeId,
    month: allocation.month,
    personMonths: allocation.amount,
    updatedAt: allocation.updatedAt,
  };
}

function mapAddChildError(error: WbsAddChildError): Error {
  switch (error.code) {
    case 'invalid-tree':
      return mapTreeError(error.tree);
    case 'parent-not-found':
      return conflict('parent-not-found', `Parent ${error.parentId} was not found`);
    case 'allocated-leaf':
      return conflict('allocated-leaf', `Cannot add a child under allocated item ${error.parentId}`);
    case 'depth-exceeded':
      return conflict(
        'depth-exceeded',
        `Adding a child under ${error.parentId} would reach depth ${error.resultingDepth}`,
      );
    default:
      return assertNever(error);
  }
}

function mapMoveError(error: WbsMoveError): Error {
  switch (error.code) {
    case 'invalid-tree':
      return mapTreeError(error.tree);
    case 'not-found':
      return notFound(`WBS item ${error.itemId} was not found`);
    case 'parent-not-found':
      return conflict('parent-not-found', `Parent ${error.parentId} was not found`);
    case 'cross-project':
      return conflict('cross-project', `Parent ${error.parentId} belongs to another project`);
    case 'under-self':
      return conflict('under-self', `WBS item ${error.itemId} cannot be its own parent`);
    case 'cycle':
      return conflict('cycle', `Moving ${error.itemId} under ${error.parentId} would create a cycle`);
    case 'depth-exceeded':
      return conflict(
        'depth-exceeded',
        `Moving this WBS item would place ${error.itemId} at depth ${error.resultingDepth}`,
      );
    case 'allocated-leaf':
      return conflict('allocated-leaf', `Cannot move an item under allocated item ${error.parentId}`);
    default:
      return assertNever(error);
  }
}

function mapDeleteError(error: WbsDeleteError): Error {
  switch (error.code) {
    case 'invalid-tree':
      return mapTreeError(error.tree);
    case 'not-found':
      return notFound(`WBS item ${error.itemId} was not found`);
    case 'has-children':
      return conflict('has-children', `WBS item ${error.itemId} still has children`);
    case 'has-allocations':
      return conflict('has-allocations', `WBS item ${error.itemId} still has allocations`);
    default:
      return assertNever(error);
  }
}

function mapLeafError(error: WbsLeafError): Error {
  switch (error.code) {
    case 'invalid-tree':
      return mapTreeError(error.tree);
    case 'not-found':
      return notFound(`Breakdown item ${error.itemId} was not found`);
    case 'not-a-leaf':
      return conflict('not-a-leaf', `Breakdown item ${error.itemId} is not a leaf`);
    default:
      return assertNever(error);
  }
}

function mapTreeError(error: WbsTreeError): Error {
  switch (error.code) {
    case 'duplicate-id':
      return conflict('duplicate-id', `WBS item ${error.itemId} already exists`);
    case 'missing-parent':
      return conflict('missing-parent', `Parent ${error.parentId} was not found`);
    case 'cross-project-parent':
      return conflict('cross-project-parent', `Parent ${error.parentId} belongs to another project`);
    case 'cycle':
      return conflict('cycle', `WBS item ${error.itemId} is part of a cycle`);
    case 'depth-exceeded':
      return conflict('depth-exceeded', `WBS item ${error.itemId} exceeds the maximum depth`);
    default:
      return assertNever(error);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled domain error: ${JSON.stringify(value)}`);
}
