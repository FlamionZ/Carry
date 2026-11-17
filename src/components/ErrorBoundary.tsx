import { Component, type ReactNode } from "react";
import { describeError } from "../domain/errors";

interface Props {
  children: ReactNode;
  /** Changing this value (e.g. the route path) clears a caught error. */
  resetKey?: string;
}

interface State {
  error: { code: string; message: string } | null;
  resetKey?: string;
}

/**
 * Shows a recovery card instead of a blank page when a screen throws while
 * rendering, for example when local storage becomes unavailable. Only the
 * error code and its generic message are shown; nothing from the error itself.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: describeError(error) };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey === state.resetKey) return null;
    return { error: null, resetKey: props.resetKey };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto max-w-md py-6">
        <div className="card space-y-3 border-alert" role="alert">
          <h1 className="text-xl text-forest">This screen could not be shown</h1>
          <p>{error.message}</p>
          <p className="mono text-xs muted">{error.code}</p>
          <p className="text-sm">Reloading usually fixes this. The error did not change any data on this device.</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <a className="btn-secondary" href="/">
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
