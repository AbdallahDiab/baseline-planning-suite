import type { PlanningChangeEvent, PlanningEventBus } from '@baseline/contracts';

export function createPlanningEventBus(): PlanningEventBus {
  const listeners = new Set<(event: PlanningChangeEvent) => void>();

  return {
    publish(event) {
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch {
          // One listener must not block the others or the shell.
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
