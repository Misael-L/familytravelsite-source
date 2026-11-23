import { Component, type ErrorInfo, type ReactNode } from 'react';
import { SOURCE_CODE_URL } from '../../legal/sourceOffer';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Last-resort render fence. React unmounts the tree on an uncaught render
 * exception, which leaves `#root` empty (white page). Keep TREK chrome: a
 * centered card + reload, not a stack dump.
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] render crashed', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-500">
            The page hit an unexpected error. Your trips are still in the family account — reload to try again.
          </p>
          <button
            type="button"
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
          <p className="mt-4 text-xs text-slate-500">
            <a
              href={SOURCE_CODE_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="source-code-link"
              className="font-semibold underline underline-offset-2"
            >
              Source code (AGPL-3.0)
            </a>
          </p>
        </div>
      </div>
    );
  }
}
