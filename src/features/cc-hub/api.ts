import { invoke } from '@tauri-apps/api/core'
import type {
  CommandError,
  ConnectionState,
  ConnectionTestResult,
  ProviderListInput,
  ProviderPatchResult,
  ProviderRow,
  QuotaUserPage,
  QuotaUsersInput,
  UsageFilterOptions,
  UsageLogPage,
  UsageLogQuery,
} from './types'

export type SaveConnectionInput = {
  baseUrl: string
  adminToken: string
  allowInsecureHttp: boolean
}

export class CcHubApiError extends Error implements CommandError {
  readonly code: string
  readonly status?: number
  readonly errorCode?: string

  constructor({ code, status, errorCode }: CommandError) {
    super(messageForCode(code))
    this.name = 'CcHubApiError'
    this.code = code
    this.status = status
    this.errorCode = errorCode
  }
}

export async function getConnectionState(): Promise<ConnectionState> {
  return invokeCommand('get_cc_hub_connection_state')
}

export async function saveConnection(input: SaveConnectionInput): Promise<ConnectionState> {
  return invokeCommand('save_cc_hub_connection', { input })
}

export async function testConnection(): Promise<ConnectionTestResult> {
  return invokeCommand('test_cc_hub_connection')
}

export async function removeConnection(): Promise<void> {
  return invokeCommand('remove_cc_hub_connection')
}

export async function listProviders(input: ProviderListInput): Promise<ProviderRow[]> {
  return invokeCommand('list_providers', { input })
}

export async function setProviderEnabled(input: {
  providerId: number
  enabled: boolean
}): Promise<ProviderPatchResult> {
  return invokeCommand('set_provider_enabled', { input })
}

export async function listQuotaUsers(input: QuotaUsersInput): Promise<QuotaUserPage> {
  return invokeCommand('list_quota_users', { input })
}

export async function listUsageLogs(input: UsageLogQuery): Promise<UsageLogPage> {
  return invokeCommand('list_usage_logs', { input })
}

export async function getUsageFilterOptions(): Promise<UsageFilterOptions> {
  return invokeCommand('get_usage_filter_options')
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    if (args) {
      return await invoke<T>(command, args)
    }
    return await invoke<T>(command)
  } catch (error) {
    throw toCcHubApiError(error)
  }
}

function toCcHubApiError(error: unknown): CcHubApiError {
  if (error instanceof CcHubApiError) {
    return error
  }

  const record = asRecord(error)
  return new CcHubApiError({
    code: typeof record?.code === 'string' ? record.code : 'command_failed',
    status: typeof record?.status === 'number' ? record.status : undefined,
    errorCode: typeof record?.errorCode === 'string' ? record.errorCode : undefined,
  })
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  return value as Record<string, unknown>
}

export function messageForCode(code: string): string {
  switch (code) {
    case 'invalid_base_url':
      return 'Enter a valid HTTP or HTTPS base URL.'
    case 'insecure_transport':
      return 'HTTP is allowed only for an acknowledged local or private connection.'
    case 'unauthorized':
      return 'The administrator token was not accepted.'
    case 'forbidden':
      return 'The token does not have the required administrator access.'
    case 'not_configured':
    case 'credential_missing':
      return 'Connect a CC Hub instance before loading management data.'
    case 'request_timeout':
      return 'The CC Hub request timed out.'
    case 'network_error':
      return 'The CC Hub instance could not be reached.'
    case 'upstream_contract_mismatch':
      return 'The CC Hub response does not match the supported API contract.'
    case 'credential_store_unavailable':
      return 'The system credential store is unavailable.'
    default:
      return 'The CC Hub request could not be completed.'
  }
}
