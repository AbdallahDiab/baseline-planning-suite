import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PlanningEventBus } from '@baseline/contracts';
import { deliveryQueryKeys } from './queries';

export function DeliveryRuntimeSync({ planningEvents }: { planningEvents?: PlanningEventBus }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!planningEvents) {
      return;
    }
    return planningEvents.subscribe((event) => {
      if (event.type === 'rates-changed') {
        void queryClient.invalidateQueries({ queryKey: deliveryQueryKeys.rates });
      }
    });
  }, [planningEvents, queryClient]);

  return null;
}
