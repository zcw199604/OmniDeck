import { useCallback, useEffect, useRef, useState } from 'react'
import { CcHubApiError, listQuotaUsers } from './api'
import type { QuotaUserPage } from './types'

type UseQuotaUsersOptions = {
  connected: boolean
  cursor?: string
  query: string
  status: string
}

type CachedQuotaPage = {
  expiresAt: number
  page: QuotaUserPage
}

type QuotaUsersModel = {
  page: QuotaUserPage | null
  loading: boolean
  error: CcHubApiError | null
  refresh: () => Promise<void>
}

export function useQuotaUsers({ connected, cursor, query, status }: UseQuotaUsersOptions): QuotaUsersModel {
  const [page, setPage] = useState<QuotaUserPage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<CcHubApiError | null>(null)
  const cache = useRef(new Map<string, CachedQuotaPage>())
  const requestSequence = useRef(0)
  const cacheKey = JSON.stringify({ cursor, query: normalizedText(query), status: normalizedText(status) })

  const load = useCallback(async (force: boolean): Promise<void> => {
    const request = ++requestSequence.current
    if (!connected) {
      setPage(null)
      setLoading(false)
      setError(null)
      return
    }

    const cached = cache.current.get(cacheKey)
    if (!force && cached && cached.expiresAt > Date.now()) {
      setPage(cached.page)
      setError(null)
      setLoading(false)
      return
    }

    if (!force) {
      setPage(null)
    }
    setLoading(true)
    setError(null)
    try {
      const nextPage = await listQuotaUsers({
        cursor,
        query: normalizedText(query),
        status: normalizedText(status),
        limit: 25,
      })
      if (request === requestSequence.current) {
        cache.current.set(cacheKey, { page: nextPage, expiresAt: Date.now() + 30_000 })
        setPage(nextPage)
      }
    } catch (reason) {
      if (request === requestSequence.current) {
        setError(asApiError(reason))
      }
    } finally {
      if (request === requestSequence.current) {
        setLoading(false)
      }
    }
  }, [cacheKey, connected, cursor, query, status])

  useEffect(() => {
    void load(false)
    return () => {
      requestSequence.current += 1
    }
  }, [load])

  const refresh = useCallback(async (): Promise<void> => {
    await load(true)
  }, [load])

  return { page, loading, error, refresh }
}

function normalizedText(value: string): string | undefined {
  const normalized = value.trim()
  return normalized || undefined
}

function asApiError(reason: unknown): CcHubApiError {
  if (reason instanceof CcHubApiError) {
    return reason
  }
  return new CcHubApiError({ code: 'command_failed' })
}
