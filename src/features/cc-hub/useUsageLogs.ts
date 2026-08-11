import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CcHubApiError, listUsageLogs } from './api'
import type { UsageLogPage, UsageLogQuery } from './types'
import { buildUsageLogQuery } from './usageQuery'

type UseUsageLogsOptions = Partial<Omit<UsageLogQuery, 'limit'>> & {
  enabled: boolean
  limit?: number
  autoRefresh: boolean
}

type UsageLogsModel = {
  page: UsageLogPage | null
  updatedAt: number | null
  loading: boolean
  refreshing: boolean
  error: CcHubApiError | null
  refresh: () => Promise<void>
}

export function useUsageLogs({
  enabled,
  limit = 25,
  autoRefresh,
  cursorCreatedAt,
  cursorId,
  providerId,
  userId,
  model,
  statusCode,
  endpoint,
  startTime,
  endTime,
}: UseUsageLogsOptions): UsageLogsModel {
  const [usagePage, setUsagePage] = useState<UsageLogPage | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<CcHubApiError | null>(null)
  const generation = useRef(0)
  const activeRequest = useRef<number | null>(null)
  const requestSequence = useRef(0)

  const query = useMemo(
    () => buildUsageLogQuery({
      limit,
      cursorCreatedAt,
      cursorId,
      providerId,
      userId,
      model,
      statusCode,
      endpoint,
      startTime,
      endTime,
    }),
    [cursorCreatedAt, cursorId, endTime, endpoint, limit, model, providerId, startTime, statusCode, userId],
  )
  const latestPage = cursorCreatedAt === undefined && cursorId === undefined

  const requestPage = useCallback(async (polling: boolean): Promise<void> => {
    if (!enabled || (polling && (!latestPage || document.hidden))) {
      return
    }
    if (activeRequest.current !== null) {
      return
    }

    const request = ++requestSequence.current
    const expectedGeneration = generation.current
    activeRequest.current = request
    if (polling) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const nextPage = await listUsageLogs(query)
      if (generation.current === expectedGeneration) {
        setUsagePage(nextPage)
        setUpdatedAt(Date.now())
      }
    } catch (reason) {
      if (generation.current === expectedGeneration) {
        setError(asApiError(reason))
      }
    } finally {
      if (activeRequest.current === request) {
        activeRequest.current = null
      }
      if (generation.current === expectedGeneration) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [enabled, latestPage, query])

  useEffect(() => {
    generation.current += 1
    activeRequest.current = null
    if (!enabled) {
      setUsagePage(null)
      setUpdatedAt(null)
      setLoading(false)
      setRefreshing(false)
      setError(null)
      return
    }

    setUsagePage(null)
    setUpdatedAt(null)
    void requestPage(false)
    return () => {
      generation.current += 1
      activeRequest.current = null
    }
  }, [enabled, requestPage])

  useEffect(() => {
    if (!enabled || !autoRefresh || !latestPage) {
      return
    }

    const timer = window.setInterval(() => {
      void requestPage(true)
    }, 10_000)
    const refreshWhenVisible = () => {
      if (!document.hidden) {
        void requestPage(true)
      }
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [autoRefresh, enabled, latestPage, requestPage])

  const refresh = useCallback(async (): Promise<void> => {
    generation.current += 1
    activeRequest.current = null
    await requestPage(false)
  }, [requestPage])

  return { page: usagePage, updatedAt, loading, refreshing, error, refresh }
}

function asApiError(reason: unknown): CcHubApiError {
  if (reason instanceof CcHubApiError) {
    return reason
  }
  return new CcHubApiError({ code: 'command_failed' })
}
