import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./features/cc-hub/useConnection', () => ({
  useConnection: () => ({
    state: { configured: false, hasToken: false },
    loading: false,
    saving: false,
    error: null,
    reload: vi.fn(),
    save: vi.fn(),
    test: vi.fn(),
    remove: vi.fn(),
  }),
}))

import App from './App'

describe('App', () => {
  it('shows only the protected connection setup before management data can load', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Connect CC Hub' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Providers' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Admin token')).toHaveAttribute('type', 'password')
  })
})
