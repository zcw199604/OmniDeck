import type { UsageLogRow } from '../types'

type UsageTableProps = {
  items: UsageLogRow[]
}

export default function UsageTable({ items }: UsageTableProps) {
  const hasUser = items.some((item) => item.userName !== undefined)
  const hasKey = items.some((item) => item.keyName !== undefined)
  const hasTokens = items.some((item) => item.inputTokens !== undefined || item.outputTokens !== undefined)
  const hasCost = items.some((item) => item.costUsd !== undefined)

  return (
    <div className="table-scroll">
      <table className="data-table usage-table">
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">Provider</th>
            {hasUser ? <th scope="col">User</th> : null}
            {hasKey ? <th scope="col">Key</th> : null}
            <th scope="col">Model</th>
            <th scope="col">Endpoint</th>
            <th scope="col">Status</th>
            {hasTokens ? <th scope="col">Tokens</th> : null}
            {hasCost ? <th scope="col">Cost</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr data-log-id={String(item.id)} key={item.id}>
              <td>{formatTime(item.occurredAt)}</td>
              <td>{item.providerName ?? 'Unavailable'}</td>
              {hasUser ? <td>{item.userName ?? 'Unavailable'}</td> : null}
              {hasKey ? <td>{item.keyName ?? 'Unavailable'}</td> : null}
              <td>{item.model ?? 'Unavailable'}</td>
              <td>{item.endpoint ?? 'Unavailable'}</td>
              <td>{item.statusCode ?? 'Unavailable'}</td>
              {hasTokens ? <td>{formatTokens(item)}</td> : null}
              {hasCost ? <td>{item.costUsd ?? 'Unavailable'}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatTime(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString()
}

function formatTokens(item: UsageLogRow): string {
  if (item.inputTokens === undefined && item.outputTokens === undefined) {
    return 'Unavailable'
  }
  return `${item.inputTokens?.toLocaleString() ?? '-'} in / ${item.outputTokens?.toLocaleString() ?? '-'} out`
}
