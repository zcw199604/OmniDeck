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
            <th scope="col">服务商</th>
            <th scope="col">类型</th>
            <th scope="col">权重 / 优先级</th>
            <th scope="col">状态</th>
            <th scope="col">今日调用</th>
            <th scope="col"><span className="visually-hidden">操作</span></th>
          </tr>
        </thead>
        <tbody>
          {providers.map((provider) => {
            const pending = pendingIds.has(provider.id)
            const nextLabel = provider.isEnabled ? '禁用' : '启用'
            return (
              <tr key={provider.id}>
                <th scope="row">{provider.name}</th>
                <td>{provider.providerType}</td>
                <td>{formatPriority(provider)}</td>
                <td>
                  <span className={`status-badge ${provider.isEnabled ? 'is-enabled' : 'is-disabled'}`}>
                    {provider.isEnabled ? '已启用' : '已禁用'}
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
    return '不可用'
  }
  return `${provider.weight ?? '-'} / ${provider.priority ?? '-'}`
}
