import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.error('Mochi runtime error:', error)
  }

  render() {
    if (this.state.hasError) {
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
          <p style={{ marginTop: '10px', marginBottom: '18px', maxWidth: '320px' }}>
            La app encontro un problema inesperado. Toca el boton para recargar.
          </p>
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
