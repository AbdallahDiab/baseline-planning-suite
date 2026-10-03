export interface RuntimeConfig {
  peopleRemoteUrl: string;
  deliveryRemoteUrl: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRemoteUrl(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Runtime configuration is missing ${key}`);
  }
  return value;
}

export async function loadRuntimeConfig(signal?: AbortSignal): Promise<RuntimeConfig> {
  const response = await fetch('/config.json', {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    throw new Error(`Runtime configuration request failed (${response.status})`);
  }

  const body: unknown = await response.json();
  if (!isRecord(body)) {
    throw new Error('Runtime configuration is not an object');
  }

  return {
    peopleRemoteUrl: readRemoteUrl(body, 'peopleRemoteUrl'),
    deliveryRemoteUrl: readRemoteUrl(body, 'deliveryRemoteUrl'),
  };
}
