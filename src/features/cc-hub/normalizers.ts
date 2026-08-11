import type {
  ProviderRow,
  QuotaBucket,
  RemainingQuota,
  UsageLogRow,
} from './types'

export function normalizeProvider(provider: ProviderRow): ProviderRow {
  return {
    id: provider.id,
    name: provider.name,
    providerType: provider.providerType,
    isEnabled: provider.isEnabled,
    todayCallCount: provider.todayCallCount,
    weight: provider.weight,
    priority: provider.priority,
  }
}

export function deriveRemainingQuota(bucket: QuotaBucket): RemainingQuota {
  if (!Number.isFinite(bucket.usage)) {
    return { value: null, status: 'unavailable' }
  }

  if (bucket.limit === null) {
    return { value: null, status: 'unlimited' }
  }

  if (!Number.isFinite(bucket.limit) || bucket.limit < 0) {
    return { value: null, status: 'unavailable' }
  }

  if (bucket.usage > bucket.limit) {
    return { value: 0, status: 'exceeded' }
  }

  return { value: bucket.limit - bucket.usage, status: 'limited' }
}

export type NormalizedUsageLog = UsageLogRow & {
  stableKey: string
}

export function normalizeUsageLog(log: UsageLogRow): NormalizedUsageLog {
  return {
    id: log.id,
    occurredAt: log.occurredAt,
    providerName: log.providerName,
    userName: log.userName,
    keyName: log.keyName,
    model: log.model,
    endpoint: log.endpoint,
    statusCode: log.statusCode,
    inputTokens: log.inputTokens,
    outputTokens: log.outputTokens,
    costUsd: log.costUsd,
    stableKey: String(log.id),
  }
}
