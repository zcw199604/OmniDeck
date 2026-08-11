import { describe, expect, it } from 'vitest'
import {
  deriveRemainingQuota,
  normalizeProvider,
  normalizeUsageLog,
} from './normalizers'

describe('CC Hub normalizers', () => {
  it('maps the confirmed provider todayCallCount field without counting log rows', () => {
    const provider = normalizeProvider({
      id: 101,
      name: 'Primary Claude',
      providerType: 'anthropic',
      isEnabled: true,
      todayCallCount: 37,
    })

    expect(provider.todayCallCount).toBe(37)
    expect(provider.isEnabled).toBe(true)
  })

  it('derives an exceeded quota without exposing a negative remaining value', () => {
    expect(deriveRemainingQuota({ usage: 12, limit: 10 })).toEqual({
      value: 0,
      status: 'exceeded',
    })
  })

  it('distinguishes an explicit unlimited bucket from an unavailable bucket', () => {
    expect(deriveRemainingQuota({ usage: 12, limit: null })).toEqual({
      value: null,
      status: 'unlimited',
    })
    expect(deriveRemainingQuota({ usage: Number.NaN, limit: 10 })).toEqual({
      value: null,
      status: 'unavailable',
    })
  })

  it('uses the stable numeric usage log id as the row key', () => {
    const log = normalizeUsageLog({
      id: 401,
      occurredAt: '2026-08-10T08:01:00.000Z',
      providerName: 'Primary Claude',
      model: 'claude-test',
      endpoint: 'anthropic-messages',
      statusCode: 200,
      costUsd: '0.123000',
    })

    expect(log.stableKey).toBe('401')
    expect(log.occurredAt).toBe('2026-08-10T08:01:00.000Z')
  })
})
