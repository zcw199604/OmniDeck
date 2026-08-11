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
            <th scope="col">时间</th>
            <th scope="col">服务商</th>
            {hasUser ? <th scope="col">用户</th> : null}
            {hasKey ? <th scope="col">密钥</th> : null}
            <th scope="col">模型</th>
            <th scope="col">接口</th>
            <th scope="col">状态</th>
            {hasTokens ? <th scope="col">Token 数</th> : null}
            {hasCost ? <th scope="col">费用</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr data-log-id={String(item.id)} key={item.id}>
              <td>{formatTime(item.occurredAt)}</td>
              <td>{item.providerName ?? '不可用'}</td>
              {hasUser ? <td>{item.userName ?? '不可用'}</td> : null}
              {hasKey ? <td>{item.keyName ?? '不可用'}</td> : null}
              <td>{item.model ?? '不可用'}</td>
              <td>{item.endpoint ?? '不可用'}</td>
              <td>{item.statusCode ?? '不可用'}</td>
              {hasTokens ? <td>{formatTokens(item)}</td> : null}
              {hasCost ? <td>{item.costUsd ?? '不可用'}</td> : null}
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
    return '不可用'
  }
  return `${item.inputTokens?.toLocaleString() ?? '-'} 入 / ${item.outputTokens?.toLocaleString() ?? '-'} 出`
}
