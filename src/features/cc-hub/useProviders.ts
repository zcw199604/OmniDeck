import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CcHubApiError, listProviders, setProviderEnabled } from './api'
import { normalizeProvider } from './normalizers'
import type { ProviderRow } from './types'

type UseProvidersOptions = {
  connected: boolean
  query: string
  providerType: string
  enabled: boolean | undefined
}

type ProvidersModel = {
  providers: ProviderRow[]
  allProviders: ProviderRow[]
  loading: boolean
  error: CcHubApiError | null
  pendingIds: Set<number>
  reload: () => Promise<void>
  setEnabled: (providerId: number, enabled: boolean) => Promise<void>
}

export function useProviders({
  connected,
  query,
  providerType,
  enabled,
}: UseProvidersOptions): ProvidersModel {
  const [allProviders, setAllProviders] = useState<ProviderRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<CcHubApiError | null>(null)
  const [pendingIds, setPendingIds] = useState<Set<number>>(() => new Set())
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  const requestSequence = useRef(0)
  const pendingIdsRef = useRef(new Set<number>())

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  const reload = useCallback(async (): Promise<void> => {
    const request = ++requestSequence.current
    if (!connected) {
      setAllProviders([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const providers = await listProviders({
        query: normalizedText(debouncedQuery),
        providerType: normalizedText(providerType),
      })
      if (request === requestSequence.current) {
        setAllProviders(providers.map(normalizeProvider))
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
  }, [connected, debouncedQuery, providerType])

  useEffect(() => {
    void reload()
    return () => {
      requestSequence.current += 1
    }
  }, [reload])

  const providers = useMemo(
    () => allProviders.filter((provider) => enabled === undefined || provider.isEnabled === enabled),
    [allProviders, enabled],
  )

  const setEnabled = useCallback(async (providerId: number, nextEnabled: boolean): Promise<void> => {
    if (pendingIdsRef.current.has(providerId)) {
      return
    }

    requestSequence.current += 1
    setLoading(false)
    setError(null)
    pendingIdsRef.current.add(providerId)
    setPendingIds(new Set(pendingIdsRef.current))
    try {
      const updated = await setProviderEnabled({ providerId, enabled: nextEnabled })
      setAllProviders((current) =>
        current.map((provider) =>
          provider.id === providerId ? { ...provider, isEnabled: updated.isEnabled } : provider,
        ),
      )
      await reload()
    } catch (reason) {
      setError(asApiError(reason))
    } finally {
      pendingIdsRef.current.delete(providerId)
      setPendingIds(new Set(pendingIdsRef.current))
    }
  }, [reload])

  return { providers, allProviders, loading, error, pendingIds, reload, setEnabled }
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
