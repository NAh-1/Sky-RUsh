import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Uncaught application error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#030b1a] text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-3xl bg-[#07152e] border-2 border-cyan-400 p-6 text-center shadow-[0_0_32px_rgba(34,211,238,0.35)]">
            <h1 className="font-display font-black text-3xl text-yellow-400 uppercase mb-2">
              SKY RUSH
            </h1>
            <p className="text-sm text-cyan-200 mb-5 break-words">
              Something interrupted the game session. Reload to jump back in.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-12 px-8 py-2.5 rounded-full bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-500 text-[#07152e] font-display font-black text-xl tracking-wide shadow-[0_4px_0_#b45309] cursor-pointer"
            >
              RELOAD GAME
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
