/**
 * Values the shell owns at runtime and passes into a hosted remote.
 * This is a props boundary. Do not replace it with a shared React context.
 */
export type DisplayCurrency = 'EUR';

export interface ActiveUser {
  id: string;
  name: string;
}

/**
 * A signal that authoritative data changed.
 * Payloads identify what to refetch. They are not a second copy of business data.
 */
export type PlanningChangeEvent =
  | {
      type: 'rates-changed';
      employeeId: string;
    }
  | {
      type: 'allocations-changed';
      employeeId: string;
      month: string;
      projectId: string;
      allocationId: string;
    };

export interface PlanningEventBus {
  publish(event: PlanningChangeEvent): void;
  subscribe(listener: (event: PlanningChangeEvent) => void): () => void;
}

export interface RemoteAppProps {
  displayCurrency: DisplayCurrency;
  activeUser: ActiveUser;
  planningEvents: PlanningEventBus;
}

/**
 * Stable API boundary types.
 * Calculations and mutable state stay in the owning domain, not in this package.
 */
export const WEEKLY_HOURS = [20, 32, 40] as const;

export type WeeklyHours = (typeof WEEKLY_HOURS)[number];

export interface Employee {
  id: string;
  name: string;
  role: string;
  weeklyHours: WeeklyHours;
}

export interface RateRecord {
  id: string;
  employeeId: string;
  /** Calendar date, `YYYY-MM-DD`. */
  validFrom: string;
  hourlyCost: number;
}

export interface Project {
  id: string;
  name: string;
  /** Calendar date, `YYYY-MM-DD`. */
  startDate: string;
  /** Calendar date, `YYYY-MM-DD`. */
  endDate: string;
}

export interface BreakdownItem {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
}

export interface Allocation {
  id: string;
  breakdownItemId: string;
  employeeId: string;
  /** Calendar month, `YYYY-MM`. */
  month: string;
  /** Canonical person-months. Display rounding is not stored here. */
  amount: number;
  /** ISO-8601 timestamp of the last edit, or null when the row has never been edited. */
  updatedAt: string | null;
}

export interface CapacitySummary {
  employeeId: string;
  month: string;
  totalPersonMonths: number;
  overCapacity: boolean;
  causeAllocationId: string | null;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
  };
}
