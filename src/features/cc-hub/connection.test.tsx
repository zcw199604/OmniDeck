import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./useConnection', () => ({
  useConnection: () => ({
    state: { configured: false, hasToken: false },
    loading: false,
    saving: false,
    error: null,
    save: vi.fn(),
    test: vi.fn(),
    remove: vi.fn(),
  }),
}))

import ConnectionSettings from './components/ConnectionSettings'

describe('ConnectionSettings', () => {
  it('does not echo a token value in the connection form', () => {
    render(
      <ConnectionSettings
        initialBaseUrl=""
        initialAllowInsecureHttp={false}
        connected={false}
        saving={false}
        error={null}
        onSave={vi.fn()}
        onTest={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    const token = screen.getByLabelText('Admin token')
    expect(token).toHaveAttribute('type', 'password')
    expect(token).toHaveValue('')
    expect(screen.queryByText(/transient-test-token|secret upstream detail/i)).not.toBeInTheDocument()
  })
})
