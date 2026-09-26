import { describe, expect, it } from 'vitest'
import { hoursLabel } from './backlog'

describe('hoursLabel', () => {
  it('écrit les durées en heures', () => {
    expect(hoursLabel(9_384)).toBe('156 h')
    expect(hoursLabel(45)).toBe('45 min')
    expect(hoursLabel(120_000)).toBe((2000).toLocaleString('fr-FR') + ' h')
  })
})
