import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listProvidersMock = vi.hoisted(() => vi.fn())
const setProviderEnabledMock = vi.hoisted(() => vi.fn())

vi.mock('./api', () => ({
  listProviders: listProvidersMock,
  setProviderEnabled: setProviderEnabledMock,
}))

import { useProviders } from './useProviders'

describe('useProviders', () => {
  beforeEach(() => {
    listProvidersMock.mockReset()
    setProviderEnabledMock.mockReset()
  })

  it('sends only confirmed server filters and applies enabled state locally', async () => {
    listProvidersMock.mockResolvedValue([
      { id: 101, name: 'Primary', providerType: 'anthropic', isEnabled: true, todayCallCount: 37 },
      { id: 102, name: 'Standby', providerType: 'openai', isEnabled: false, todayCallCount: 0 },
    ])

    const { result } = renderHook(() =>
      useProviders({ connected: true, query: '', providerType: 'anthropic', enabled: true }),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(listProvidersMock).toHaveBeenCalledWith({ query: undefined, providerType: 'anthropic' })
    expect(result.current.providers).toEqual([
      expect.objectContaining({ id: 101, todayCallCount: 37 }),
    ])
  })

  it('uses the returned isEnabled value after a single row toggle', async () => {
    listProvidersMock
      .mockResolvedValueOnce([
        { id: 101, name: 'Primary', providerType: 'anthropic', isEnabled: true, todayCallCount: 37 },
      ])
      .mockResolvedValueOnce([
        { id: 101, name: 'Primary', providerType: 'anthropic', isEnabled: false, todayCallCount: 37 },
      ])
    setProviderEnabledMock.mockResolvedValue({ isEnabled: false })

    const { result } = renderHook(() =>
      useProviders({ connected: true, query: '', providerType: '', enabled: undefined }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.setEnabled(101, false)
    })

    expect(setProviderEnabledMock).toHaveBeenCalledWith({ providerId: 101, enabled: false })
    expect(result.current.providers[0]?.isEnabled).toBe(false)
    expect(result.current.pendingIds.has(101)).toBe(false)
  })
})
