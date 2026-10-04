import type { Allocation, BreakdownItem, Project, RemoteAppProps } from '@baseline/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeliveryApp from './App';

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

const ledger: Project = {
  id: 'prj-1',
  name: 'Ledger Consolidation',
  startDate: '2026-03-01',
  endDate: '2027-02-28',
};

const reporting: Project = {
  id: 'prj-2',
  name: 'Reporting Platform',
  startDate: '2026-04-01',
  endDate: '2027-03-31',
};

const ledgerWbs: BreakdownItem[] = [
  { id: 'wbs-root', projectId: 'prj-1', parentId: null, name: 'Ledger migration' },
  { id: 'wbs-other', projectId: 'prj-1', parentId: null, name: 'Reporting cut-over' },
  { id: 'wbs-child', projectId: 'prj-1', parentId: 'wbs-root', name: 'Discovery' },
  { id: 'wbs-allocated', projectId: 'prj-1', parentId: 'wbs-root', name: 'Pilot' },
  { id: 'wbs-leaf', projectId: 'prj-1', parentId: 'wbs-child', name: 'Design' },
];

const reportingWbs: BreakdownItem[] = [
  { id: 'wbs-r1', projectId: 'prj-2', parentId: null, name: 'Platform foundation' },
];

const ledgerAllocations: Allocation[] = [
  {
    id: 'alloc-1',
    breakdownItemId: 'wbs-allocated',
    employeeId: 'emp-001',
    month: '2026-05',
    amount: 0.5,
    updatedAt: null,
  },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installFetch(options?: {
  projects?: Project[];
  failProjectsOnce?: boolean;
  onCreate?: (url: string, body: unknown) => Response;
  onPatch?: (url: string, body: unknown) => Response;
  onDelete?: (url: string) => Response;
}) {
  const calls: FetchCall[] = [];
  let projectAttempts = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      calls.push({ url, method, body });

      if (method === 'GET' && url === '/api/projects') {
        projectAttempts += 1;
        if (options?.failProjectsOnce && projectAttempts === 1) {
          return jsonResponse({ error: { code: 'unavailable', message: 'Projects are unavailable' } }, 500);
        }
        return jsonResponse(options?.projects ?? [ledger, reporting]);
      }

      const wbsMatch = /^\/api\/projects\/([^/]+)\/wbs$/.exec(url);
      if (wbsMatch) {
        const projectId = decodeURIComponent(wbsMatch[1] ?? '');
        if (method === 'GET') {
          return jsonResponse(projectId === reporting.id ? reportingWbs : ledgerWbs);
        }
        if (method === 'POST') {
          if (options?.onCreate) {
            return options.onCreate(url, body);
          }
          const posted = body as { parentId: string | null; name: string };
          return jsonResponse({ id: 'wbs-new', projectId, parentId: posted.parentId, name: posted.name }, 201);
        }
      }

      const allocationMatch = /^\/api\/projects\/([^/]+)\/allocations$/.exec(url);
      if (method === 'GET' && allocationMatch) {
        const projectId = decodeURIComponent(allocationMatch[1] ?? '');
        return jsonResponse(projectId === reporting.id ? [] : ledgerAllocations);
      }

      if (method === 'PATCH' && url.startsWith('/api/wbs/')) {
        if (options?.onPatch) {
          return options.onPatch(url, body);
        }
        const itemId = decodeURIComponent(url.split('/').at(-1) ?? '');
        const current = ledgerWbs.find((item) => item.id === itemId);
        const patch = body as { name?: string; parentId?: string | null };
        return jsonResponse({
          id: itemId,
          projectId: current?.projectId ?? ledger.id,
          parentId: Object.prototype.hasOwnProperty.call(patch, 'parentId') ? patch.parentId : (current?.parentId ?? null),
          name: patch.name ?? current?.name ?? '',
        });
      }

      if (method === 'DELETE' && url.startsWith('/api/wbs/')) {
        return options?.onDelete?.(url) ?? new Response(null, { status: 204 });
      }

      return jsonResponse({ error: { code: 'not_found', message: 'Not found' } }, 404);
    }),
  );
  return calls;
}

function itemNamed(name: string): HTMLElement {
  const label = screen.getByText(name, { selector: '.wbs-name' });
  const item = label.closest('li');
  if (!(item instanceof HTMLElement)) {
    throw new Error(`Missing WBS item ${name}`);
  }
  return item;
}

async function renderWorkspace(props?: Partial<RemoteAppProps>) {
  const calls = installFetch();
  render(props ? <DeliveryApp {...props} /> : <DeliveryApp />);
  await screen.findByRole('list', { name: 'Work breakdown structure' });
  return calls;
}

describe('Delivery WBS workspace', () => {
  it('loads projects and selects the first project', async () => {
    const calls = await renderWorkspace({
      displayCurrency: 'EUR',
      activeUser: { id: 'shell-operator', name: 'Baseline Operator' },
    });

    expect(screen.getByText('Baseline Operator')).toBeTruthy();
    expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe(ledger.id);
    expect(screen.getByText('Name').nextElementSibling?.textContent).toBe('Ledger Consolidation');
    expect(screen.getByText('Start date').nextElementSibling?.textContent).toBe('2026-03-01');
    expect(screen.getByText('End date').nextElementSibling?.textContent).toBe('2027-02-28');
    expect(calls.some((call) => call.method === 'GET' && call.url === '/api/projects')).toBe(true);
    expect(calls.some((call) => call.method === 'GET' && call.url === '/api/projects/prj-1/wbs')).toBe(true);
    expect(calls.some((call) => call.method === 'GET' && call.url === '/api/projects/prj-1/allocations')).toBe(true);
  });

  it('renders the selected project work breakdown as a hierarchy', async () => {
    await renderWorkspace();

    const migration = itemNamed('Ledger migration');
    const discovery = itemNamed('Discovery');
    const design = itemNamed('Design');
    const pilot = itemNamed('Pilot');
    const cutover = itemNamed('Reporting cut-over');
    const tree = screen.getByRole('list', { name: 'Work breakdown structure' });
    const rootNames = Array.from(tree.children).map((node) => node.querySelector('.wbs-name')?.textContent);

    expect(rootNames).toEqual(['Ledger migration', 'Reporting cut-over']);
    expect(migration.contains(discovery)).toBe(true);
    expect(discovery.contains(design)).toBe(true);
    expect(migration.contains(pilot)).toBe(true);
    expect(discovery.contains(pilot)).toBe(false);
    expect(cutover.contains(discovery)).toBe(false);
    expect(migration.querySelector('.wbs-row')?.textContent).toContain('Parent');
    expect(migration.querySelector('.wbs-row')?.textContent).toContain('Depth 0');
    expect(discovery.querySelector('.wbs-row')?.textContent).toContain('Depth 1');
    expect(design.querySelector('.wbs-row')?.textContent).toContain('Leaf');
    expect(design.querySelector('.wbs-row')?.textContent).toContain('Depth 2');
    expect(pilot.querySelector('.wbs-row')?.textContent).toContain('Has direct allocations');
    expect(design.querySelector('.wbs-row')?.textContent).not.toContain('Has direct allocations');
    expect(screen.queryByText('0.5')).toBeNull();
    expect(within(screen.getByRole('group', { name: 'Actions for Pilot' })).queryByRole('button', { name: 'Add child' })).toBeNull();
    expect(within(screen.getByRole('group', { name: 'Actions for Design' })).queryByRole('button', { name: 'Add child' })).toBeNull();
    expect(within(screen.getByRole('group', { name: 'Actions for Discovery' })).getByRole('button', { name: 'Add child' })).toBeTruthy();
  });

  it('requests WBS and allocations for the project that is selected', async () => {
    const user = userEvent.setup();
    const calls = await renderWorkspace();

    await user.selectOptions(screen.getByLabelText('Project'), reporting.id);

    expect(screen.getByText('Name').nextElementSibling?.textContent).toBe('Reporting Platform');
    expect(screen.getByText('Start date').nextElementSibling?.textContent).toBe('2026-04-01');
    expect(screen.getByText('End date').nextElementSibling?.textContent).toBe('2027-03-31');
    expect(await screen.findByText('Platform foundation')).toBeTruthy();
    expect(screen.queryByText('Ledger migration')).toBeNull();
    expect(calls.some((call) => call.method === 'GET' && call.url === '/api/projects/prj-2/wbs')).toBe(true);
    expect(calls.some((call) => call.method === 'GET' && call.url === '/api/projects/prj-2/allocations')).toBe(true);
  });

  it('creates a root item with a null parent', async () => {
    const user = userEvent.setup();
    const calls = await renderWorkspace();
    const allocationReads = () => calls.filter((call) => call.url === '/api/projects/prj-1/allocations').length;
    const allocationsBefore = allocationReads();

    await user.click(screen.getByRole('button', { name: 'Add root item' }));
    await user.type(screen.getByLabelText('Name'), 'Closeout');
    await user.click(screen.getByRole('button', { name: 'Add root item' }));

    await waitFor(() => {
      expect(calls.find((call) => call.method === 'POST')).toEqual({
        url: '/api/projects/prj-1/wbs',
        method: 'POST',
        body: { parentId: null, name: 'Closeout' },
      });
    });
    await waitFor(() => {
      expect(calls.filter((call) => call.method === 'GET' && call.url === '/api/projects/prj-1/wbs').length).toBeGreaterThan(1);
    });
    expect(allocationReads()).toBe(allocationsBefore);
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  it('creates a child under the chosen parent', async () => {
    const user = userEvent.setup();
    const calls = await renderWorkspace();
    const actions = screen.getByRole('group', { name: 'Actions for Discovery' });

    await user.click(within(actions).getByRole('button', { name: 'Add child' }));
    await user.type(within(actions).getByLabelText('Name'), 'Workshop');
    await user.click(within(actions).getByRole('button', { name: 'Add child' }));

    await waitFor(() => {
      expect(calls.find((call) => call.method === 'POST')).toEqual({
        url: '/api/projects/prj-1/wbs',
        method: 'POST',
        body: { parentId: 'wbs-child', name: 'Workshop' },
      });
    });
  });

  it('renames an item with a name-only patch', async () => {
    const user = userEvent.setup();
    const calls = await renderWorkspace();

    await user.click(within(screen.getByRole('group', { name: 'Actions for Design' })).getByRole('button', { name: 'Rename' }));
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Detailed design');
    await user.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => {
      const patch = calls.find((call) => call.method === 'PATCH');
      expect(patch).toEqual({
        url: '/api/wbs/wbs-leaf',
        method: 'PATCH',
        body: { name: 'Detailed design' },
      });
    });
  });

  it('moves an item with a parent-only patch', async () => {
    const user = userEvent.setup();
    const calls = await renderWorkspace();
    const actions = screen.getByRole('group', { name: 'Actions for Design' });

    await user.click(within(actions).getByRole('button', { name: 'Move' }));
    await user.selectOptions(within(actions).getByLabelText('Destination'), 'wbs-other');
    await user.click(screen.getByRole('button', { name: 'Move item' }));

    await waitFor(() => {
      expect(calls.find((call) => call.method === 'PATCH')).toEqual({
        url: '/api/wbs/wbs-leaf',
        method: 'PATCH',
        body: { parentId: 'wbs-other' },
      });
    });
  });

  it('moves an item to root with a null parent', async () => {
    const user = userEvent.setup();
    const calls = await renderWorkspace();
    const actions = screen.getByRole('group', { name: 'Actions for Discovery' });

    await user.click(within(actions).getByRole('button', { name: 'Move' }));
    await user.selectOptions(within(actions).getByLabelText('Destination'), 'Root');
    await user.click(screen.getByRole('button', { name: 'Move item' }));

    await waitFor(() => {
      expect(calls.find((call) => call.method === 'PATCH')).toEqual({
        url: '/api/wbs/wbs-child',
        method: 'PATCH',
        body: { parentId: null },
      });
    });
  });

  it('explains when an item has no valid move destination', async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    const actions = screen.getByRole('group', { name: 'Actions for Ledger migration' });

    await user.click(within(actions).getByRole('button', { name: 'Move' }));

    expect(within(actions).getByRole('alert').textContent).toContain('No valid destination');
    expect(within(actions).queryByLabelText('Destination')).toBeNull();
  });

  it('does not offer an allocated leaf as a move destination', async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    const actions = screen.getByRole('group', { name: 'Actions for Design' });

    await user.click(within(actions).getByRole('button', { name: 'Move' }));
    const select = within(actions).getByLabelText('Destination') as HTMLSelectElement;
    const labels = Array.from(select.options).map((option) => option.text);

    expect(labels.some((label) => label.includes('Pilot'))).toBe(false);
    expect(labels).toContain('Root');
    expect(labels).toContain('Reporting cut-over');
    expect(within(screen.getByRole('group', { name: 'Actions for Pilot' })).queryByRole('button', { name: 'Add child' })).toBeNull();
  });

  it('deletes an item only after confirmation', async () => {
    const user = userEvent.setup();
    const calls = await renderWorkspace();
    const actions = screen.getByRole('group', { name: 'Actions for Design' });

    await user.click(within(actions).getByRole('button', { name: 'Delete' }));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    expect(within(actions).getByRole('button', { name: 'Confirm' })).toBeTruthy();

    await user.click(within(actions).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'DELETE' && call.url === '/api/wbs/wbs-leaf')).toBe(true);
    });
  });

  it('explains when an item with children cannot be deleted', async () => {
    const user = userEvent.setup();
    const calls = await renderWorkspace();
    const actions = screen.getByRole('group', { name: 'Actions for Ledger migration' });

    await user.click(within(actions).getByRole('button', { name: 'Delete' }));

    expect(within(actions).getByRole('alert').textContent).toContain('children');
    expect(within(actions).queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('explains when an item with allocations cannot be deleted', async () => {
    const user = userEvent.setup();
    const calls = await renderWorkspace();
    const actions = screen.getByRole('group', { name: 'Actions for Pilot' });

    await user.click(within(actions).getByRole('button', { name: 'Delete' }));

    expect(within(actions).getByRole('alert').textContent).toContain('allocations');
    expect(within(actions).queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('shows a mutation conflict and keeps the entered name', async () => {
    const user = userEvent.setup();
    installFetch({
      onCreate: () =>
        jsonResponse(
          {
            error: {
              code: 'depth-exceeded',
              message: 'Adding a child under wbs-child would reach depth 3',
            },
          },
          409,
        ),
    });
    render(<DeliveryApp />);
    await screen.findByRole('list', { name: 'Work breakdown structure' });

    const actions = screen.getByRole('group', { name: 'Actions for Discovery' });
    await user.click(within(actions).getByRole('button', { name: 'Add child' }));
    await user.type(within(actions).getByLabelText('Name'), 'Too deep');
    await user.click(within(actions).getByRole('button', { name: 'Add child' }));

    expect(await within(actions).findByRole('alert')).toHaveProperty(
      'textContent',
      'Adding a child under wbs-child would reach depth 3',
    );
    expect((within(actions).getByLabelText('Name') as HTMLInputElement).value).toBe('Too deep');
  });

  it('renders standalone without hosted runtime props', async () => {
    await renderWorkspace();

    expect(screen.getByText('Running standalone.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Delivery' })).toBeTruthy();
    expect(screen.queryByText('Baseline Operator')).toBeNull();
    expect(screen.getByLabelText('Project')).toBeTruthy();
  });

  it('shows a project load error and can retry', async () => {
    const user = userEvent.setup();
    installFetch({ failProjectsOnce: true });
    render(<DeliveryApp />);

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Projects are unavailable');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('option', { name: 'Ledger Consolidation' })).toBeTruthy();
    expect((screen.getByLabelText('Project') as HTMLSelectElement).value).toBe(ledger.id);
  });

  it('shows an empty project list', async () => {
    installFetch({ projects: [] });
    render(<DeliveryApp />);

    expect(await screen.findByText('No projects are available.')).toBeTruthy();
    expect(screen.queryByLabelText('Project')).toBeNull();
  });
});
