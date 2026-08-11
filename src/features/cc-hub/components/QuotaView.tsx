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
          <p className="eyebrow">限额</p>
          <h2 id="quota-title">额度管理</h2>
          <p className="view-summary">按用户查看只读的总额度、每日、每月及剩余用量。</p>
        </div>
        <button className="toolbar-button" disabled={quotaModel.loading} onClick={() => void quotaModel.refresh()} type="button">
          {quotaModel.loading ? '加载中…' : '刷新'}
        </button>
      </div>

      <div className="filter-bar" aria-label="额度用户筛选">
        <label>
          用户
          <input
            onChange={(event) => {
              setQuery(event.target.value)
              resetPagination()
            }}
            placeholder="搜索用户"
            type="search"
            value={query}
          />
        </label>
        <label>
          状态
          <select
            onChange={(event) => {
              setStatus(event.target.value)
              resetPagination()
            }}
            value={status}
          >
            <option value="">全部状态</option>
            <option value="enabled">已启用</option>
            <option value="disabled">已禁用</option>
            <option value="active">活跃</option>
            <option value="expired">已过期</option>
          </select>
        </label>
      </div>

      {quotaModel.error ? (
        <div className="state-message error-state" role="alert">
          <strong>额度数据不可用</strong>
          <span>{messageForCode(quotaModel.error.code)}</span>
          <button onClick={() => void quotaModel.refresh()} type="button">重试</button>
        </div>
      ) : quotaModel.loading && !quotaModel.page ? (
        <div className="state-message">正在加载额度用户…</div>
      ) : quotaModel.page?.items.length ? (
        <>
          <QuotaTable items={quotaModel.page.items} />
          <div className="pagination" aria-label="额度分页">
            <span>第 {history.length + 1} 页</span>
            <div>
              <button disabled={history.length === 0 || quotaModel.loading} onClick={previousPage} type="button">上一页</button>
              <button disabled={!quotaModel.page.pageInfo.nextCursor || quotaModel.loading} onClick={nextPage} type="button">下一页</button>
            </div>
          </div>
        </>
      ) : (
        <div className="state-message">没有符合筛选条件的额度用户。</div>
      )}
    </section>
  )
}
