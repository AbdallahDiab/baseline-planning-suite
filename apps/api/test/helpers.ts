import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { createApp } from '../src/app';
import { JsonStore, resolveSeedFile } from '../src/store/json-store';

export interface TestApp {
  app: Hono;
  store: JsonStore;
  dataFile: string;
  seedFile: string;
  dir: string;
  reload: () => Promise<{ app: Hono; store: JsonStore }>;
}

export async function withApp(
  run: (ctx: TestApp) => Promise<void>,
  options?: { now?: () => string },
): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'baseline-api-'));
  const dataFile = join(dir, 'baseline-store.json');
  const seedFile = resolveSeedFile();
  const store = await JsonStore.open({ dataFile, seedFile });
  const app = createApp({ store, now: options?.now });
  try {
    await run({
      app,
      store,
      dataFile,
      seedFile,
      dir,
      async reload() {
        const reloaded = await JsonStore.open({ dataFile, seedFile });
        return {
          store: reloaded,
          app: createApp({ store: reloaded, now: options?.now }),
        };
      },
    });
    const leftovers = await readdir(dir);
    const temporary = leftovers.filter((name) => name.endsWith('.tmp'));
    if (temporary.length > 0) {
      throw new Error(`Temporary store files were left behind: ${temporary.join(', ')}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function send(
  app: Hono,
  path: string,
  init?: { method?: string; json?: unknown },
): Promise<Response> {
  if (init?.json === undefined) {
    return app.request(path, { method: init?.method });
  }
  return app.request(path, {
    method: init.method ?? 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(init.json),
  });
}

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export function sequentialClock(prefix = '2026-10-04T09:00:'): () => string {
  let tick = 0;
  return () => {
    tick += 1;
    return `${prefix}${String(tick).padStart(2, '0')}.000Z`;
  };
}
