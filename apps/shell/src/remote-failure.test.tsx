import type { ComponentType } from 'react';
import type { RemoteAppProps } from '@baseline/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShellApp } from './ShellApp';

const loadHostedRemote = vi.hoisted(() =>
  vi.fn<(remoteName: string, entry: string) => Promise<ComponentType<RemoteAppProps>>>(),
);

vi.mock('./load-remote', () => ({
  loadHostedRemote,
}));

afterEach(() => {
  cleanup();
  loadHostedRemote.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubConfig(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      jsonResponse({
        peopleRemoteUrl: '/people/mf-manifest.json',
        deliveryRemoteUrl: '/delivery/mf-manifest.json',
      }),
    ),
  );
}

function readyProbe(label: string): ComponentType<RemoteAppProps> {
  return function ReadyProbe() {
    return <p>{label}</p>;
  };
}

function boomProbe(): ComponentType<RemoteAppProps> {
  return function BoomProbe() {
    throw new Error('boom');
  };
}

async function renderShell(): Promise<void> {
  stubConfig();
  render(<ShellApp />);
  expect(await screen.findByRole('heading', { name: 'Baseline Planning Suite' })).toBeTruthy();
}

describe('remote failure isolation', () => {
  it('keeps Delivery usable when People fails to load', async () => {
    loadHostedRemote.mockImplementation(async (remoteName) => {
      if (remoteName === 'people') {
        throw new Error('network down');
      }
      return readyProbe('Delivery ready');
    });

    await renderShell();

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'People is unavailable. network down',
    );
    expect(screen.getByText('Delivery ready')).toBeTruthy();
    expect(screen.queryByText('People ready')).toBeNull();
  });

  it('keeps People usable when Delivery fails to load', async () => {
    loadHostedRemote.mockImplementation(async (remoteName) => {
      if (remoteName === 'delivery') {
        throw new Error('network down');
      }
      return readyProbe('People ready');
    });

    await renderShell();

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Delivery is unavailable. network down',
    );
    expect(screen.getByText('People ready')).toBeTruthy();
    expect(screen.queryByText('Delivery ready')).toBeNull();
  });

  it('catches a People render exception without affecting Delivery', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    loadHostedRemote.mockImplementation(async (remoteName) => {
      if (remoteName === 'people') {
        return boomProbe();
      }
      return readyProbe('Delivery ready');
    });

    await renderShell();

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'People failed while rendering. boom',
    );
    expect(screen.getByText('Delivery ready')).toBeTruthy();
  });

  it('catches a Delivery render exception without affecting People', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    loadHostedRemote.mockImplementation(async (remoteName) => {
      if (remoteName === 'delivery') {
        return boomProbe();
      }
      return readyProbe('People ready');
    });

    await renderShell();

    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Delivery failed while rendering. boom',
    );
    expect(screen.getByText('People ready')).toBeTruthy();
  });
});
