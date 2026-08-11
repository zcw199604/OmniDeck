import { describe, expect, it } from 'vitest'
import { buildUsageLogQuery, parseUsageCursor } from './usageQuery'

describe('usage log query contract', () => {
  it('uses cursor pagination and millisecond time filters only', () => {
    expect(
      buildUsageLogQuery({
        limit: 25,
        cursorCreatedAt: '2026-08-10T08:00:00.000Z',
        cursorId: 400,
        model: 'claude-test',
        statusCode: 200,
        startTime: 1000,
        endTime: 2000,
      }),
    ).toEqual({
      limit: 25,
      cursorCreatedAt: '2026-08-10T08:00:00.000Z',
      cursorId: 400,
      model: 'claude-test',
      statusCode: 200,
      startTime: 1000,
      endTime: 2000,
    })
  })

  it('parses the confirmed nextCursor fixture shape without inventing a fallback', () => {
    expect(parseUsageCursor('2026-08-10T08:00:00.000Z|400')).toEqual({
      createdAt: '2026-08-10T08:00:00.000Z',
      id: 400,
    })
    expect(parseUsageCursor('opaque-cursor')).toBeNull()
  })

  it('omits empty filters instead of sending arbitrary query keys', () => {
    expect(buildUsageLogQuery({ limit: 25, model: '  ' })).toEqual({ limit: 25 })
  })
})
