import { useEffect, useState, type ComponentType } from 'react';
import type { RemoteAppProps } from '@baseline/contracts';
import { loadHostedRemote } from './load-remote';

interface RemotePanelProps extends RemoteAppProps {
  title: string;
  remoteName: string;
  entry: string;
}

type PanelState =
  | { status: 'loading' }
  | { status: 'ready'; Component: ComponentType<RemoteAppProps> }
  | { status: 'error'; message: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Remote failed to load';
}

export function RemotePanel({
  title,
  remoteName,
  entry,
  displayCurrency,
  activeUser,
}: RemotePanelProps) {
  const [state, setState] = useState<PanelState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadHostedRemote(remoteName, entry)
      .then((Component) => {
        if (!cancelled) {
          setState({ status: 'ready', Component });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: errorMessage(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entry, remoteName]);

  return (
    <section aria-label={`${title} panel`} data-panel={remoteName}>
      <h2>{title}</h2>
      {state.status === 'loading' ? <p>Loading {title}…</p> : null}
      {state.status === 'error' ? (
        <p role="alert" data-state="error">
          {title} is unavailable. {state.message}
        </p>
      ) : null}
      {state.status === 'ready' ? (
        <state.Component displayCurrency={displayCurrency} activeUser={activeUser} />
      ) : null}
    </section>
  );
}
