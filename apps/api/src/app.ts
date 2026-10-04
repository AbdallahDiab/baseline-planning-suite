import type { ApiErrorBody } from '@baseline/contracts';
import { Hono } from 'hono';
import { ApiError, apiErrorBody } from './errors';
import { registerDeliveryRoutes } from './routes/delivery';
import { registerPeopleRoutes } from './routes/people';
import type { PlanningStore } from './store/model';

export interface AppDependencies {
  store: PlanningStore;
  now?: () => string;
}

export function createApp(dependencies: AppDependencies): Hono {
  const app = new Hono();
  const now = dependencies.now ?? (() => new Date().toISOString());

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json(apiErrorBody(error), error.status);
    }
    console.error(error);
    const body: ApiErrorBody = {
      error: {
        code: 'internal_error',
        message: 'Internal server error',
      },
    };
    return c.json(body, 500);
  });

  app.notFound((c) => {
    const body: ApiErrorBody = {
      error: {
        code: 'not_found',
        message: 'Not found',
      },
    };
    return c.json(body, 404);
  });

  app.get('/api/health', (c) => {
    return c.json({ status: 'ok' });
  });

  registerPeopleRoutes(app, dependencies.store);
  registerDeliveryRoutes(app, dependencies.store, now);
  return app;
}
