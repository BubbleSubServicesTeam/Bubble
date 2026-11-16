import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Bubble crashed:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto">
              <AlertTriangle size={26} className="text-red-500" />
            </div>
            <h1 className="text-slate-900 dark:text-white font-bold text-lg">Something went wrong</h1>
            <p className="text-slate-500 dark:text-slate-400 text-[13px] leading-relaxed">
              Bubble hit an unexpected problem. Reloading usually fixes it.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-xl transition-all"
            >
              Reload Bubble
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
