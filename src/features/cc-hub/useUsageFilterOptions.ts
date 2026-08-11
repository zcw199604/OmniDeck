import { useEffect, useRef, useState } from 'react'
import { CcHubApiError, getUsageFilterOptions } from './api'
import type { UsageFilterOptions } from './types'

type UsageFilterOptionsModel = {
  options: UsageFilterOptions | null
  loading: boolean
  error: CcHubApiError | null
}

export function useUsageFilterOptions(connected: boolean): UsageFilterOptionsModel {
  const [options, setOptions] = useState<UsageFilterOptions | null>(null)
  const [loading, setLoading] = useState(connected)
  const [error, setError] = useState<CcHubApiError | null>(null)
  const requestSequence = useRef(0)

  useEffect(() => {
    const request = ++requestSequence.current
    if (!connected) {
      setOptions(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    void getUsageFilterOptions()
      .then((nextOptions) => {
        if (request === requestSequence.current) {
          setOptions(nextOptions)
        }
      })
      .catch((reason: unknown) => {
        if (request === requestSequence.current) {
          setError(asApiError(reason))
        }
      })
      .finally(() => {
        if (request === requestSequence.current) {
          setLoading(false)
        }
      })

    return () => {
      requestSequence.current += 1
    }
  }, [connected])

  return { options, loading, error }
}

function asApiError(reason: unknown): CcHubApiError {
  if (reason instanceof CcHubApiError) {
    return reason
  }
  return new CcHubApiError({ code: 'command_failed' })
}
