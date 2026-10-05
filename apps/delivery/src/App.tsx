import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { DisplayCurrency, RemoteAppProps } from '@baseline/contracts';
import { DeliveryRuntimeSync } from './DeliveryRuntimeSync';
import { ProjectWorkspace } from './ProjectWorkspace';
import { createDeliveryQueryClient } from './queries';
import './styles.css';

type HostedShellProps = Pick<RemoteAppProps, 'displayCurrency' | 'activeUser'>;

function hasHostedShellProps(
  props: Partial<RemoteAppProps>,
): props is Partial<RemoteAppProps> & HostedShellProps {
  return props.displayCurrency !== undefined && props.activeUser !== undefined;
}

export default function DeliveryApp(props: Partial<RemoteAppProps>) {
  const [queryClient] = useState(() => createDeliveryQueryClient());
  const hosted = hasHostedShellProps(props);
  const displayCurrency: DisplayCurrency = hosted ? props.displayCurrency : 'EUR';

  return (
    <QueryClientProvider client={queryClient}>
      <DeliveryRuntimeSync planningEvents={props.planningEvents} />
      <section data-remote="delivery" className="delivery">
        <header className="delivery-header">
          <h2>Delivery</h2>
          {hosted ? (
            <p className="delivery-user">{props.activeUser.name}</p>
          ) : (
            <p className="delivery-user">Running standalone.</p>
          )}
        </header>
        <ProjectWorkspace displayCurrency={displayCurrency} planningEvents={props.planningEvents} />
      </section>
    </QueryClientProvider>
  );
}
