import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import QuotaTable from './components/QuotaTable'

describe('QuotaTable', () => {
  it('keeps an unlimited total distinct from an exceeded remaining total', () => {
    render(
      <QuotaTable
        items={[
          {
            id: 201,
            name: 'Unlimited user',
            total: { usage: 5, limit: null },
            today: { usage: 1, limit: null },
            month: { usage: 5, limit: null },
            remaining: { value: null, status: 'unlimited' },
          },
          {
            id: 202,
            name: 'Exceeded user',
            total: { usage: 12, limit: 10 },
            today: { usage: 2, limit: 5 },
            month: { usage: 12, limit: 10 },
            remaining: { value: 0, status: 'exceeded' },
          },
        ]}
      />,
    )

    expect(screen.getAllByText('无限')).toHaveLength(2)
    expect(screen.getByText('已超出')).toBeInTheDocument()
    expect(screen.getAllByText('0')).toHaveLength(1)
  })
})
