import type { RemoteAppProps } from '@baseline/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShellApp } from './ShellApp';

const received = vi.hoisted(() => ({
  buses: [] as RemoteAppProps['planningEvents'][],
}));

vi.mock('./load-remote', () => ({
  loadHostedRemote: vi.fn(async () => {
    return function Probe(props: RemoteAppProps) {
      received.buses.push(props.planningEvents);
      return <span>ready</span>;
    };
  }),
}));

afterEach(() => {
  cleanup();
  received.buses.length = 0;
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('shell planning bus ownership', () => {
  it('passes one stable bus instance to both remotes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          jsonResponse({
            peopleRemoteUrl: '/people/mf-manifest.json',
            deliveryRemoteUrl: '/delivery/mf-manifest.json',
          }),
      ),
    );

    const view = render(<ShellApp />);
    expect(await screen.findAllByText('ready')).toHaveLength(2);
    expect(received.buses).toHaveLength(2);
    expect(received.buses[0]).toBe(received.buses[1]);

    const bus = received.buses[0];
    view.rerender(<ShellApp />);
    expect(await screen.findAllByText('ready')).toHaveLength(2);
    expect(received.buses.length).toBeGreaterThanOrEqual(2);
    expect(received.buses.every((entry) => entry === bus)).toBe(true);
  });
});
