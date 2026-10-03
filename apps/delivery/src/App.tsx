import type { RemoteAppProps } from '@baseline/contracts';

function isHosted(props: Partial<RemoteAppProps>): props is RemoteAppProps {
  return props.displayCurrency !== undefined && props.activeUser !== undefined;
}

export default function DeliveryApp(props: Partial<RemoteAppProps>) {
  const hosted = isHosted(props);

  return (
    <section data-remote="delivery">
      <h2>Delivery</h2>
      <p>Delivery remote rendered.</p>
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
