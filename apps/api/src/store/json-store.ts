import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { access, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { PlanningStore, WorkingStore } from './model';
import { normalizeSeed, parseWorkingStore } from './seed';

export interface JsonStoreOptions {
  dataFile: string;
  seedFile?: string;
}

const seedCandidates = [
  'fixtures/baseline-seed.json',
  '../../fixtures/baseline-seed.json',
  '../../../fixtures/baseline-seed.json',
];

export function resolveSeedFile(explicit?: string): string {
  if (explicit) {
    return resolve(explicit);
  }
  for (const candidate of seedCandidates) {
    const path = resolve(process.cwd(), candidate);
    if (existsSync(path)) {
      return path;
    }
  }
  throw new Error('Immutable seed fixture not found. Set SEED_FILE.');
}

export class JsonStore implements PlanningStore {
  private pending: Promise<void> = Promise.resolve();

  private constructor(
    private readonly dataFile: string,
    private state: WorkingStore,
  ) {}

  static async open(options: JsonStoreOptions): Promise<JsonStore> {
    const dataFile = resolve(options.dataFile);
    const seedFile = resolveSeedFile(options.seedFile);
    if (samePath(dataFile, seedFile)) {
      throw new Error('DATA_FILE must not point at the immutable seed fixture');
    }
    await mkdir(dirname(dataFile), { recursive: true });
    if (await fileExists(dataFile)) {
      const parsed = parseJson(await readFile(dataFile, 'utf8'), dataFile);
      return new JsonStore(dataFile, parseWorkingStore(parsed));
    }
    const parsed = parseJson(await readFile(seedFile, 'utf8'), seedFile);
    const seeded = normalizeSeed(parsed);
    await writeAtomically(dataFile, seeded);
    return new JsonStore(dataFile, seeded);
  }

  snapshot(): WorkingStore {
    return structuredClone(this.state);
  }

  /**
   * Mutations run one at a time. The working file is replaced only after the
   * temporary file is fully written, and callers observe the new state only
   * after that replacement finishes.
   */
  transact<T>(mutator: (draft: WorkingStore) => T): Promise<T> {
    return this.enqueue(async () => {
      const draft = structuredClone(this.state);
      const result = mutator(draft);
      await writeAtomically(this.dataFile, draft);
      this.state = draft;
      if (result === undefined) {
        return result;
      }
      return structuredClone(result);
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation, operation);
    this.pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

async function writeAtomically(dataFile: string, state: WorkingStore): Promise<void> {
  await mkdir(dirname(dataFile), { recursive: true });
  const temporaryFile = join(dirname(dataFile), `.${basename(dataFile)}.${randomUUID()}.tmp`);
  const contents = `${JSON.stringify(state, null, 2)}\n`;
  const handle = await open(temporaryFile, 'w');
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(temporaryFile).catch(() => undefined);
    throw error;
  }
  await handle.close();
  try {
    await replaceFile(temporaryFile, dataFile);
  } catch (error) {
    await unlink(temporaryFile).catch(() => undefined);
    throw error;
  }
}

async function replaceFile(temporaryFile: string, destination: string): Promise<void> {
  const attempts = process.platform === 'win32' ? 5 : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rename(temporaryFile, destination);
      return;
    } catch (error) {
      lastError = error;
      if (!isWindowsReplaceError(error)) {
        throw error;
      }
      await unlink(destination).catch(() => undefined);
      await delay(25 * (attempt + 1));
    }
  }
  throw lastError;
}

function isWindowsReplaceError(error: unknown): boolean {
  return (
    process.platform === 'win32' &&
    isNodeError(error) &&
    (error.code === 'EPERM' || error.code === 'EEXIST' || error.code === 'EBUSY')
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function samePath(left: string, right: string): boolean {
  const resolvedLeft = resolve(left);
  const resolvedRight = resolve(right);
  if (process.platform === 'win32') {
    return resolvedLeft.toLowerCase() === resolvedRight.toLowerCase();
  }
  return resolvedLeft === resolvedRight;
}
