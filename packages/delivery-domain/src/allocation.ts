/** Canonical allocation. Seeded rows use `updatedAt: null` when the source omits it. */
export interface DomainAllocation {
  id: string;
  breakdownItemId: string;
  employeeId: string;
  /** Calendar month, `YYYY-MM`. */
  month: string;
  /** Canonical person-months. Display rounding must not be written back here. */
  personMonths: number;
  /** ISO-8601 timestamp of the last edit, or null when the row has never been edited. */
  updatedAt: string | null;
}
