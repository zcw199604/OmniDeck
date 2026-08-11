export type ConnectionCapabilities = {
  providerTodayCalls: boolean
  providerPatch: boolean
  providerPatchRuntimeVerified: boolean
  quotaUsage: boolean
  usageLogs: boolean
  usageLogStableId: boolean
}

export type ConnectionState = {
  configured: boolean
  hasToken: boolean
  baseUrl?: string
  lastValidatedAt?: number
  apiVersion?: string
  transportSecurity?: 'secure' | 'acknowledged-insecure'
  capabilities?: ConnectionCapabilities
}

export type ConnectionTestResult = {
  apiVersion: string
  adminAccess: boolean
  capabilities: ConnectionCapabilities
}

export type CommandError = {
  code: string
  status?: number
  errorCode?: string
}

export type ProviderRow = {
  id: number
  name: string
  providerType: string
  isEnabled: boolean
  todayCallCount: number
  weight?: number | null
  priority?: number | null
}

export type ProviderPatchResult = {
  isEnabled: boolean
}

export type QuotaBucket = {
  usage: number
  limit: number | null
}

export type RemainingQuotaStatus =
  | 'limited'
  | 'unlimited'
  | 'unavailable'
  | 'exceeded'

export type RemainingQuota = {
  value: number | null
  status: RemainingQuotaStatus
}

export type QuotaUserRow = {
  id: number
  name: string
  role?: string
  isEnabled?: boolean
  total: QuotaBucket
  today: QuotaBucket
  month: QuotaBucket
  remaining: RemainingQuota
}

export type PageInfo = {
  nextCursor?: string | null
  hasMore: boolean
  limit: number
}

export type QuotaUserPage = {
  items: QuotaUserRow[]
  pageInfo: PageInfo
}

export type UsageLogRow = {
  id: number
  occurredAt: string
  providerName?: string
  userName?: string
  keyName?: string
  model?: string
  endpoint?: string
  statusCode?: number
  inputTokens?: number
  outputTokens?: number
  costUsd?: string
}

export type UsageLogPage = {
  items: UsageLogRow[]
  pageInfo: PageInfo
}

export type UsageFilterOptions = {
  models: string[]
  statusCodes: number[]
  endpoints: string[]
  timeZone: string
  currencyDisplay: string
}

export type UsageLogCursor = {
  createdAt: string
  id: number
}

export type UsageLogQuery = {
  limit: number
  cursorCreatedAt?: string
  cursorId?: number
  providerId?: number
  userId?: number
  model?: string
  statusCode?: number
  endpoint?: string
  startTime?: number
  endTime?: number
}

export type ProviderListInput = {
  query?: string
  providerType?: string
  enabled?: boolean
}

export type QuotaUsersInput = {
  cursor?: string
  query?: string
  status?: string
  limit?: number
}
