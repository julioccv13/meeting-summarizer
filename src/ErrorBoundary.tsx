import React from 'react'

type Props = { children: React.ReactNode }
type State = { hasError: boolean; error?: any }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: any): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: any, info: any) {
    // Log for diagnostics
    console.error('ErrorBoundary caught error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, maxWidth: 720, margin: '40px auto', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
          <div style={{ padding: 16, border: '1px solid #fee2e2', background: '#fef2f2', color: '#991b1b', borderRadius: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Something went wrong</div>
            <div style={{ fontSize: 14, opacity: 0.85 }}>Try refreshing the page. If the problem persists, clear site data (Application → Clear storage) and reload.</div>
            <details style={{ marginTop: 10, fontSize: 12, opacity: 0.9 }}>
              <summary>Error details</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error)}</pre>
            </details>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

