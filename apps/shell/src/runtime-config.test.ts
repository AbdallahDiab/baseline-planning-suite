import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRuntimeConfig } from './runtime-config';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const validConfig = {
  peopleRemoteUrl: '/people/mf-manifest.json',
  deliveryRemoteUrl: '/delivery/mf-manifest.json',
};

describe('loadRuntimeConfig', () => {
  it('rejects an HTTP failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({}, 500)),
    );

    await expect(loadRuntimeConfig()).rejects.toThrow('Runtime configuration request failed (500)');
  });

  it('propagates a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await expect(loadRuntimeConfig()).rejects.toThrow('network down');
  });

  it.each([null, 'config', []])('rejects a non-object body %#', async (body) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(body)),
    );

    await expect(loadRuntimeConfig()).rejects.toThrow('Runtime configuration is not an object');
  });

  it('rejects a missing people remote URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ deliveryRemoteUrl: validConfig.deliveryRemoteUrl })),
    );

    await expect(loadRuntimeConfig()).rejects.toThrow('Runtime configuration is missing peopleRemoteUrl');
  });

  it('rejects a missing delivery remote URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ peopleRemoteUrl: validConfig.peopleRemoteUrl })),
    );

    await expect(loadRuntimeConfig()).rejects.toThrow('Runtime configuration is missing deliveryRemoteUrl');
  });

  it('rejects an empty remote URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          peopleRemoteUrl: '',
          deliveryRemoteUrl: validConfig.deliveryRemoteUrl,
        }),
      ),
    );

    await expect(loadRuntimeConfig()).rejects.toThrow('Runtime configuration is missing peopleRemoteUrl');
  });

  it('returns both remote URLs from a valid config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(validConfig)),
    );

    await expect(loadRuntimeConfig()).resolves.toEqual(validConfig);
  });
});
