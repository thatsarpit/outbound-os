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
      const updateNeeded = /dynamically imported module|Loading chunk|module script/i.test(
        this.state.error?.message || '',
      )
      return (
        <div className="flex flex-col items-center justify-center rounded-md border border-danger/20 bg-danger/5 p-10 text-center">
          <p className="text-base font-medium text-text-primary">
            {updateNeeded ? 'An app update is ready' : 'This view could not be loaded'}
          </p>
          <p className="mt-2 max-w-sm text-sm text-text-secondary">
            {updateNeeded
              ? 'Reload to get the latest version. Text drafts saved on this device will stay here.'
              : 'Please try again. If the problem continues, reload this page.'}
          </p>
          <button
            type="button"
            onClick={updateNeeded ? () => window.location.reload() : this.reset}
            className="mt-4 min-h-11 rounded-xl border border-border px-4 py-2 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            {updateNeeded ? 'Reload app' : 'Try again'}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
