import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CcHubApiError,
  getConnectionState,
  removeConnection,
  saveConnection,
  testConnection,
} from './api'
import type { ConnectionState, ConnectionTestResult } from './types'
import type { SaveConnectionInput } from './api'

type ConnectionModel = {
  state: ConnectionState | null
  loading: boolean
  saving: boolean
  error: CcHubApiError | null
  reload: () => Promise<ConnectionState | null>
  save: (input: SaveConnectionInput) => Promise<ConnectionState>
  test: () => Promise<ConnectionTestResult>
  remove: () => Promise<void>
}

export function useConnection(): ConnectionModel {
  const [state, setState] = useState<ConnectionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<CcHubApiError | null>(null)
  const sequence = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      sequence.current += 1
    }
  }, [])

  const reload = useCallback(async (): Promise<ConnectionState | null> => {
    const request = ++sequence.current
    if (mounted.current) {
      setLoading(true)
      setError(null)
    }

    try {
      const nextState = await getConnectionState()
      if (mounted.current && request === sequence.current) {
        setState(nextState)
      }
      return nextState
    } catch (reason) {
      const failure = asApiError(reason)
      if (mounted.current && request === sequence.current) {
        setError(failure)
      }
      return null
    } finally {
      if (mounted.current && request === sequence.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const save = useCallback(async (input: SaveConnectionInput): Promise<ConnectionState> => {
    const request = ++sequence.current
    setSaving(true)
    setError(null)
    try {
      const nextState = await saveConnection(input)
      if (mounted.current && request === sequence.current) {
        setState(nextState)
      }
      return nextState
    } catch (reason) {
      const failure = asApiError(reason)
      if (mounted.current && request === sequence.current) {
        setError(failure)
      }
      throw failure
    } finally {
      if (mounted.current) {
        setSaving(false)
      }
    }
  }, [])

  const test = useCallback(async (): Promise<ConnectionTestResult> => {
    setSaving(true)
    setError(null)
    try {
      return await testConnection()
    } catch (reason) {
      const failure = asApiError(reason)
      if (mounted.current) {
        setError(failure)
      }
      throw failure
    } finally {
      if (mounted.current) {
        setSaving(false)
      }
    }
  }, [])

  const remove = useCallback(async (): Promise<void> => {
    const request = ++sequence.current
    setSaving(true)
    setError(null)
    try {
      await removeConnection()
      if (mounted.current && request === sequence.current) {
        setState({ configured: false, hasToken: false })
      }
    } catch (reason) {
      const failure = asApiError(reason)
      if (mounted.current && request === sequence.current) {
        setError(failure)
      }
      throw failure
    } finally {
      if (mounted.current) {
        setSaving(false)
      }
    }
  }, [])

  return { state, loading, saving, error, reload, save, test, remove }
}

function asApiError(reason: unknown): CcHubApiError {
  if (reason instanceof CcHubApiError) {
    return reason
  }
  return new CcHubApiError({ code: 'command_failed' })
}
