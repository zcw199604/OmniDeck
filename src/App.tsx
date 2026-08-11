import { useState } from 'react'
import './App.css'
import ConnectionSettings from './features/cc-hub/components/ConnectionSettings'
import ProviderView from './features/cc-hub/components/ProviderView'
import QuotaView from './features/cc-hub/components/QuotaView'
import UsageView from './features/cc-hub/components/UsageView'
import { useConnection } from './features/cc-hub/useConnection'

type View = 'providers' | 'quota' | 'usage'

function App() {
  const connection = useConnection()
  const [activeView, setActiveView] = useState<View>('providers')
  const connected = Boolean(connection.state?.configured && connection.state.hasToken)
  const providerWritesEnabled = Boolean(
    connection.state?.capabilities?.providerPatchRuntimeVerified,
  )

  if (connection.loading) {
    return (
      <main className="setup-shell">
        <p className="startup-state">Loading connection state...</p>
      </main>
    )
  }

  if (!connected) {
    return (
      <main className="setup-shell">
        <section className="setup-panel" aria-labelledby="connect-title">
          <div className="product-mark">
            <span className="product-kicker">OmniDeck</span>
            <h1 id="connect-title">Connect CC Hub</h1>
            <p>Configure one administrator connection to open the management console.</p>
          </div>
          <ConnectionSettings
            connected={false}
            error={connection.error}
            initialBaseUrl={connection.state?.baseUrl ?? ''}
            initialAllowInsecureHttp={connection.state?.transportSecurity === 'acknowledged-insecure'}
            onRemove={connection.remove}
            onSave={connection.save}
            onTest={connection.test}
            saving={connection.saving}
          />
        </section>
      </main>
    )
  }

  return (
    <main className="dashboard-shell">
      <aside className="side-panel">
        <header className="product-header">
          <span className="product-kicker">OmniDeck</span>
          <h1>CC Hub Console</h1>
          <p>{connection.state?.baseUrl}</p>
        </header>
        <nav aria-label="Management views" className="view-tabs" role="tablist">
          <button
            aria-controls="providers-view"
            aria-selected={activeView === 'providers'}
            id="providers-tab"
            onClick={() => setActiveView('providers')}
            role="tab"
            type="button"
          >
            Providers
          </button>
          <button
            aria-controls="quota-view"
            aria-selected={activeView === 'quota'}
            id="quota-tab"
            onClick={() => setActiveView('quota')}
            role="tab"
            type="button"
          >
            Quota management
          </button>
          <button
            aria-controls="usage-view"
            aria-selected={activeView === 'usage'}
            id="usage-tab"
            onClick={() => setActiveView('usage')}
            role="tab"
            type="button"
          >
            Usage details
          </button>
        </nav>
        <details className="connection-details">
          <summary>Connection settings</summary>
          <ConnectionSettings
            connected
            error={connection.error}
            initialBaseUrl={connection.state?.baseUrl ?? ''}
            initialAllowInsecureHttp={connection.state?.transportSecurity === 'acknowledged-insecure'}
            onRemove={connection.remove}
            onSave={connection.save}
            onTest={connection.test}
            saving={connection.saving}
          />
        </details>
        <p className={`transport-note ${connection.state?.transportSecurity === 'secure' ? 'is-secure' : ''}`}>
          {connection.state?.transportSecurity === 'secure' ? 'Secure transport' : 'Acknowledged HTTP transport'}
        </p>
      </aside>

      <section className="content-panel">
        <div
          aria-labelledby={`${activeView}-tab`}
          id={`${activeView}-view`}
          role="tabpanel"
        >
          {activeView === 'providers' ? (
            <ProviderView canWrite={providerWritesEnabled} connected={connected} />
          ) : null}
          {activeView === 'quota' ? <QuotaView connected={connected} /> : null}
          {activeView === 'usage' ? <UsageView connected={connected} /> : null}
        </div>
      </section>
    </main>
  )
}

export default App
