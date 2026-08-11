import type { ProviderRow } from '../types'

type ProviderTableProps = {
  providers: ProviderRow[]
  pendingIds: Set<number>
  canToggle: boolean
  onSetEnabled: (providerId: number, enabled: boolean) => Promise<void> | void
}

export default function ProviderTable({
  providers,
  pendingIds,
  canToggle,
  onSetEnabled,
}: ProviderTableProps) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Provider</th>
            <th scope="col">Type</th>
            <th scope="col">Weight / priority</th>
            <th scope="col">Status</th>
            <th scope="col">Today calls</th>
            <th scope="col"><span className="visually-hidden">Controls</span></th>
          </tr>
        </thead>
        <tbody>
          {providers.map((provider) => {
            const pending = pendingIds.has(provider.id)
            const nextLabel = provider.isEnabled ? 'Disable' : 'Enable'
            return (
              <tr key={provider.id}>
                <th scope="row">{provider.name}</th>
                <td>{provider.providerType}</td>
                <td>{formatPriority(provider)}</td>
                <td>
                  <span className={`status-badge ${provider.isEnabled ? 'is-enabled' : 'is-disabled'}`}>
                    {provider.isEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </td>
                <td>{provider.todayCallCount.toLocaleString()}</td>
                <td className="table-action">
                  <input
                    aria-label={`${nextLabel} ${provider.name}`}
                    checked={provider.isEnabled}
                    disabled={pending || !canToggle}
                    onChange={(event) => void onSetEnabled(provider.id, event.target.checked)}
                    role="switch"
                    type="checkbox"
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function formatPriority(provider: ProviderRow): string {
  if (provider.weight == null && provider.priority == null) {
    return 'Unavailable'
  }
  return `${provider.weight ?? '-'} / ${provider.priority ?? '-'}`
}
