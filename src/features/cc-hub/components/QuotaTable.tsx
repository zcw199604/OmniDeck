import type { QuotaUserRow } from '../types'

type QuotaTableProps = {
  items: QuotaUserRow[]
}

export default function QuotaTable({ items }: QuotaTableProps) {
  return (
    <div className="table-scroll">
      <table className="data-table quota-table">
        <thead>
          <tr>
            <th scope="col">用户</th>
            <th scope="col">已用</th>
            <th scope="col">总量</th>
            <th scope="col">今日</th>
            <th scope="col">本月</th>
            <th scope="col">剩余</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <th scope="row">
                {item.name}
                {item.role ? <span className="secondary-cell">{item.role}</span> : null}
              </th>
              <td>{formatNumber(item.total.usage)}</td>
              <td>{item.total.limit === null ? '无限' : formatNumber(item.total.limit)}</td>
              <td>{formatNumber(item.today.usage)}</td>
              <td>{formatNumber(item.month.usage)}</td>
              <td>{formatRemaining(item.remaining.value, item.remaining.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : '不可用'
}

function formatRemaining(
  value: number | null,
  status: 'limited' | 'unlimited' | 'unavailable' | 'exceeded',
) {
  if (status === 'unlimited') {
    return <span>无限</span>
  }
  if (status === 'unavailable') {
    return <span>不可用</span>
  }
  if (status === 'exceeded') {
    return <><span>{formatNumber(value ?? 0)}</span> <span className="status-warning">已超出</span></>
  }
  return formatNumber(value ?? 0)
}
