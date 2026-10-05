import type { CapacitySummary, Employee, PlanningChangeEvent, PlanningEventBus, RateRecord } from '@baseline/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PeopleApp from './App';

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

const ada: Employee = {
  id: 'emp-001',
  name: 'Adaeze Okafor',
  role: 'Tech Lead',
  weeklyHours: 40,
};

const noor: Employee = {
  id: 'emp-003',
  name: 'Noor Hassan',
  role: 'Engineer',
  weeklyHours: 32,
};

const capacity: CapacitySummary[] = [
  {
    employeeId: 'emp-003',
    month: '2026-05',
    totalPersonMonths: 0.4,
    overCapacity: false,
    causeAllocationId: null,
  },
  {
    employeeId: 'emp-003',
    month: '2026-06',
    totalPersonMonths: 1.3,
    overCapacity: true,
    causeAllocationId: null,
  },
  {
    employeeId: 'emp-001',
    month: '2026-06',
    totalPersonMonths: 0.5,
    overCapacity: false,
    causeAllocationId: null,
  },
];

const rates: RateRecord[] = [
  { id: 'rate-b', employeeId: 'emp-001', validFrom: '2024-01-01', hourlyCost: 80 },
  { id: 'rate-c', employeeId: 'emp-001', validFrom: '2025-01-01', hourlyCost: 95 },
  { id: 'rate-a', employeeId: 'emp-001', validFrom: '2025-01-01', hourlyCost: 90 },
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
  employees?: (search: string) => Employee[];
  capacity?: CapacitySummary[];
  employee?: Employee;
  rates?: RateRecord[];
  onPost?: (body: unknown) => Response;
  onPatch?: (url: string, body: unknown) => Response;
  onDelete?: (url: string) => Response;
}) {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      calls.push({ url, method, body });

      if (method === 'GET' && url.startsWith('/api/employees/')) {
        return jsonResponse(options?.employee ?? ada);
      }
      if (method === 'GET' && url.startsWith('/api/employees')) {
        const search = new URL(url, 'http://localhost').searchParams.get('search') ?? '';
        return jsonResponse(options?.employees ? options.employees(search) : [ada, noor]);
      }
      if (method === 'GET' && url.startsWith('/api/capacity')) {
        return jsonResponse(options?.capacity ?? capacity);
      }
      if (method === 'GET' && url.startsWith('/api/rates')) {
        return jsonResponse(options?.rates ?? rates);
      }
      if (method === 'POST' && url === '/api/rates') {
        if (options?.onPost) {
          return options.onPost(body);
        }
        const posted = body as { employeeId: string; validFrom: string; hourlyCost: number };
        return jsonResponse({ id: 'rate-new', ...posted }, 201);
      }
      if (method === 'PATCH' && url.startsWith('/api/rates/')) {
        if (options?.onPatch) {
          return options.onPatch(url, body);
        }
        const patched = body as { validFrom: string; hourlyCost: number };
        return jsonResponse({ id: url.split('/').at(-1), employeeId: 'emp-001', ...patched });
      }
      if (method === 'DELETE' && url.startsWith('/api/rates/')) {
        return options?.onDelete?.(url) ?? new Response(null, { status: 204 });
      }
      return jsonResponse({ error: { code: 'not_found', message: 'Not found' } }, 404);
    }),
  );
  return calls;
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

async function openEmployee(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: `Open ${name}` }));
  await screen.findByRole('heading', { name: 'Rate history' });
}

describe('People remote', () => {
  it('renders employees from the API', async () => {
    const calls = installFetch();
    render(<PeopleApp />);

    expect(await screen.findByText('Adaeze Okafor')).toBeTruthy();
    expect(screen.getByText('Tech Lead')).toBeTruthy();
    expect(screen.getByText('Noor Hassan')).toBeTruthy();
    expect(screen.getByText('Engineer')).toBeTruthy();
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('32')).toBeTruthy();
    expect(calls.some((call) => call.method === 'GET' && call.url === '/api/employees')).toBe(true);
  });

  it('changes the employees request when the search changes', async () => {
    const user = userEvent.setup();
    const calls = installFetch({
      employees: (search) => (search.toLowerCase().includes('lead') ? [ada] : [ada, noor]),
    });
    render(<PeopleApp />);
    expect(await screen.findByText('Noor Hassan')).toBeTruthy();

    await user.type(screen.getByLabelText('Search employees'), 'Lead');

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'GET' && call.url.includes('search=Lead'))).toBe(true);
    });
    await waitFor(() => {
      expect(screen.queryByText('Noor Hassan')).toBeNull();
    });
    expect(screen.getByText('Adaeze Okafor')).toBeTruthy();
    expect(screen.getByText('Tech Lead')).toBeTruthy();
  });

  it('shows over-capacity status from published capacity summaries', async () => {
    installFetch();
    render(<PeopleApp />);

    expect(await screen.findByText('Over capacity')).toBeTruthy();
    const noorRow = screen.getByText('Noor Hassan').closest('tr');
    const adaRow = screen.getByText('Adaeze Okafor').closest('tr');
    expect(noorRow?.textContent).toContain('Over capacity');
    expect(adaRow?.textContent).toContain('Within capacity');
  });

  it('shows readonly employee fields and sorted rate history', async () => {
    const user = userEvent.setup();
    const calls = installFetch({
      capacity: [
        {
          employeeId: 'emp-001',
          month: '2026-06',
          totalPersonMonths: 1.3,
          overCapacity: true,
          causeAllocationId: null,
        },
      ],
    });
    render(<PeopleApp displayCurrency="EUR" activeUser={{ id: 'shell-operator', name: 'Baseline Operator' }} />);
    await openEmployee(user, 'Adaeze Okafor');

    expect(screen.getByText('Baseline Operator')).toBeTruthy();
    expect(screen.getByText('Name').nextElementSibling?.textContent).toBe('Adaeze Okafor');
    expect(screen.getByText('Role').nextElementSibling?.textContent).toBe('Tech Lead');
    expect(screen.getByText('Weekly hours').nextElementSibling?.textContent).toBe('40');
    expect(screen.queryByLabelText('Name')).toBeNull();
    expect(calls.some((call) => call.method === 'GET' && call.url === '/api/employees/emp-001')).toBe(true);
    expect(calls.some((call) => call.method === 'GET' && call.url === '/api/rates?employeeId=emp-001')).toBe(true);

    expect(screen.getByText('2026-06')).toBeTruthy();
    expect(screen.getByText('1.30 PM')).toBeTruthy();
    expect(screen.getByText('130.0%')).toBeTruthy();

    const rateRows = within(screen.getByRole('table', { name: 'Rates' })).getAllByRole('row').slice(1);
    expect(rateRows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('2025-01-01'),
      expect.stringContaining('2025-01-01'),
      expect.stringContaining('2024-01-01'),
    ]);
    expect(rateRows[0]?.textContent).toContain('€90.00');
    expect(rateRows[1]?.textContent).toContain('€95.00');
    expect(rateRows[2]?.textContent).toContain('€80.00');
  });

  it('posts a new rate for the open employee', async () => {
    const user = userEvent.setup();
    const calls = installFetch();
    render(<PeopleApp />);
    await openEmployee(user, 'Adaeze Okafor');

    await user.click(screen.getByRole('button', { name: 'Add rate' }));
    await user.type(screen.getByLabelText('Valid from'), '2020-02-01');
    await user.type(screen.getByLabelText('Hourly cost'), '110');
    await user.click(screen.getByRole('button', { name: 'Save rate' }));

    await waitFor(() => {
      expect(calls.find((call) => call.method === 'POST')).toMatchObject({
        url: '/api/rates',
        body: {
          employeeId: 'emp-001',
          validFrom: '2020-02-01',
          hourlyCost: 110,
        },
      });
    });
    expect(screen.queryByLabelText('Valid from')).toBeNull();
  });

  it('patches an existing rate without sending employeeId', async () => {
    const user = userEvent.setup();
    const calls = installFetch({
      rates: [{ id: 'rate-a', employeeId: 'emp-001', validFrom: '2025-01-01', hourlyCost: 90 }],
    });
    render(<PeopleApp />);
    await openEmployee(user, 'Adaeze Okafor');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const validFrom = screen.getByLabelText('Valid from');
    const hourlyCost = screen.getByLabelText('Hourly cost');
    await user.clear(validFrom);
    await user.type(validFrom, '2024-02-29');
    await user.clear(hourlyCost);
    await user.type(hourlyCost, '12.5');
    await user.click(screen.getByRole('button', { name: 'Save rate' }));

    await waitFor(() => {
      const patch = calls.find((call) => call.method === 'PATCH');
      expect(patch).toMatchObject({
        url: '/api/rates/rate-a',
        body: {
          validFrom: '2024-02-29',
          hourlyCost: 12.5,
        },
      });
      expect(patch?.body).not.toHaveProperty('employeeId');
    });
  });

  it('sends delete only after confirmation', async () => {
    const user = userEvent.setup();
    const calls = installFetch({
      rates: [{ id: 'rate-a', employeeId: 'emp-001', validFrom: '2025-01-01', hourlyCost: 90 }],
    });
    render(<PeopleApp />);
    await openEmployee(user, 'Adaeze Okafor');

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(calls.some((call) => call.method === 'DELETE' && call.url === '/api/rates/rate-a')).toBe(true);
    });
  });

  it('keeps rate form input when the API rejects the mutation', async () => {
    const user = userEvent.setup();
    installFetch({
      onPost: () =>
        jsonResponse(
          {
            error: {
              code: 'conflict',
              message: 'Rate could not be saved',
            },
          },
          409,
        ),
    });
    render(<PeopleApp />);
    await openEmployee(user, 'Adaeze Okafor');

    await user.click(screen.getByRole('button', { name: 'Add rate' }));
    await user.type(screen.getByLabelText('Valid from'), '2020-02-01');
    await user.type(screen.getByLabelText('Hourly cost'), '42');
    await user.click(screen.getByRole('button', { name: 'Save rate' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Rate could not be saved');
    expect((screen.getByLabelText('Valid from') as HTMLInputElement).value).toBe('2020-02-01');
    expect((screen.getByLabelText('Hourly cost') as HTMLInputElement).value).toBe('42');
  });

  it('publishes rates-changed after a successful create', async () => {
    const user = userEvent.setup();
    const { bus, events } = createRecordingBus();
    installFetch();
    render(<PeopleApp planningEvents={bus} />);
    await openEmployee(user, 'Adaeze Okafor');

    await user.click(screen.getByRole('button', { name: 'Add rate' }));
    await user.type(screen.getByLabelText('Valid from'), '2020-02-01');
    await user.type(screen.getByLabelText('Hourly cost'), '110');
    await user.click(screen.getByRole('button', { name: 'Save rate' }));

    await waitFor(() => {
      expect(events).toEqual([{ type: 'rates-changed', employeeId: 'emp-001' }]);
    });
  });

  it('publishes rates-changed after a successful update', async () => {
    const user = userEvent.setup();
    const { bus, events } = createRecordingBus();
    installFetch({
      rates: [{ id: 'rate-a', employeeId: 'emp-001', validFrom: '2025-01-01', hourlyCost: 90 }],
    });
    render(<PeopleApp planningEvents={bus} />);
    await openEmployee(user, 'Adaeze Okafor');

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const hourlyCost = screen.getByLabelText('Hourly cost');
    await user.clear(hourlyCost);
    await user.type(hourlyCost, '12.5');
    await user.click(screen.getByRole('button', { name: 'Save rate' }));

    await waitFor(() => {
      expect(events).toEqual([{ type: 'rates-changed', employeeId: 'emp-001' }]);
    });
    expect(events[0]).not.toHaveProperty('hourlyCost');
  });

  it('publishes rates-changed after a successful delete', async () => {
    const user = userEvent.setup();
    const { bus, events } = createRecordingBus();
    installFetch({
      rates: [{ id: 'rate-a', employeeId: 'emp-001', validFrom: '2025-01-01', hourlyCost: 90 }],
    });
    render(<PeopleApp planningEvents={bus} />);
    await openEmployee(user, 'Adaeze Okafor');

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(events).toEqual([{ type: 'rates-changed', employeeId: 'emp-001' }]);
    });
  });

  it('publishes nothing when a rate mutation fails', async () => {
    const user = userEvent.setup();
    const { bus, events } = createRecordingBus();
    installFetch({
      onPost: () =>
        jsonResponse(
          {
            error: {
              code: 'conflict',
              message: 'Rate could not be saved',
            },
          },
          409,
        ),
    });
    render(<PeopleApp planningEvents={bus} />);
    await openEmployee(user, 'Adaeze Okafor');

    await user.click(screen.getByRole('button', { name: 'Add rate' }));
    await user.type(screen.getByLabelText('Valid from'), '2020-02-01');
    await user.type(screen.getByLabelText('Hourly cost'), '42');
    await user.click(screen.getByRole('button', { name: 'Save rate' }));

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Rate could not be saved');
    expect(events).toEqual([]);
  });

  it('refetches capacity when allocations change', async () => {
    const { bus } = createRecordingBus();
    const calls = installFetch();
    render(<PeopleApp planningEvents={bus} />);
    await screen.findByText('Adaeze Okafor');
    const before = calls.filter((call) => call.method === 'GET' && call.url.startsWith('/api/capacity')).length;

    bus.publish({
      type: 'allocations-changed',
      employeeId: 'emp-001',
      month: '2026-03',
      projectId: 'prj-1',
      allocationId: 'alloc-001',
    });

    await waitFor(() => {
      expect(calls.filter((call) => call.method === 'GET' && call.url.startsWith('/api/capacity')).length).toBe(
        before + 1,
      );
    });
  });

  it('renders standalone without hosted runtime props', async () => {
    installFetch();
    render(<PeopleApp />);

    expect(await screen.findByText('Running standalone.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'People' })).toBeTruthy();
    expect(await screen.findByText('Adaeze Okafor')).toBeTruthy();
    expect(screen.queryByText('Baseline Operator')).toBeNull();
  });
});
