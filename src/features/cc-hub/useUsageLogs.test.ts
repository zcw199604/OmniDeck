import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const listUsageLogsMock = vi.hoisted(() => vi.fn())

vi.mock('./api', () => ({
  listUsageLogs: listUsageLogsMock,
}))

import { useUsageLogs } from './useUsageLogs'

describe('useUsageLogs', () => {
  beforeEach(() => {
    vi.useRealTimers()
    listUsageLogsMock.mockReset()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  it('refreshes only the visible latest page at ten-second intervals without overlap', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined
    listUsageLogsMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveFirst = resolve
      }),
    )
    listUsageLogsMock.mockResolvedValue({
      items: [{ id: 2, occurredAt: '2026-08-10T08:02:00.000Z' }],
      pageInfo: { hasMore: false, limit: 25 },
    })

    vi.useFakeTimers()
    renderHook(() => useUsageLogs({ enabled: true, autoRefresh: true }))

    expect(listUsageLogsMock).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(listUsageLogsMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveFirst?.({
        items: [{ id: 1, occurredAt: '2026-08-10T08:01:00.000Z' }],
        pageInfo: { hasMore: false, limit: 25 },
      })
      await Promise.resolve()
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(listUsageLogsMock).toHaveBeenCalledTimes(2)
  })

  it('discards a response from an old filter generation', async () => {
    let resolveOld: ((value: unknown) => void) | undefined
    listUsageLogsMock.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveOld = resolve
      }),
    )
    listUsageLogsMock.mockResolvedValueOnce({
      items: [{ id: 22, occurredAt: '2026-08-10T08:22:00.000Z' }],
      pageInfo: { hasMore: false, limit: 25 },
    })

    const { result, rerender } = renderHook(
      ({ model }) => useUsageLogs({ enabled: true, model, autoRefresh: false }),
      { initialProps: { model: 'old-model' } },
    )

    rerender({ model: 'new-model' })
    await act(async () => {
      await Promise.resolve()
    })
    expect(listUsageLogsMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      resolveOld?.({
        items: [{ id: 11, occurredAt: '2026-08-10T08:11:00.000Z' }],
        pageInfo: { hasMore: false, limit: 25 },
      })
      await Promise.resolve()
    })

    expect(result.current.page?.items[0]?.id).toBe(22)
  })
})
