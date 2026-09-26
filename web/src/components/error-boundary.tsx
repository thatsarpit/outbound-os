import { Component, type ReactNode } from 'react'
import { captureError } from '@/lib/sentry'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    captureError(error, { componentStack: info.componentStack, boundary: 'route' })
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center justify-center rounded-md border border-danger/20 bg-danger/5 p-10 text-center">
          <p className="text-sm font-medium text-danger">Something went wrong</p>
          {this.state.error?.message && (
            <p className="mt-1 text-xs text-text-muted">{this.state.error.message}</p>
          )}
          <button
            type="button"
            onClick={this.reset}
            className="mt-4 rounded-md border border-border px-4 py-2 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
