import { useEffect, useState } from 'react'
import { messageForCode } from '../api'
import { useQuotaUsers } from '../useQuotaUsers'
import QuotaTable from './QuotaTable'

type QuotaViewProps = {
  connected: boolean
}

export default function QuotaView({ connected }: QuotaViewProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [cursor, setCursor] = useState<string | undefined>()
  const [history, setHistory] = useState<Array<string | undefined>>([])
  const [debouncedQuery, setDebouncedQuery] = useState(query)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(timer)
  }, [query])
  const quotaModel = useQuotaUsers({ connected, cursor, query: debouncedQuery, status })
  const previousCursor = history.at(-1)

  function resetPagination() {
    setCursor(undefined)
    setHistory([])
  }

  function nextPage() {
    const nextCursor = quotaModel.page?.pageInfo.nextCursor
    if (!nextCursor) {
      return
    }
    setHistory((current) => [...current, cursor])
    setCursor(nextCursor)
  }

  function previousPage() {
    if (history.length === 0) {
      return
    }
    setCursor(previousCursor)
    setHistory((current) => current.slice(0, -1))
  }

  return (
    <section className="view-section" aria-labelledby="quota-title">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Limits</p>
          <h2 id="quota-title">Quota management</h2>
          <p className="view-summary">Read-only total, daily, monthly, and remaining usage by user.</p>
        </div>
        <button className="toolbar-button" disabled={quotaModel.loading} onClick={() => void quotaModel.refresh()} type="button">
          {quotaModel.loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      <div className="filter-bar" aria-label="Quota user filters">
        <label>
          User
          <input
            onChange={(event) => {
              setQuery(event.target.value)
              resetPagination()
            }}
            placeholder="Search users"
            type="search"
            value={query}
          />
        </label>
        <label>
          Status
          <select
            onChange={(event) => {
              setStatus(event.target.value)
              resetPagination()
            }}
            value={status}
          >
            <option value="">All statuses</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
          </select>
        </label>
      </div>

      {quotaModel.error ? (
        <div className="state-message error-state" role="alert">
          <strong>Quota data unavailable</strong>
          <span>{messageForCode(quotaModel.error.code)}</span>
          <button onClick={() => void quotaModel.refresh()} type="button">Try again</button>
        </div>
      ) : quotaModel.loading && !quotaModel.page ? (
        <div className="state-message">Loading quota users...</div>
      ) : quotaModel.page?.items.length ? (
        <>
          <QuotaTable items={quotaModel.page.items} />
          <div className="pagination" aria-label="Quota pagination">
            <span>Page {history.length + 1}</span>
            <div>
              <button disabled={history.length === 0 || quotaModel.loading} onClick={previousPage} type="button">Previous</button>
              <button disabled={!quotaModel.page.pageInfo.nextCursor || quotaModel.loading} onClick={nextPage} type="button">Next</button>
            </div>
          </div>
        </>
      ) : (
        <div className="state-message">No quota users match these filters.</div>
      )}
    </section>
  )
}
