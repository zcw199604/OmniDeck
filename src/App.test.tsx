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

    expect(screen.getByRole('heading', { name: '连接 CC Hub' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '服务商' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('管理员令牌')).toHaveAttribute('type', 'password')
  })
})
