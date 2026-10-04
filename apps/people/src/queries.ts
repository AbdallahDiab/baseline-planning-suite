import { QueryClient, useQuery } from '@tanstack/react-query';
import { getEmployee, listCapacity, listEmployees } from './api';

export function createPeopleQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const peopleQueryKeys = {
  employees: (search: string) => ['people', 'employees', search] as const,
  employee: (employeeId: string) => ['people', 'employee', employeeId] as const,
  rates: (employeeId: string) => ['people', 'rates', employeeId] as const,
  capacity: ['people', 'capacity'] as const,
};

export function useEmployees(search: string) {
  return useQuery({
    queryKey: peopleQueryKeys.employees(search),
    queryFn: () => listEmployees(search),
  });
}

export function useEmployee(employeeId: string) {
  return useQuery({
    queryKey: peopleQueryKeys.employee(employeeId),
    queryFn: () => getEmployee(employeeId),
  });
}

export function useCapacity() {
  return useQuery({
    queryKey: peopleQueryKeys.capacity,
    queryFn: listCapacity,
  });
}
