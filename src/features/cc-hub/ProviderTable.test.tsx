import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ProviderTable from './components/ProviderTable'

describe('ProviderTable', () => {
  it('renders the confirmed today call count and locks an in-flight row', () => {
    render(
      <ProviderTable
        onSetEnabled={vi.fn()}
        pendingIds={new Set([101])}
        canToggle
        providers={[
          {
            id: 101,
            name: 'Primary',
            providerType: 'anthropic',
            isEnabled: true,
            todayCallCount: 37,
          },
        ]}
      />,
    )

    expect(screen.getByText('37')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '禁用 Primary' })).toBeDisabled()
  })
  it('keeps provider writes disabled until live PATCH verification is recorded', () => {
    render(
      <ProviderTable
        onSetEnabled={vi.fn()}
        pendingIds={new Set()}
        canToggle={false}
        providers={[
          {
            id: 202,
            name: 'Secondary',
            providerType: 'anthropic',
            isEnabled: false,
            todayCallCount: 0,
          },
        ]}
      />,
    )

    expect(screen.getByRole('switch', { name: '启用 Secondary' })).toBeDisabled()
  })
  it('enables a verified provider write when the row is not pending', () => {
    render(
      <ProviderTable
        onSetEnabled={vi.fn()}
        pendingIds={new Set()}
        canToggle
        providers={[
          {
            id: 303,
            name: 'Verified',
            providerType: 'anthropic',
            isEnabled: false,
            todayCallCount: 0,
          },
        ]}
      />,
    )

    expect(screen.getByRole('switch', { name: '启用 Verified' })).toBeEnabled()
  })
})
