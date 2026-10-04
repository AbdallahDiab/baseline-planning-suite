import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRate, deleteRate, getEmployee, listCapacity, listEmployees, listRates, updateRate } from './api';
import type { RateWrite } from './api';

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

export function useRates(employeeId: string) {
  return useQuery({
    queryKey: peopleQueryKeys.rates(employeeId),
    queryFn: () => listRates(employeeId),
  });
}

export function useCreateRate(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rate: RateWrite) => createRate(employeeId, rate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleQueryKeys.rates(employeeId) }),
  });
}

export function useUpdateRate(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { rateId: string; rate: RateWrite }) => updateRate(input.rateId, input.rate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleQueryKeys.rates(employeeId) }),
  });
}

export function useDeleteRate(employeeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rateId: string) => deleteRate(rateId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleQueryKeys.rates(employeeId) }),
  });
}
