import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { DisplayCurrency, RemoteAppProps } from '@baseline/contracts';
import { EmployeeDetail } from './EmployeeDetail';
import { EmployeeRegister } from './EmployeeRegister';
import { PeopleRuntimeSync } from './PeopleRuntimeSync';
import { createPeopleQueryClient } from './queries';
import './styles.css';

type HostedShellProps = Pick<RemoteAppProps, 'displayCurrency' | 'activeUser'>;

function hasHostedShellProps(
  props: Partial<RemoteAppProps>,
): props is Partial<RemoteAppProps> & HostedShellProps {
  return props.displayCurrency !== undefined && props.activeUser !== undefined;
}

export default function PeopleApp(props: Partial<RemoteAppProps>) {
  const [queryClient] = useState(() => createPeopleQueryClient());
  const hosted = hasHostedShellProps(props);
  const displayCurrency: DisplayCurrency = hosted ? props.displayCurrency : 'EUR';
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  return (
    <QueryClientProvider client={queryClient}>
      <PeopleRuntimeSync planningEvents={props.planningEvents} />
      <section data-remote="people" className="people">
        <header className="people-header">
          <h2>People</h2>
          {hosted ? (
            <p className="people-user">{props.activeUser.name}</p>
          ) : (
            <p className="people-user">Running standalone.</p>
          )}
        </header>
        {selectedEmployeeId ? (
          <EmployeeDetail
            employeeId={selectedEmployeeId}
            displayCurrency={displayCurrency}
            planningEvents={props.planningEvents}
            onBack={() => setSelectedEmployeeId(null)}
          />
        ) : (
          <EmployeeRegister onOpen={setSelectedEmployeeId} />
        )}
      </section>
    </QueryClientProvider>
  );
}
