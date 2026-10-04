import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { DisplayCurrency, RemoteAppProps } from '@baseline/contracts';
import { EmployeeDetail } from './EmployeeDetail';
import { EmployeeRegister } from './EmployeeRegister';
import { createPeopleQueryClient } from './queries';
import './styles.css';

function isHosted(props: Partial<RemoteAppProps>): props is RemoteAppProps {
  return props.displayCurrency !== undefined && props.activeUser !== undefined;
}

export default function PeopleApp(props: Partial<RemoteAppProps>) {
  const [queryClient] = useState(() => createPeopleQueryClient());
  const hosted = isHosted(props);
  const displayCurrency: DisplayCurrency = hosted ? props.displayCurrency : 'EUR';
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  return (
    <QueryClientProvider client={queryClient}>
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
            onBack={() => setSelectedEmployeeId(null)}
          />
        ) : (
          <EmployeeRegister onOpen={setSelectedEmployeeId} />
        )}
      </section>
    </QueryClientProvider>
  );
}
