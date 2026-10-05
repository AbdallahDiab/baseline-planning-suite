import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PlanningEventBus } from '@baseline/contracts';
import { peopleQueryKeys } from './queries';

export function PeopleRuntimeSync({ planningEvents }: { planningEvents?: PlanningEventBus }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!planningEvents) {
      return;
    }
    return planningEvents.subscribe((event) => {
      if (event.type === 'allocations-changed') {
        void queryClient.invalidateQueries({ queryKey: peopleQueryKeys.capacity });
      }
    });
  }, [planningEvents, queryClient]);

  return null;
}
