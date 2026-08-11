import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import UsageTable from './components/UsageTable'

describe('UsageTable', () => {
  it('uses the stable record id for rows and only renders fields present in the DTO', () => {
    render(
      <UsageTable
        items={[
          {
            id: 401,
            occurredAt: '2026-08-10T08:01:00.000Z',
            providerName: 'Primary',
            model: 'claude-test',
            endpoint: 'anthropic-messages',
            statusCode: 200,
            inputTokens: 1000,
            outputTokens: 200,
            costUsd: '0.123000',
          },
        ]}
      />,
    )

    expect(screen.getByRole('row', { name: /primary.*claude-test/i })).toHaveAttribute('data-log-id', '401')
    expect(screen.getByRole('columnheader', { name: '费用' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: '密钥' })).not.toBeInTheDocument()
  })
})
