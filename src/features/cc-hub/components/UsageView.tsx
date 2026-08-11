import { useEffect, useMemo, useRef, useState } from 'react'
import { messageForCode } from '../api'
import { getServerTodayRange } from '../timeRange'
import type { UsageLogCursor } from '../types'
import { parseUsageCursor } from '../usageQuery'
import { useUsageFilterOptions } from '../useUsageFilterOptions'
import { useUsageLogs } from '../useUsageLogs'
import UsageTable from './UsageTable'

type UsageViewProps = {
  connected: boolean
}

export default function UsageView({ connected }: UsageViewProps) {
  const [cursor, setCursor] = useState<UsageLogCursor | null>(null)
  const [history, setHistory] = useState<Array<UsageLogCursor | null>>([])
  const [model, setModel] = useState('')
  const [statusCode, setStatusCode] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [providerId, setProviderId] = useState('')
  const [userId, setUserId] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [timeRangeReady, setTimeRangeReady] = useState(!connected)
  const [clock, setClock] = useState(() => Date.now())
  const autoTimeRange = useRef<{ startTime: string; endTime: string } | null>(null)
  const filterOptions = useUsageFilterOptions(connected)
  const timeZone = filterOptions.options?.timeZone

  useEffect(() => {
    if (!connected) {
      return
    }
    const timer = window.setInterval(() => setClock(Date.now()), 10_000)
    return () => window.clearInterval(timer)
  }, [connected])
  const serverToday = useMemo(
    () => timeZone ? getServerTodayRange(timeZone, new Date(clock)) : null,
    [clock, timeZone],
  )

  useEffect(() => {
    if (!connected) {
      autoTimeRange.current = null
      setTimeRangeReady(false)
      return
    }
    if (filterOptions.loading) {
      setTimeRangeReady(false)
      return
    }
    if (serverToday) {
      const nextRange = {
        startTime: String(serverToday.startTime),
        endTime: String(serverToday.endTime),
      }
      const previousRange = autoTimeRange.current
      setStartTime((current) =>
        !current || current === previousRange?.startTime ? nextRange.startTime : current,
      )
      setEndTime((current) =>
        !current || current === previousRange?.endTime ? nextRange.endTime : current,
      )
      autoTimeRange.current = nextRange
    }
    setTimeRangeReady(true)
  }, [connected, filterOptions.loading, serverToday])

  const usageModel = useUsageLogs({
    enabled: connected && timeRangeReady && !filterOptions.loading,
    autoRefresh,
    cursorCreatedAt: cursor?.createdAt,
    cursorId: cursor?.id,
    model,
    endpoint,
    providerId: parseOptionalInteger(providerId),
    userId: parseOptionalInteger(userId),
    statusCode: parseOptionalInteger(statusCode),
    startTime: parseOptionalInteger(startTime),
    endTime: parseOptionalInteger(endTime),
  })
  const nextCursor = parseUsageCursor(usageModel.page?.pageInfo.nextCursor)
  const previousCursor = history.at(-1)

  function resetToLatest() {
    setCursor(null)
    setHistory([])
  }

  function nextPage() {
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
    setCursor(previousCursor ?? null)
    setHistory((current) => current.slice(0, -1))
  }

  return (
    <section className="view-section" aria-labelledby="usage-title">
      <div className="view-heading">
        <div>
          <p className="eyebrow">Audit</p>
          <h2 id="usage-title">Usage details</h2>
          <p className="view-summary">
            Latest records refresh every 10 seconds while this view is visible.
            {filterOptions.options ? ` Server time zone: ${filterOptions.options.timeZone}.` : ''}
          </p>
        </div>
        <div className="view-actions">
          <label className="check-label compact-check">
            <input
              checked={autoRefresh}
              disabled={cursor !== null}
              onChange={(event) => setAutoRefresh(event.target.checked)}
              type="checkbox"
            />
            Auto refresh
          </label>
          <button className="toolbar-button" disabled={usageModel.loading || usageModel.refreshing} onClick={() => void usageModel.refresh()} type="button">
            {usageModel.refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="filter-bar usage-filters" aria-label="Usage log filters">
        <label>
          Provider ID
          <input
            inputMode="numeric"
            onChange={(event) => {
              setProviderId(event.target.value)
              resetToLatest()
            }}
            type="number"
            value={providerId}
          />
        </label>
        <label>
          User ID
          <input
            inputMode="numeric"
            onChange={(event) => {
              setUserId(event.target.value)
              resetToLatest()
            }}
            type="number"
            value={userId}
          />
        </label>
        <label>
          Model
          <select onChange={(event) => { setModel(event.target.value); resetToLatest() }} value={model}>
            <option value="">All models</option>
            {filterOptions.options?.models.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          Status
          <select onChange={(event) => { setStatusCode(event.target.value); resetToLatest() }} value={statusCode}>
            <option value="">All statuses</option>
            {filterOptions.options?.statusCodes.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          Endpoint
          <select onChange={(event) => { setEndpoint(event.target.value); resetToLatest() }} value={endpoint}>
            <option value="">All endpoints</option>
            {filterOptions.options?.endpoints.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label>
          Start (ms)
          <input
            inputMode="numeric"
            onChange={(event) => { setStartTime(event.target.value); resetToLatest() }}
            type="number"
            value={startTime}
          />
        </label>
        <label>
          End (ms)
          <input
            inputMode="numeric"
            onChange={(event) => { setEndTime(event.target.value); resetToLatest() }}
            type="number"
            value={endTime}
          />
        </label>
      </div>

      {filterOptions.error ? <p className="inline-warning">Some filter choices are unavailable.</p> : null}
      {usageModel.error ? (
        <div className="state-message error-state" role="alert">
          <strong>Usage data unavailable</strong>
          <span>{messageForCode(usageModel.error.code)}</span>
          <button onClick={() => void usageModel.refresh()} type="button">Try again</button>
        </div>
      ) : usageModel.loading && !usageModel.page ? (
        <div className="state-message">Loading usage records...</div>
      ) : usageModel.page?.items.length ? (
        <>
          <UsageTable items={usageModel.page.items} />
          {usageModel.page.pageInfo.hasMore && !nextCursor ? (
            <p className="inline-warning">The next cursor is not supported by this contract snapshot.</p>
          ) : null}
          <div className="pagination" aria-label="Usage pagination">
            <span>{usageModel.updatedAt ? `Updated ${new Date(usageModel.updatedAt).toLocaleTimeString()}` : 'Not refreshed yet'}</span>
            <div>
              <button disabled={history.length === 0 || usageModel.loading} onClick={previousPage} type="button">Previous</button>
              <button disabled={!nextCursor || usageModel.loading} onClick={nextPage} type="button">Next</button>
            </div>
          </div>
        </>
      ) : (
        <div className="state-message">No usage records match these filters.</div>
      )}
    </section>
  )
}

function parseOptionalInteger(value: string): number | undefined {
  if (!value.trim()) {
    return undefined
  }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}
