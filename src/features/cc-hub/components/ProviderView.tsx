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
          <p className="eyebrow">运营</p>
          <h2 id="providers-title">服务商</h2>
          <p className="view-summary">管理服务商可用状态，并查看今日已确认的调用次数。</p>
        </div>
        <button className="toolbar-button" disabled={providersModel.loading} onClick={() => void providersModel.reload()} type="button">
          {providersModel.loading ? '加载中…' : '刷新'}
        </button>
      </div>

      <div className="filter-bar" aria-label="服务商筛选">
        <label>
          名称
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索服务商"
            type="search"
            value={query}
          />
        </label>
        <label>
          类型
          <select onChange={(event) => setProviderType(event.target.value)} value={providerType}>
            <option value="">全部类型</option>
            {providerTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label>
          状态
          <select
            onChange={(event) => setEnabledFilter(event.target.value as 'all' | 'enabled' | 'disabled')}
            value={enabledFilter}
          >
            <option value="all">全部状态</option>
            <option value="enabled">已启用</option>
            <option value="disabled">已禁用</option>
          </select>
        </label>
      </div>
      {!canWrite ? (
        <p className="inline-warning">服务商写入控制已禁用，等待可逆的 PATCH 验证通过。</p>
      ) : null}

      {providersModel.error ? (
        <div className="state-message error-state" role="alert">
          <strong>服务商数据不可用</strong>
          <span>{messageForCode(providersModel.error.code)}</span>
          <button onClick={() => void providersModel.reload()} type="button">重试</button>
        </div>
      ) : providersModel.loading && providersModel.providers.length === 0 ? (
        <div className="state-message">正在加载服务商…</div>
      ) : providersModel.providers.length === 0 ? (
        <div className="state-message">没有符合筛选条件的服务商。</div>
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
