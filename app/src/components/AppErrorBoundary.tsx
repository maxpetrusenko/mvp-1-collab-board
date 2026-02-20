import { Component, type ErrorInfo, type ReactNode } from 'react'

type AppErrorBoundaryProps = {
  children: ReactNode
}

type AppErrorBoundaryState = {
  hasError: boolean
  errorMessage: string | null
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Unknown application error',
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled render error in app root', error, errorInfo)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleGoToLogin = () => {
    window.location.assign('/login')
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <main className="app-error-shell" role="alert" data-testid="app-error-boundary-fallback">
        <section className="app-error-card">
          <h1>Something went wrong</h1>
          <p>
            The board crashed while rendering. You can reload the app or return to the login page.
          </p>
          <p className="app-error-detail">{this.state.errorMessage}</p>
          <div className="app-error-actions">
            <button type="button" className="primary-button" onClick={this.handleReload}>
              Reload app
            </button>
            <button type="button" className="secondary-button" onClick={this.handleGoToLogin}>
              Go to login
            </button>
          </div>
        </section>
      </main>
    )
  }
}
