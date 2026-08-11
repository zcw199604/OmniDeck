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
            <th scope="col">User</th>
            <th scope="col">Used</th>
            <th scope="col">Total</th>
            <th scope="col">Today</th>
            <th scope="col">This month</th>
            <th scope="col">Remaining</th>
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
              <td>{item.total.limit === null ? 'Unlimited' : formatNumber(item.total.limit)}</td>
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
  return Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 4 }) : 'Unavailable'
}

function formatRemaining(
  value: number | null,
  status: 'limited' | 'unlimited' | 'unavailable' | 'exceeded',
) {
  if (status === 'unlimited') {
    return <span>Unlimited</span>
  }
  if (status === 'unavailable') {
    return <span>Unavailable</span>
  }
  if (status === 'exceeded') {
    return <><span>{formatNumber(value ?? 0)}</span> <span className="status-warning">Exceeded</span></>
  }
  return formatNumber(value ?? 0)
}
