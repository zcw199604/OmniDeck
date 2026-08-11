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
      return '请输入有效的 HTTP 或 HTTPS 基础地址。'
    case 'insecure_transport':
      return '仅允许在已确认的本地或私有连接中使用 HTTP。'
    case 'unauthorized':
      return '管理员令牌未被接受。'
    case 'forbidden':
      return '该令牌不具备所需的管理员访问权限。'
    case 'not_configured':
    case 'credential_missing':
      return '请先连接 CC Hub 实例，再加载管理数据。'
    case 'request_timeout':
      return 'CC Hub 请求超时。'
    case 'network_error':
      return '无法访问 CC Hub 实例。'
    case 'upstream_contract_mismatch':
      return 'CC Hub 响应与受支持的 API 契约不匹配。'
    case 'credential_store_unavailable':
      return '系统凭据存储不可用。'
    default:
      return 'CC Hub 请求无法完成。'
  }
}
