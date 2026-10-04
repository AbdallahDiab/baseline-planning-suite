import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createWbsItem,
  deleteWbsItem,
  listEmployees,
  listProjectAllocations,
  listProjectWbs,
  listProjects,
  listRates,
  moveWbsItem,
  putAllocationCell,
  renameWbsItem,
} from './api';

export function createDeliveryQueryClient(): QueryClient {
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

export const deliveryQueryKeys = {
  projects: ['delivery', 'projects'] as const,
  employees: ['delivery', 'employees'] as const,
  rates: ['delivery', 'rates'] as const,
  wbs: (projectId: string) => ['delivery', 'wbs', projectId] as const,
  allocations: (projectId: string) => ['delivery', 'allocations', projectId] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: deliveryQueryKeys.projects,
    queryFn: listProjects,
  });
}

export function useEmployees() {
  return useQuery({
    queryKey: deliveryQueryKeys.employees,
    queryFn: listEmployees,
  });
}

export function useRates() {
  return useQuery({
    queryKey: deliveryQueryKeys.rates,
    queryFn: listRates,
  });
}

export function useProjectWbs(projectId: string) {
  return useQuery({
    queryKey: deliveryQueryKeys.wbs(projectId),
    queryFn: () => listProjectWbs(projectId),
  });
}

export function useProjectAllocations(projectId: string) {
  return useQuery({
    queryKey: deliveryQueryKeys.allocations(projectId),
    queryFn: () => listProjectAllocations(projectId),
  });
}

function invalidateProjectWbs(queryClient: QueryClient, projectId: string) {
  return queryClient.invalidateQueries({ queryKey: deliveryQueryKeys.wbs(projectId), exact: true });
}

export function useCreateWbsItem(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { parentId: string | null; name: string }) => createWbsItem(projectId, input),
    onSuccess: () => invalidateProjectWbs(queryClient, projectId),
  });
}

export function useRenameWbsItem(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemId: string; name: string }) => renameWbsItem(input.itemId, input.name),
    onSuccess: () => invalidateProjectWbs(queryClient, projectId),
  });
}

export function useMoveWbsItem(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { itemId: string; parentId: string | null }) => moveWbsItem(input.itemId, input.parentId),
    onSuccess: () => invalidateProjectWbs(queryClient, projectId),
  });
}

export function useDeleteWbsItem(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => deleteWbsItem(itemId),
    onSuccess: () => invalidateProjectWbs(queryClient, projectId),
  });
}

export function useSaveAllocation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { breakdownItemId: string; employeeId: string; month: string; amount: number }) =>
      putAllocationCell(input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: deliveryQueryKeys.allocations(projectId),
        exact: true,
      }),
  });
}
