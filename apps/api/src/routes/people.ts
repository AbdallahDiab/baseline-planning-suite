import type { Hono } from 'hono';
import type { RateRecord } from '@baseline/contracts';
import { notFound } from '../errors';
import { createId } from '../ids';
import {
  createRateSchema,
  employeeQuerySchema,
  parseSchema,
  patchRateSchema,
  rateQuerySchema,
  readJsonBody,
} from '../schema';
import type { PlanningStore } from '../store/model';

/**
 * People-owned register and rate history.
 * Delivery planning rules stay out of this module.
 */
export function registerPeopleRoutes(app: Hono, store: PlanningStore): void {
  app.get('/api/employees', (c) => {
    const query = parseSchema(employeeQuerySchema, { search: c.req.query('search') });
    const search = query.search?.trim().toLowerCase() ?? '';
    const employees = store.snapshot().employees.filter((employee) => {
      if (search.length === 0) {
        return true;
      }
      return (
        employee.name.toLowerCase().includes(search) || employee.role.toLowerCase().includes(search)
      );
    });
    return c.json(employees);
  });

  app.get('/api/employees/:employeeId', (c) => {
    const employeeId = c.req.param('employeeId');
    const employee = store.snapshot().employees.find((entry) => entry.id === employeeId);
    if (!employee) {
      throw notFound(`Employee ${employeeId} was not found`);
    }
    return c.json(employee);
  });

  app.get('/api/rates', (c) => {
    const query = parseSchema(rateQuerySchema, { employeeId: c.req.query('employeeId') });
    const rates = store.snapshot().rateRecords.filter((rate) => {
      if (!query.employeeId) {
        return true;
      }
      return rate.employeeId === query.employeeId;
    });
    return c.json(rates);
  });

  app.post('/api/rates', async (c) => {
    const body = parseSchema(createRateSchema, await readJsonBody(c.req));
    const created = await store.transact((draft) => {
      const employee = draft.employees.find((entry) => entry.id === body.employeeId);
      if (!employee) {
        throw notFound(`Employee ${body.employeeId} was not found`);
      }
      const rate: RateRecord = {
        id: createId('rate'),
        employeeId: employee.id,
        validFrom: body.validFrom,
        hourlyCost: body.hourlyCost,
      };
      draft.rateRecords.push(rate);
      return rate;
    });
    return c.json(created, 201);
  });

  app.patch('/api/rates/:rateId', async (c) => {
    const rateId = c.req.param('rateId');
    const body = parseSchema(patchRateSchema, await readJsonBody(c.req));
    const updated = await store.transact((draft) => {
      const rate = draft.rateRecords.find((entry) => entry.id === rateId);
      if (!rate) {
        throw notFound(`Rate ${rateId} was not found`);
      }
      if (body.validFrom !== undefined) {
        rate.validFrom = body.validFrom;
      }
      if (body.hourlyCost !== undefined) {
        rate.hourlyCost = body.hourlyCost;
      }
      return rate;
    });
    return c.json(updated);
  });

  app.delete('/api/rates/:rateId', async (c) => {
    const rateId = c.req.param('rateId');
    await store.transact((draft) => {
      const index = draft.rateRecords.findIndex((entry) => entry.id === rateId);
      if (index < 0) {
        throw notFound(`Rate ${rateId} was not found`);
      }
      draft.rateRecords.splice(index, 1);
      return null;
    });
    return c.body(null, 204);
  });
}
