import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      errorName: '',
      errorMessage: '',
      stack: '',
      componentStack: '',
      errorId: '',
    }
    this.handleWindowError = this.handleWindowError.bind(this)
    this.handleUnhandledRejection = this.handleUnhandledRejection.bind(this)
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidMount() {
    window.addEventListener('error', this.handleWindowError)
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection)
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleWindowError)
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection)
  }

  handleWindowError(event) {
    const err = event?.error
    this.setState({
      hasError: true,
      errorName: err?.name || 'WindowError',
      errorMessage: err?.message || event?.message || 'Error desconocido en window.onerror',
      stack: String(err?.stack || '').slice(0, 3000),
      componentStack: '',
      errorId: new Date().toISOString(),
    })
  }

  handleUnhandledRejection(event) {
    const reason = event?.reason
    const msg = typeof reason === 'string' ? reason : (reason?.message || 'Promise rechazada sin mensaje')
    this.setState({
      hasError: true,
      errorName: reason?.name || 'UnhandledRejection',
      errorMessage: msg,
      stack: String(reason?.stack || '').slice(0, 3000),
      componentStack: '',
      errorId: new Date().toISOString(),
    })
  }

  componentDidCatch(error, info) {
    console.error('Mochi runtime error:', error)
    this.setState({
      errorName: error?.name || 'RuntimeError',
      errorMessage: error?.message || 'Error sin mensaje',
      stack: String(error?.stack || '').slice(0, 3000),
      componentStack: String(info?.componentStack || '').slice(0, 3000),
      errorId: new Date().toISOString(),
    })
  }

  render() {
    if (this.state.hasError) {
      const detailsText = [
        `id: ${this.state.errorId || 'n/a'}`,
        `name: ${this.state.errorName || 'n/a'}`,
        `message: ${this.state.errorMessage || 'n/a'}`,
        this.state.stack ? `stack:\n${this.state.stack}` : '',
        this.state.componentStack ? `componentStack:\n${this.state.componentStack}` : '',
      ].filter(Boolean).join('\n\n')

      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: '#f8f2e4',
            color: '#1e2b1e',
            fontFamily: 'Nunito, sans-serif',
            textAlign: 'center',
          }}
        >
          <h1 style={{ margin: 0, fontSize: '1.4rem' }}>Ocurrio un error</h1>
          <p style={{ marginTop: '10px', marginBottom: '10px', maxWidth: '340px' }}>
            La app encontro un problema inesperado. Puedes copiar el detalle tecnico para revisarlo.
          </p>
          <div style={{ fontSize: '0.74rem', color: '#5a6a4a', marginBottom: '14px', maxWidth: '340px' }}>
            {this.state.errorName || 'Error'}: {this.state.errorMessage || 'sin mensaje'}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                border: 'none',
                borderRadius: '12px',
                padding: '12px 18px',
                background: '#1e2b1e',
                color: '#fdf8ef',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Recargar
            </button>
            <button
              onClick={() => {
                if (navigator.clipboard?.writeText) navigator.clipboard.writeText(detailsText).catch(() => {})
              }}
              style={{
                border: '1px solid #d8cfb9',
                borderRadius: '12px',
                padding: '12px 14px',
                background: '#fffaf0',
                color: '#1e2b1e',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Copiar detalle
            </button>
          </div>
          <details style={{ width: '100%', maxWidth: '360px', textAlign: 'left' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem', color: '#3b4b3b' }}>Ver detalle tecnico</summary>
            <pre
              style={{
                marginTop: '10px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: '#fffaf0',
                border: '1px solid #e8dcc5',
                borderRadius: '10px',
                padding: '10px',
                fontSize: '0.7rem',
                lineHeight: 1.45,
                maxHeight: '230px',
                overflow: 'auto',
              }}
            >
              {detailsText}
            </pre>
          </details>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
)
