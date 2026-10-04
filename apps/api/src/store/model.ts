import type {
  Allocation,
  BreakdownItem,
  Employee,
  Project,
  RateRecord,
} from '@baseline/contracts';

export interface StoreMeta {
  name: string;
  version: string;
  gridHorizon: {
    from: string;
    to: string;
  };
  note: string;
}

export interface WorkingStore {
  meta: StoreMeta;
  employees: Employee[];
  rateRecords: RateRecord[];
  projects: Project[];
  breakdownItems: BreakdownItem[];
  allocations: Allocation[];
}

export interface PlanningStore {
  snapshot(): WorkingStore;
  transact<T>(mutator: (draft: WorkingStore) => T): Promise<T>;
}
