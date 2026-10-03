import { Component, type ReactNode } from 'react';

interface RemoteErrorBoundaryProps {
  remoteName: string;
  children: ReactNode;
}

interface RemoteErrorBoundaryState {
  message: string | null;
}

export class RemoteErrorBoundary extends Component<
  RemoteErrorBoundaryProps,
  RemoteErrorBoundaryState
> {
  state: RemoteErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): RemoteErrorBoundaryState {
    const message = error instanceof Error ? error.message : 'Remote render failed';
    return { message };
  }

  render() {
    if (this.state.message) {
      return (
        <p role="alert" data-state="error">
          {this.props.remoteName} failed while rendering. {this.state.message}
        </p>
      );
    }
    return this.props.children;
  }
}
