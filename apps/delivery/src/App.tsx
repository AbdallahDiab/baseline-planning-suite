import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { DisplayCurrency, RemoteAppProps } from '@baseline/contracts';
import { ProjectWorkspace } from './ProjectWorkspace';
import { createDeliveryQueryClient } from './queries';
import './styles.css';

function isHosted(props: Partial<RemoteAppProps>): props is RemoteAppProps {
  return props.displayCurrency !== undefined && props.activeUser !== undefined;
}

export default function DeliveryApp(props: Partial<RemoteAppProps>) {
  const [queryClient] = useState(() => createDeliveryQueryClient());
  const hosted = isHosted(props);
  const displayCurrency: DisplayCurrency = hosted ? props.displayCurrency : 'EUR';

  return (
    <QueryClientProvider client={queryClient}>
      <section data-remote="delivery" className="delivery">
        <header className="delivery-header">
          <h2>Delivery</h2>
          {hosted ? (
            <p className="delivery-user">{props.activeUser.name}</p>
          ) : (
            <p className="delivery-user">Running standalone.</p>
          )}
        </header>
        <ProjectWorkspace displayCurrency={displayCurrency} />
      </section>
    </QueryClientProvider>
  );
}
