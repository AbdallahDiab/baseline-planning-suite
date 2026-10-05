import { useEffect, useState } from 'react';
import type { ActiveUser, DisplayCurrency } from '@baseline/contracts';
import { createPlanningEventBus } from './planning-events';
import { RemotePanel } from './RemotePanel';
import { loadRuntimeConfig, type RuntimeConfig } from './runtime-config';

const displayCurrency: DisplayCurrency = 'EUR';

const activeUser: ActiveUser = {
  id: 'shell-operator',
  name: 'Baseline Operator',
};

export function ShellApp() {
  const [planningEvents] = useState(createPlanningEventBus);
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadRuntimeConfig(controller.signal)
      .then((nextConfig) => {
        setConfig(nextConfig);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Runtime configuration failed';
        setConfigError(message);
      });
    return () => {
      controller.abort();
    };
  }, []);

  return (
    <main>
      <h1>Baseline Planning Suite</h1>
      <nav aria-label="Sections">
        <span>People</span>
        <span>Delivery</span>
      </nav>
      <p>displayCurrency: {displayCurrency}</p>
      {configError ? <p role="alert">{configError}</p> : null}
      {config ? (
        <>
          <RemotePanel
            title="People"
            remoteName="people"
            entry={config.peopleRemoteUrl}
            displayCurrency={displayCurrency}
            activeUser={activeUser}
            planningEvents={planningEvents}
          />
          <RemotePanel
            title="Delivery"
            remoteName="delivery"
            entry={config.deliveryRemoteUrl}
            displayCurrency={displayCurrency}
            activeUser={activeUser}
            planningEvents={planningEvents}
          />
        </>
      ) : configError ? null : (
        <p>Loading runtime configuration…</p>
      )}
    </main>
  );
}
