import { describe, expect, it } from 'vitest'
import { getServerTodayRange } from './timeRange'

describe('getServerTodayRange', () => {
  it('uses the server calendar day instead of the browser local day', () => {
    expect(getServerTodayRange('UTC', new Date('2026-08-10T12:00:00.000Z'))).toEqual({
      startTime: Date.UTC(2026, 7, 10, 0, 0, 0),
      endTime: Date.UTC(2026, 7, 10, 23, 59, 59, 999),
    })

    expect(getServerTodayRange('Asia/Shanghai', new Date('2026-08-10T12:00:00.000Z'))).toEqual({
      startTime: Date.UTC(2026, 7, 9, 16, 0, 0),
      endTime: Date.UTC(2026, 7, 10, 15, 59, 59, 999),
    })
  })

  it('returns no range for an unsupported time zone', () => {
    expect(getServerTodayRange('Not/A-Time-Zone', new Date())).toBeNull()
  })
})
