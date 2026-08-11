import type { UsageLogCursor, UsageLogQuery } from './types'

type UsageLogQueryInput = UsageLogQuery

export function buildUsageLogQuery(input: UsageLogQueryInput): UsageLogQuery {
  const query: UsageLogQuery = {
    limit: input.limit,
  }

  if (isNonNegativeInteger(input.cursorId)) {
    query.cursorId = input.cursorId
  }
  const cursorCreatedAt = normalizedText(input.cursorCreatedAt)
  if (cursorCreatedAt) {
    query.cursorCreatedAt = cursorCreatedAt
  }
  if (isNonNegativeInteger(input.providerId)) {
    query.providerId = input.providerId
  }
  if (isNonNegativeInteger(input.userId)) {
    query.userId = input.userId
  }
  if (isNonNegativeInteger(input.statusCode)) {
    query.statusCode = input.statusCode
  }
  if (isNonNegativeInteger(input.startTime)) {
    query.startTime = input.startTime
  }
  if (isNonNegativeInteger(input.endTime)) {
    query.endTime = input.endTime
  }

  const model = normalizedText(input.model)
  if (model) {
    query.model = model
  }
  const endpoint = normalizedText(input.endpoint)
  if (endpoint) {
    query.endpoint = endpoint
  }

  return query
}

export function parseUsageCursor(value: string | null | undefined): UsageLogCursor | null {
  if (!value) {
    return null
  }
  const separator = value.lastIndexOf('|')
  if (separator <= 0 || separator === value.length - 1) {
    return null
  }
  const createdAt = value.slice(0, separator)
  const id = Number(value.slice(separator + 1))
  if (!createdAt || !Number.isSafeInteger(id) || id < 0) {
    return null
  }
  return { createdAt, id }
}

function normalizedText(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized || undefined
}

function isNonNegativeInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 0
}
