import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

import {
  CcHubApiError,
  getConnectionState,
  saveConnection,
  testConnection,
} from './api'

describe('CC Hub invoke API', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('uses a fixed command and keeps the transient token out of the returned state', async () => {
    invokeMock.mockResolvedValue({
      configured: true,
      hasToken: true,
      baseUrl: 'https://hub.example.invalid',
    })

    const state = await saveConnection({
      baseUrl: 'https://hub.example.invalid',
      adminToken: 'transient-test-token',
      allowInsecureHttp: false,
    })

    expect(invokeMock).toHaveBeenCalledWith('save_cc_hub_connection', {
      input: {
        baseUrl: 'https://hub.example.invalid',
        adminToken: 'transient-test-token',
        allowInsecureHttp: false,
      },
    })
    expect(state).not.toHaveProperty('adminToken')
    expect(state.hasToken).toBe(true)
  })

  it('maps structured command failures without exposing upstream detail', async () => {
    invokeMock.mockRejectedValue({
      code: 'forbidden',
      status: 403,
      errorCode: 'auth.forbidden',
      detail: 'secret upstream detail',
    })

    await expect(testConnection()).rejects.toMatchObject({
      code: 'forbidden',
      status: 403,
      errorCode: 'auth.forbidden',
    })
    await expect(testConnection()).rejects.not.toHaveProperty('detail')
    await expect(testConnection()).rejects.toSatisfy(
      (error: unknown) => error instanceof CcHubApiError && !error.message.includes('secret'),
    )
  })

  it('does not make a second request when reading a connection state', async () => {
    invokeMock.mockResolvedValue({ configured: false, hasToken: false })

    await getConnectionState()

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('get_cc_hub_connection_state')
  })
})
