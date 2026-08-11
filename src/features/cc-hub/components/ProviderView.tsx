import { useMemo, useState } from 'react'
import { messageForCode } from '../api'
import { useProviders } from '../useProviders'
import ProviderTable from './ProviderTable'

type ProviderViewProps = {
  connected: boolean
  canWrite: boolean
}

export default function ProviderView({ connected, canWrite }: ProviderViewProps) {
  const [query, setQuery] = useState('')
  const [providerType, setProviderType] = useState('')
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const providersModel = useProviders({
    connected,
    query,
    providerType,
    enabled: enabledFilter === 'all' ? undefined : enabledFilter === 'enabled',
  })
  const providerTypes = useMemo(
    () => Array.from(new Set(providersModel.allProviders.map((provider) => provider.providerType))).sort(),
    [providersModel.allProviders],
  )

  return (
    <section className="view-section" aria-labelledby="providers-title">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Operations</p>
          <h2 id="providers-title">Providers</h2>
          <p className="view-summary">Manage provider availability and inspect today&apos;s confirmed call count.</p>
        </div>
        <button className="toolbar-button" disabled={providersModel.loading} onClick={() => void providersModel.reload()} type="button">
          {providersModel.loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="filter-bar" aria-label="Provider filters">
        <label>
          Name
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search providers"
            type="search"
            value={query}
          />
        </label>
        <label>
          Type
          <select onChange={(event) => setProviderType(event.target.value)} value={providerType}>
            <option value="">All types</option>
            {providerTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label>
          Status
          <select
            onChange={(event) => setEnabledFilter(event.target.value as 'all' | 'enabled' | 'disabled')}
            value={enabledFilter}
          >
            <option value="all">All statuses</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
      </div>
      {!canWrite ? (
        <p className="inline-warning">Provider write controls are disabled pending reversible PATCH verification.</p>
      ) : null}

      {providersModel.error ? (
        <div className="state-message error-state" role="alert">
          <strong>Provider data unavailable</strong>
          <span>{messageForCode(providersModel.error.code)}</span>
          <button onClick={() => void providersModel.reload()} type="button">Try again</button>
        </div>
      ) : providersModel.loading && providersModel.providers.length === 0 ? (
        <div className="state-message">Loading providers...</div>
      ) : providersModel.providers.length === 0 ? (
        <div className="state-message">No providers match these filters.</div>
      ) : (
        <ProviderTable
          canToggle={canWrite}
          onSetEnabled={(providerId, enabled) => providersModel.setEnabled(providerId, enabled)}
          pendingIds={providersModel.pendingIds}
          providers={providersModel.providers}
        />
      )}
    </section>
  )
}
