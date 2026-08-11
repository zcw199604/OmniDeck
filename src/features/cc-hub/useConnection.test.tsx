import { StrictMode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getConnectionStateMock = vi.hoisted(() => vi.fn())

vi.mock('./api', () => ({
  CcHubApiError: class CcHubApiError extends Error {},
  getConnectionState: getConnectionStateMock,
  removeConnection: vi.fn(),
  saveConnection: vi.fn(),
  testConnection: vi.fn(),
}))

import { useConnection } from './useConnection'

function ConnectionProbe() {
  const connection = useConnection()
  return <span>{connection.loading ? 'loading' : connection.state?.configured ? 'configured' : 'ready'}</span>
}

describe('useConnection', () => {
  beforeEach(() => {
    getConnectionStateMock.mockReset()
  })

  it('settles the initial state when effects are replayed by StrictMode', async () => {
    getConnectionStateMock.mockResolvedValue({ configured: false, hasToken: false })

    render(
      <StrictMode>
        <ConnectionProbe />
      </StrictMode>,
    )

    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument())
  })
})
