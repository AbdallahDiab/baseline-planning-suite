import type { Allocation, BreakdownItem, CapacitySummary } from '@baseline/contracts';

export interface CapacityCellMarker {
  totalLabel: string;
  percentLabel: string;
  causeName: string | null;
}

export function capacityMarkerForCell(
  summaries: readonly CapacitySummary[],
  employeeId: string,
  month: string,
  allocations: readonly Allocation[],
  items: readonly BreakdownItem[],
): CapacityCellMarker | null {
  const summary = summaries.find((entry) => entry.employeeId === employeeId && entry.month === month);
  if (!summary?.overCapacity) {
    return null;
  }
  return {
    totalLabel: `${summary.totalPersonMonths.toFixed(2)} PM`,
    percentLabel: `${(summary.totalPersonMonths * 100).toFixed(1)}%`,
    causeName: causeName(summary.causeAllocationId, allocations, items),
  };
}

function causeName(
  causeAllocationId: string | null,
  allocations: readonly Allocation[],
  items: readonly BreakdownItem[],
): string | null {
  if (causeAllocationId === null) {
    return null;
  }
  const allocation = allocations.find((entry) => entry.id === causeAllocationId);
  if (!allocation) {
    return null;
  }
  return items.find((item) => item.id === allocation.breakdownItemId)?.name ?? null;
}
