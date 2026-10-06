import type {
  Allocation,
  BreakdownItem,
  CapacitySummary,
  Employee,
  PlanningChangeEvent,
  PlanningEventBus,
  Project,
  RateRecord,
  RemoteAppProps,
} from '@baseline/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
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
  employees?: Employee[];
  rates?: RateRecord[];
  capacity?: CapacitySummary[];
  onCapacity?: () => Response;
  wbs?: BreakdownItem[];
  allocations?: Allocation[];
  failProjectsOnce?: boolean;
  onCreate?: (url: string, body: unknown) => Response;
  onPatch?: (url: string, body: unknown) => Response;
  onDelete?: (url: string) => Response;
  onAllocation?: (body: unknown) => Response | Promise<Response>;
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

      if (method === 'GET' && url === '/api/employees') {
        return jsonResponse(options?.employees ?? []);
      }

      if (method === 'GET' && url === '/api/rates') {
        return jsonResponse(options?.rates ?? []);
      }

      if (method === 'GET' && url === '/api/capacity') {
        if (options?.onCapacity) {
          return options.onCapacity();
        }
        return jsonResponse(options?.capacity ?? []);
      }

      const wbsMatch = /^\/api\/projects\/([^/]+)\/wbs$/.exec(url);
      if (wbsMatch) {
        const projectId = decodeURIComponent(wbsMatch[1] ?? '');
        if (method === 'GET') {
          if (options?.wbs) {
            return jsonResponse(options.wbs);
          }
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
        if (options?.allocations) {
          return jsonResponse(options.allocations);
        }
        const projectId = decodeURIComponent(allocationMatch[1] ?? '');
        return jsonResponse(projectId === reporting.id ? [] : ledgerAllocations);
      }

      if (method === 'PUT' && url === '/api/allocations/cell') {
        if (options?.onAllocation) {
          return options.onAllocation(body);
        }
        const input = body as { breakdownItemId: string; employeeId: string; month: string; amount: number };
        return jsonResponse({
          id: 'alloc-saved',
          breakdownItemId: input.breakdownItemId,
          employeeId: input.employeeId,
          month: input.month,
          amount: input.amount,
          updatedAt: '2026-10-04T00:00:00.000Z',
        });
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

async function openManage(user: UserEvent, itemName: string): Promise<HTMLElement> {
  const toggle = screen.getByRole('button', { name: `Manage ${itemName}` });
  if (toggle.getAttribute('aria-expanded') !== 'true') {
    await user.click(toggle);
  }
  return screen.getByRole('group', { name: `Actions for ${itemName}` });
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
    expect(screen.queryByRole('group', { name: 'Actions for Discovery' })).toBeNull();
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
    const actions = await openManage(user, 'Discovery');

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

    await user.click(within(await openManage(user, 'Design')).getByRole('button', { name: 'Rename' }));
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
    const actions = await openManage(user, 'Design');

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
    const actions = await openManage(user, 'Discovery');

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
    const actions = await openManage(user, 'Ledger migration');

    await user.click(within(actions).getByRole('button', { name: 'Move' }));

    expect(within(actions).getByRole('alert').textContent).toContain('No valid destination');
    expect(within(actions).queryByLabelText('Destination')).toBeNull();
  });

  it('does not offer an allocated leaf as a move destination', async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    const actions = await openManage(user, 'Design');

    await user.click(within(actions).getByRole('button', { name: 'Move' }));
    const select = within(actions).getByLabelText('Destination') as HTMLSelectElement;
    const labels = Array.from(select.options).map((option) => option.text);

    expect(labels.some((label) => label.includes('Pilot'))).toBe(false);
    expect(labels).toContain('Root');
    expect(labels).toContain('Reporting cut-over');
    expect(screen.getByRole('button', { name: 'Manage Pilot' })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('group', { name: 'Actions for Pilot' })).toBeNull();
  });

  it('deletes an item only after confirmation', async () => {
    const user = userEvent.setup();
    const calls = await renderWorkspace();
    const actions = await openManage(user, 'Design');

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
    const actions = await openManage(user, 'Ledger migration');

    await user.click(within(actions).getByRole('button', { name: 'Delete' }));

    expect(within(actions).getByRole('alert').textContent).toContain('children');
    expect(within(actions).queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
  });

  it('explains when an item with allocations cannot be deleted', async () => {
    const user = userEvent.setup();
    const calls = await renderWorkspace();
    const actions = await openManage(user, 'Pilot');

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

    const actions = await openManage(user, 'Discovery');
    await user.click(within(actions).getByRole('button', { name: 'Add child' }));
    await user.type(within(actions).getByLabelText('Name'), 'Too deep');
    await user.click(within(actions).getByRole('button', { name: 'Add child' }));

    expect(await within(actions).findByRole('alert')).toHaveProperty(
      'textContent',
      'Adding a child under wbs-child would reach depth 3',
    );
    expect((within(actions).getByLabelText('Name') as HTMLInputElement).value).toBe('Too deep');
  });

  it('collapses parent branches independently without changing staffing selection', async () => {
    const user = userEvent.setup();
    await renderWorkspace();

    expect(screen.getByRole('button', { name: 'Collapse Ledger migration' })).toHaveProperty('ariaExpanded', 'true');
    expect(screen.getByRole('button', { name: 'Collapse Discovery' })).toHaveProperty('ariaExpanded', 'true');
    expect(screen.queryByRole('button', { name: 'Collapse Design' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Expand Design' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Collapse Pilot' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Collapse Reporting cut-over' })).toBeNull();
    expect(planStaffingButton('Design')).toHaveProperty('ariaPressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Collapse Discovery' }));

    expect(screen.queryByText('Design', { selector: '.wbs-name' })).toBeNull();
    expect(screen.getByText('Pilot', { selector: '.wbs-name' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Collapse Ledger migration' })).toHaveProperty('ariaExpanded', 'true');

    await user.click(planStaffingButton('Pilot'));

    expect(planStaffingButton('Pilot')).toHaveProperty('ariaPressed', 'true');
    expect(itemNamed('Pilot').textContent).toContain('Selected for staffing');

    await user.click(screen.getByRole('button', { name: 'Expand Discovery' }));

    expect(screen.getByText('Design', { selector: '.wbs-name' })).toBeTruthy();
    expect(planStaffingButton('Design')).toHaveProperty('ariaPressed', 'false');
    expect(planStaffingButton('Pilot')).toHaveProperty('ariaPressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Collapse Ledger migration' }));

    expect(screen.queryByText('Discovery', { selector: '.wbs-name' })).toBeNull();
    expect(screen.queryByText('Design', { selector: '.wbs-name' })).toBeNull();
    expect(screen.queryByText('Pilot', { selector: '.wbs-name' })).toBeNull();
    expect(screen.getByText('Reporting cut-over', { selector: '.wbs-name' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Expand Ledger migration' }));

    expect(planStaffingButton('Pilot')).toHaveProperty('ariaPressed', 'true');
    expect(screen.getByText('Design', { selector: '.wbs-name' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Collapse Discovery' })).toHaveProperty('ariaExpanded', 'true');
  });

  it('opens Manage and keeps the existing action availability rules', async () => {
    const user = userEvent.setup();
    await renderWorkspace();

    const pilot = await openManage(user, 'Pilot');
    expect(within(pilot).queryByRole('button', { name: 'Add child' })).toBeNull();
    expect(within(pilot).getByRole('button', { name: 'Rename' })).toBeTruthy();
    expect(within(pilot).getByRole('button', { name: 'Move' })).toBeTruthy();
    expect(within(pilot).getByRole('button', { name: 'Delete' })).toBeTruthy();

    const design = await openManage(user, 'Design');
    expect(within(design).queryByRole('button', { name: 'Add child' })).toBeNull();
    expect(within(design).getByRole('button', { name: 'Rename' })).toBeTruthy();
    expect(within(design).getByRole('button', { name: 'Move' })).toBeTruthy();
    expect(within(design).getByRole('button', { name: 'Delete' })).toBeTruthy();

    const discovery = await openManage(user, 'Discovery');
    expect(within(discovery).getByRole('button', { name: 'Add child' })).toBeTruthy();
    expect(within(discovery).getByRole('button', { name: 'Rename' })).toBeTruthy();
    expect(within(discovery).getByRole('button', { name: 'Move' })).toBeTruthy();
    expect(within(discovery).getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Manage Pilot' })).toHaveProperty('ariaExpanded', 'true');
    expect(screen.getByRole('button', { name: 'Manage Design' })).toHaveProperty('ariaExpanded', 'true');
  });

  it('keeps an active management form visible until cancel', async () => {
    const user = userEvent.setup();
    await renderWorkspace();
    const cases = [
      { item: 'Discovery', action: 'Add child', heading: 'Add child to Discovery' },
      { item: 'Design', action: 'Rename', heading: 'Rename Design' },
      { item: 'Design', action: 'Move', heading: 'Move item' },
      { item: 'Design', action: 'Delete', heading: null },
    ];

    for (const entry of cases) {
      const actions = await openManage(user, entry.item);
      await user.click(within(actions).getByRole('button', { name: entry.action }));

      const manage = screen.getByRole('button', { name: `Manage ${entry.item}` });
      expect(manage).toHaveProperty('disabled', true);
      expect(manage).toHaveProperty('ariaExpanded', 'true');
      if (entry.heading) {
        expect(within(actions).getByRole('heading', { name: entry.heading })).toBeTruthy();
      } else {
        expect(within(actions).getByText('Delete Design?')).toBeTruthy();
      }
      expect(screen.getByText(entry.item, { selector: '.wbs-name' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Collapse Ledger migration' })).toHaveProperty('disabled', true);
      expect(screen.getByRole('button', { name: 'Manage Pilot' })).toHaveProperty('disabled', true);
      expect(screen.queryByRole('group', { name: 'Actions for Pilot' })).toBeNull();

      await user.click(within(actions).getByRole('button', { name: 'Cancel' }));

      expect(screen.getByRole('button', { name: `Manage ${entry.item}` })).toHaveProperty('disabled', false);
      expect(screen.getByRole('button', { name: 'Collapse Ledger migration' })).toHaveProperty('disabled', false);
      await user.click(screen.getByRole('button', { name: `Manage ${entry.item}` }));
      expect(screen.queryByRole('group', { name: `Actions for ${entry.item}` })).toBeNull();
    }
  });

  it('expands a parent when Add child starts', async () => {
    const user = userEvent.setup();
    await renderWorkspace();

    await user.click(screen.getByRole('button', { name: 'Collapse Discovery' }));
    expect(screen.queryByText('Design', { selector: '.wbs-name' })).toBeNull();

    const actions = await openManage(user, 'Discovery');
    await user.click(within(actions).getByRole('button', { name: 'Add child' }));

    expect(within(actions).getByRole('heading', { name: 'Add child to Discovery' })).toBeTruthy();
    expect(screen.getByText('Design', { selector: '.wbs-name' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Collapse Discovery' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Collapse Ledger migration' })).toHaveProperty('disabled', true);
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

const ada: Employee = {
  id: 'emp-001',
  name: 'Ada Lovelace',
  role: 'Engineer',
  weeklyHours: 40,
};

const goldenRates: RateRecord[] = [
  { id: 'rate-001', employeeId: ada.id, validFrom: '2025-01-01', hourlyCost: 80 },
  { id: 'rate-002', employeeId: ada.id, validFrom: '2026-03-12', hourlyCost: 95 },
];

function staffingAllocation(amount: number, itemId = 'wbs-leaf', month = '2026-03', employeeId = ada.id): Allocation {
  return {
    id: `alloc-${itemId}-${month}`,
    breakdownItemId: itemId,
    employeeId,
    month,
    amount,
    updatedAt: null,
  };
}

function planStaffingButton(name: string): HTMLElement {
  const row = itemNamed(name).querySelector(':scope > .wbs-row');
  if (!(row instanceof HTMLElement)) {
    throw new Error(`Missing row for ${name}`);
  }
  return within(row).getByRole('button', { name: 'Plan staffing' });
}

function monthCell(employeeName: string, monthLabel: string): HTMLElement {
  const table = screen.getByRole('table', { name: /^Staffing for / });
  const headers = within(table).getAllByRole('columnheader');
  const monthIndex = headers.findIndex((header) => header.textContent === monthLabel);
  const rowHeader = within(table).getByRole('rowheader', { name: new RegExp(employeeName) });
  const row = rowHeader.closest('tr');
  const cell = row?.querySelectorAll('td')[monthIndex - 1];
  if (!(cell instanceof HTMLElement)) {
    throw new Error(`Missing ${monthLabel} cell for ${employeeName}`);
  }
  return cell;
}

function amountText(cell: ParentNode): string {
  return cell.querySelector('.staff-amount')?.textContent ?? '';
}

function putCalls(calls: FetchCall[]): FetchCall[] {
  return calls.filter((call) => call.method === 'PUT');
}

function createRecordingBus() {
  const events: PlanningChangeEvent[] = [];
  const listeners = new Set<(event: PlanningChangeEvent) => void>();
  const bus: PlanningEventBus = {
    publish(event) {
      events.push(event);
      for (const listener of [...listeners]) {
        listener(event);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return { bus, events };
}

async function renderStaffing(options?: Parameters<typeof installFetch>[0] & { planningEvents?: PlanningEventBus }) {
  const { planningEvents, ...fetchOptions } = options ?? {};
  const calls = installFetch({
    employees: [ada],
    rates: goldenRates,
    allocations: [staffingAllocation(0.5)],
    ...fetchOptions,
  });
  render(
    <DeliveryApp
      displayCurrency="EUR"
      activeUser={{ id: 'shell-operator', name: 'Baseline Operator' }}
      planningEvents={planningEvents}
    />,
  );
  await screen.findByRole('table', { name: /^Staffing for / });
  return calls;
}

describe('Delivery staffing grid', () => {
  it('renders employees across the project months', async () => {
    await renderStaffing();

    const table = screen.getByRole('table', { name: 'Staffing for Design' });
    expect(within(table).getByRole('columnheader', { name: 'Mar 2026' })).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: 'Feb 2027' })).toBeTruthy();
    expect(within(table).getByRole('rowheader', { name: /Ada Lovelace/ }).textContent).toContain('Engineer');
    expect(within(table).getByRole('rowheader', { name: /Ada Lovelace/ }).textContent).toContain('40 h/week');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(14);
  });

  it('shows March 2026 for Ledger Consolidation', async () => {
    await renderStaffing();

    expect(screen.getByRole('columnheader', { name: 'Mar 2026' })).toBeTruthy();
    expect(amountText(monthCell('Ada Lovelace', 'Mar 2026'))).toBe('0.50');
  });

  it('selects the first leaf and can switch to another leaf or a read-only parent', async () => {
    const user = userEvent.setup();
    await renderStaffing({
      allocations: [staffingAllocation(0.25, 'wbs-leaf'), staffingAllocation(0.25, 'wbs-allocated', '2026-03', ada.id)],
    });

    expect(planStaffingButton('Design')).toHaveProperty('ariaPressed', 'true');
    expect(itemNamed('Design').querySelector(':scope > .wbs-row')?.textContent).toContain('Selected for staffing');
    expect(screen.getByRole('table', { name: 'Staffing for Design' })).toBeTruthy();

    await user.click(planStaffingButton('Pilot'));

    expect(planStaffingButton('Pilot')).toHaveProperty('ariaPressed', 'true');
    expect(planStaffingButton('Design')).toHaveProperty('ariaPressed', 'false');
    expect(screen.getByRole('table', { name: 'Staffing for Pilot' })).toBeTruthy();

    await user.click(planStaffingButton('Ledger migration'));

    expect(screen.getByRole('table', { name: 'Staffing for Ledger migration' })).toBeTruthy();
    expect(screen.getByText(/cannot be edited/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(amountText(monthCell('Ada Lovelace', 'Mar 2026'))).toBe('0.50');
  });

  it('resets the selected leaf when the project changes', async () => {
    const user = userEvent.setup();
    await renderStaffing();

    await user.selectOptions(screen.getByLabelText('Project'), reporting.id);

    expect(await screen.findByRole('table', { name: 'Staffing for Platform foundation' })).toBeTruthy();
    expect(itemNamed('Platform foundation').textContent).toContain('Selected for staffing');

    await user.selectOptions(screen.getByLabelText('Project'), ledger.id);

    expect(await screen.findByRole('table', { name: 'Staffing for Design' })).toBeTruthy();
    expect(itemNamed('Design').textContent).toContain('Selected for staffing');
  });

  it('displays PM, hours, percent, and cost without saving', async () => {
    const user = userEvent.setup();
    const calls = await renderStaffing();
    const march = () => amountText(monthCell('Ada Lovelace', 'Mar 2026'));

    expect(march()).toBe('0.50');
    await user.click(screen.getByRole('button', { name: 'Edit Ada Lovelace Mar 2026' }));
    expect((screen.getByLabelText('Allocation for Ada Lovelace in Mar 2026') as HTMLInputElement).value).toBe('0.5');

    await user.click(screen.getByRole('button', { name: 'Hours' }));
    expect(screen.queryByLabelText('Allocation for Ada Lovelace in Mar 2026')).toBeNull();
    expect(march()).toBe('88.00');

    await user.click(screen.getByRole('button', { name: '%' }));
    expect(march()).toBe('50.0%');

    await user.click(screen.getByRole('button', { name: 'Cost' }));
    expect(march()).toBe('€7,880.00');

    await user.click(screen.getByRole('button', { name: 'PM' }));
    expect(march()).toBe('0.50');
    expect(putCalls(calls)).toEqual([]);
  });

  it('saves an edited leaf as canonical person-months for each unit', async () => {
    const user = userEvent.setup();
    const calls = await renderStaffing({ allocations: [] });

    async function editMarch(unit: string, typed: string) {
      if (unit !== 'PM') {
        await user.click(screen.getByRole('button', { name: unit }));
      }
      await user.click(screen.getByRole('button', { name: 'Edit Ada Lovelace Mar 2026' }));
      const input = screen.getByLabelText('Allocation for Ada Lovelace in Mar 2026');
      await user.clear(input);
      await user.type(input, typed);
      await user.click(screen.getByRole('button', { name: 'Save Ada Lovelace Mar 2026' }));
      await waitFor(() => {
        expect(screen.queryByLabelText('Allocation for Ada Lovelace in Mar 2026')).toBeNull();
      });
    }

    await editMarch('PM', '0.125');
    await editMarch('Hours', '88');
    await editMarch('%', '125');
    await editMarch('Cost', '7880');

    expect(putCalls(calls).map((call) => call.body)).toEqual([
      { breakdownItemId: 'wbs-leaf', employeeId: ada.id, month: '2026-03', amount: 0.125 },
      { breakdownItemId: 'wbs-leaf', employeeId: ada.id, month: '2026-03', amount: 0.5 },
      { breakdownItemId: 'wbs-leaf', employeeId: ada.id, month: '2026-03', amount: 1.25 },
      { breakdownItemId: 'wbs-leaf', employeeId: ada.id, month: '2026-03', amount: 0.5 },
    ]);
  });

  it('shows a missing rate and does not save cost without an effective rate', async () => {
    const user = userEvent.setup();
    const calls = await renderStaffing({ rates: [] });

    await user.click(screen.getByRole('button', { name: 'Cost' }));

    expect(monthCell('Ada Lovelace', 'Mar 2026').textContent).toContain('No rate');
    expect(amountText(monthCell('Ada Lovelace', 'Mar 2026'))).toBe('€0.00');

    await user.click(screen.getByRole('button', { name: 'Edit Ada Lovelace Mar 2026' }));
    const input = screen.getByLabelText('Allocation for Ada Lovelace in Mar 2026');
    await user.clear(input);
    await user.type(input, '100');
    await user.click(screen.getByRole('button', { name: 'Save Ada Lovelace Mar 2026' }));

    expect(screen.getByRole('alert').textContent).toContain('no effective rate');
    expect((input as HTMLInputElement).value).toBe('100');
    expect(putCalls(calls)).toEqual([]);
  });

  it('keeps the editor open when saving fails', async () => {
    const user = userEvent.setup();
    const { bus, events } = createRecordingBus();
    await renderStaffing({
      allocations: [],
      planningEvents: bus,
      onAllocation: () => jsonResponse({ error: { code: 'conflict', message: 'Allocation was rejected' } }, 409),
    });

    await user.click(screen.getByRole('button', { name: 'Edit Ada Lovelace Mar 2026' }));
    const input = screen.getByLabelText('Allocation for Ada Lovelace in Mar 2026');
    await user.clear(input);
    await user.type(input, '0.4');
    await user.click(screen.getByRole('button', { name: 'Save Ada Lovelace Mar 2026' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Allocation was rejected');
    expect((screen.getByLabelText('Allocation for Ada Lovelace in Mar 2026') as HTMLInputElement).value).toBe('0.4');
    expect(events).toEqual([]);
  });

  it('refetches allocations after a successful save and leaves the other queries alone', async () => {
    const user = userEvent.setup();
    const { bus, events } = createRecordingBus();
    const allocations: Allocation[] = [];
    const calls = await renderStaffing({
      allocations,
      planningEvents: bus,
      onAllocation: (body) => {
        const input = body as { breakdownItemId: string; employeeId: string; month: string; amount: number };
        const saved: Allocation = {
          id: 'alloc-saved',
          breakdownItemId: input.breakdownItemId,
          employeeId: input.employeeId,
          month: input.month,
          amount: input.amount,
          updatedAt: '2026-10-04T00:00:00.000Z',
        };
        allocations.splice(0, allocations.length, saved);
        return jsonResponse(saved);
      },
    });
    const reads = (url: string) => calls.filter((call) => call.method === 'GET' && call.url === url).length;
    const before = {
      projects: reads('/api/projects'),
      employees: reads('/api/employees'),
      rates: reads('/api/rates'),
      wbs: reads('/api/projects/prj-1/wbs'),
      allocations: reads('/api/projects/prj-1/allocations'),
      capacity: reads('/api/capacity'),
    };

    await user.click(screen.getByRole('button', { name: 'Edit Ada Lovelace Mar 2026' }));
    const input = screen.getByLabelText('Allocation for Ada Lovelace in Mar 2026');
    await user.clear(input);
    await user.type(input, '0.5');
    await user.click(screen.getByRole('button', { name: 'Save Ada Lovelace Mar 2026' }));

    await waitFor(() => {
      expect(amountText(monthCell('Ada Lovelace', 'Mar 2026'))).toBe('0.50');
    });
    expect(screen.queryByLabelText('Allocation for Ada Lovelace in Mar 2026')).toBeNull();
    expect(reads('/api/projects/prj-1/allocations')).toBe(before.allocations + 1);
    await waitFor(() => {
      expect(reads('/api/capacity')).toBe(before.capacity + 1);
    });
    expect(reads('/api/projects')).toBe(before.projects);
    expect(reads('/api/employees')).toBe(before.employees);
    expect(reads('/api/rates')).toBe(before.rates);
    expect(reads('/api/projects/prj-1/wbs')).toBe(before.wbs);
    expect(events).toEqual([
      {
        type: 'allocations-changed',
        employeeId: ada.id,
        month: '2026-03',
        projectId: ledger.id,
        allocationId: 'alloc-saved',
      },
    ]);
  });

  it('reconciles visible totals with the displayed detail cells', async () => {
    const employees: Employee[] = [
      { id: 'e1', name: 'One', role: 'Engineer', weeklyHours: 40 },
      { id: 'e2', name: 'Two', role: 'Engineer', weeklyHours: 40 },
      { id: 'e3', name: 'Three', role: 'Engineer', weeklyHours: 40 },
    ];
    await renderStaffing({
      projects: [{ id: 'prj-march', name: 'March Only', startDate: '2026-03-01', endDate: '2026-03-31' }],
      wbs: [{ id: 'wbs-leaf', projectId: 'prj-march', parentId: null, name: 'Design' }],
      employees,
      rates: [],
      allocations: employees.map((employee) => staffingAllocation(1.004, 'wbs-leaf', '2026-03', employee.id)),
    });

    const table = screen.getByRole('table', { name: 'Staffing for Design' });
    const body = table.querySelector('tbody');
    const foot = table.querySelector('tfoot');
    if (!body || !foot) {
      throw new Error('Missing staffing totals');
    }
    const detail = Array.from(body.querySelectorAll('td:not(.staff-total) .staff-amount')).map((node) => node.textContent);
    const rowTotals = Array.from(body.querySelectorAll('.staff-total .staff-amount')).map((node) => node.textContent);
    const footer = Array.from(foot.querySelectorAll('.staff-amount')).map((node) => node.textContent);

    expect(detail).toEqual(['1.01', '1.00', '1.00']);
    expect(rowTotals).toEqual(['1.01', '1.00', '1.00']);
    expect(footer).toEqual(['3.01', '3.01']);
    expect(Number(detail.reduce((sum, value) => sum + Number(value), 0).toFixed(2))).toBe(3.01);
  });

  it('refetches rates and updates the open cost view when rates change', async () => {
    const user = userEvent.setup();
    const { bus } = createRecordingBus();
    const rates = goldenRates.map((rate) => ({ ...rate }));
    const calls = await renderStaffing({ rates, planningEvents: bus });
    await user.click(screen.getByRole('button', { name: 'Cost' }));
    expect(amountText(monthCell('Ada Lovelace', 'Mar 2026'))).toBe('€7,880.00');
    const before = calls.filter((call) => call.method === 'GET' && call.url === '/api/rates').length;

    const changed = rates.find((rate) => rate.id === 'rate-002');
    if (!changed) {
      throw new Error('Missing rate-002');
    }
    changed.hourlyCost = 120;
    bus.publish({ type: 'rates-changed', employeeId: ada.id });

    await waitFor(() => {
      expect(calls.filter((call) => call.method === 'GET' && call.url === '/api/rates').length).toBe(before + 1);
    });
    await waitFor(() => {
      expect(amountText(monthCell('Ada Lovelace', 'Mar 2026'))).not.toBe('€7,880.00');
    });
  });

  it('shows over capacity and names an in-project cause, including on a parent', async () => {
    const user = userEvent.setup();
    await renderStaffing({
      capacity: [
        {
          employeeId: ada.id,
          month: '2026-03',
          totalPersonMonths: 1.25,
          overCapacity: true,
          causeAllocationId: 'alloc-wbs-leaf-2026-03',
        },
      ],
    });

    expect(await within(monthCell('Ada Lovelace', 'Mar 2026')).findByText('Over capacity')).toBeTruthy();
    const leaf = monthCell('Ada Lovelace', 'Mar 2026');
    expect(amountText(leaf)).toBe('0.50');
    expect(leaf.textContent).toContain('Over capacity');
    expect(leaf.textContent).toContain('Cause: Design');
    expect(leaf.textContent).toContain('1.25 PM');
    expect(leaf.textContent).toContain('125.0%');

    await user.click(planStaffingButton('Ledger migration'));
    const parent = monthCell('Ada Lovelace', 'Mar 2026');
    expect(amountText(parent)).toBe('0.50');
    expect(parent.textContent).toContain('Cause: Design');
    expect(parent.textContent).not.toContain('Cause: Ledger migration');
  });

  it('does not invent a cause when causeAllocationId is null', async () => {
    await renderStaffing({
      capacity: [
        {
          employeeId: ada.id,
          month: '2026-03',
          totalPersonMonths: 1.3,
          overCapacity: true,
          causeAllocationId: null,
        },
      ],
    });

    expect(await within(monthCell('Ada Lovelace', 'Mar 2026')).findByText('Over capacity')).toBeTruthy();
    const cell = monthCell('Ada Lovelace', 'Mar 2026');
    expect(cell.textContent).toContain('Over capacity');
    expect(cell.textContent).not.toContain('Cause:');
  });

  it('does not invent a local assignment for a cause outside the project', async () => {
    await renderStaffing({
      capacity: [
        {
          employeeId: ada.id,
          month: '2026-03',
          totalPersonMonths: 1.3,
          overCapacity: true,
          causeAllocationId: 'alloc-other-project',
        },
      ],
    });

    expect(await within(monthCell('Ada Lovelace', 'Mar 2026')).findByText('Over capacity')).toBeTruthy();
    const cell = monthCell('Ada Lovelace', 'Mar 2026');
    expect(cell.textContent).toContain('Over capacity');
    expect(cell.textContent).not.toContain('Cause:');
    expect(cell.textContent).not.toContain('alloc-other-project');
  });

  it('keeps the staffing grid usable when capacity fails and can retry', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    await renderStaffing({
      onCapacity: () => {
        attempts += 1;
        if (attempts === 1) {
          return jsonResponse({ error: { code: 'unavailable', message: 'Capacity is unavailable' } }, 500);
        }
        return jsonResponse([
          {
            employeeId: ada.id,
            month: '2026-03',
            totalPersonMonths: 1.25,
            overCapacity: true,
            causeAllocationId: null,
          },
        ]);
      },
    });

    expect(amountText(monthCell('Ada Lovelace', 'Mar 2026'))).toBe('0.50');
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Capacity is unavailable');
    expect(monthCell('Ada Lovelace', 'Mar 2026').textContent).not.toContain('Over capacity');
    expect(screen.queryByText('Within capacity')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Retry capacity' }));

    expect(await within(monthCell('Ada Lovelace', 'Mar 2026')).findByText('Over capacity')).toBeTruthy();
    expect(screen.queryByText('Capacity is unavailable')).toBeNull();
    expect(attempts).toBe(2);
  });
});
