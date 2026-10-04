import { QueryClient, useQuery } from '@tanstack/react-query';
import { listProjectAllocations, listProjectWbs, listProjects } from './api';

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
  wbs: (projectId: string) => ['delivery', 'wbs', projectId] as const,
  allocations: (projectId: string) => ['delivery', 'allocations', projectId] as const,
};

export function useProjects() {
  return useQuery({
    queryKey: deliveryQueryKeys.projects,
    queryFn: listProjects,
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
