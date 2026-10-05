import { describe, expect, it } from 'vitest';
import type { PlanningChangeEvent } from '@baseline/contracts';
import { createPlanningEventBus } from './planning-events';

const ratesChanged: PlanningChangeEvent = {
  type: 'rates-changed',
  employeeId: 'emp-001',
};

describe('planning event bus', () => {
  it('delivers an event to a subscriber', () => {
    const bus = createPlanningEventBus();
    const received: PlanningChangeEvent[] = [];
    bus.subscribe((event) => {
      received.push(event);
    });

    bus.publish(ratesChanged);

    expect(received).toEqual([ratesChanged]);
  });

  it('delivers an event to every subscriber', () => {
    const bus = createPlanningEventBus();
    const first: PlanningChangeEvent[] = [];
    const second: PlanningChangeEvent[] = [];
    bus.subscribe((event) => {
      first.push(event);
    });
    bus.subscribe((event) => {
      second.push(event);
    });

    bus.publish(ratesChanged);

    expect(first).toEqual([ratesChanged]);
    expect(second).toEqual([ratesChanged]);
  });

  it('stops delivery after unsubscribe', () => {
    const bus = createPlanningEventBus();
    const received: PlanningChangeEvent[] = [];
    const unsubscribe = bus.subscribe((event) => {
      received.push(event);
    });

    unsubscribe();
    bus.publish(ratesChanged);

    expect(received).toEqual([]);
  });

  it('continues delivery when one listener throws', () => {
    const bus = createPlanningEventBus();
    const received: string[] = [];
    bus.subscribe(() => {
      received.push('first');
    });
    bus.subscribe(() => {
      throw new Error('listener failed');
    });
    bus.subscribe(() => {
      received.push('third');
    });

    expect(() => {
      bus.publish(ratesChanged);
    }).not.toThrow();
    expect(received).toEqual(['first', 'third']);
  });
});
