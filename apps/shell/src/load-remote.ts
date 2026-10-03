import { loadRemote, registerRemotes } from '@module-federation/enhanced/runtime';
import type { ComponentType } from 'react';
import type { RemoteAppProps } from '@baseline/contracts';

const registeredEntries = new Map<string, string>();

function isComponentType(value: unknown): value is ComponentType<RemoteAppProps> {
  return typeof value === 'function';
}

function resolveComponent(loaded: unknown): ComponentType<RemoteAppProps> | null {
  if (isComponentType(loaded)) {
    return loaded;
  }
  if (typeof loaded === 'object' && loaded !== null && 'default' in loaded) {
    const candidate: unknown = loaded.default;
    if (isComponentType(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function loadHostedRemote(
  remoteName: string,
  entry: string,
): Promise<ComponentType<RemoteAppProps>> {
  const previousEntry = registeredEntries.get(remoteName);
  if (previousEntry !== entry) {
    registerRemotes([{ name: remoteName, entry }], {
      force: previousEntry !== undefined,
    });
    registeredEntries.set(remoteName, entry);
  }

  let loaded: unknown;
  try {
    loaded = await loadRemote(`${remoteName}/App`);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'unknown error';
    throw new Error(`Failed to load ${remoteName} from ${entry}: ${detail}`);
  }

  const component = resolveComponent(loaded);
  if (!component) {
    throw new Error(`Remote ${remoteName} did not expose ./App`);
  }
  return component;
}
