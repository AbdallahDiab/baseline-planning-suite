import type { RemoteAppProps } from '@baseline/contracts';

function isHosted(props: Partial<RemoteAppProps>): props is RemoteAppProps {
  return props.displayCurrency !== undefined && props.activeUser !== undefined;
}

export default function PeopleApp(props: Partial<RemoteAppProps>) {
  const hosted = isHosted(props);

  return (
    <section data-remote="people">
      <h2>People</h2>
      <p>People remote rendered.</p>
      {hosted ? (
        <p>
          displayCurrency: {props.displayCurrency}; activeUser: {props.activeUser.name} (
          {props.activeUser.id})
        </p>
      ) : (
        <p>Running standalone.</p>
      )}
    </section>
  );
}
