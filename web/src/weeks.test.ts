import { describe, expect, it } from 'vitest'
import {
  isoWeek,
  isValidDate,
  MAX_WEEKS,
  rangeFromSearch,
  rangeOf,
  shiftRange,
  startOfWeek,
  weekCount,
  withFrom,
  withTo,
} from './weeks'

describe('weeks', () => {
  it('treats Monday as the first day and Sunday as the last', () => {
    expect(startOfWeek('2026-01-05')).toBe('2026-01-05') // Monday
    expect(startOfWeek('2026-01-11')).toBe('2026-01-05') // Sunday
    expect(startOfWeek('2026-01-01')).toBe('2025-12-29') // across the year boundary
  })

  it('numbers weeks the ISO way across the year boundary', () => {
    expect(isoWeek('2025-12-29')).toBe(1)
    expect(isoWeek('2026-12-28')).toBe(53)
  })

  it('widens a range to whole weeks', () => {
    expect(rangeOf('2025-12-31', '2026-01-16')).toEqual({ from: '2025-12-29', to: '2026-01-18' })
    expect(weekCount(rangeOf('2025-12-31', '2026-01-16'))).toBe(3)
  })

  it('shifts by whole weeks', () => {
    expect(shiftRange({ from: '2025-12-29', to: '2026-01-18' }, 1)).toEqual({ from: '2026-01-05', to: '2026-01-25' })
  })

  it('pushes the end along when the start moves past it', () => {
    expect(withFrom({ from: '2026-01-05', to: '2026-01-18' }, '2026-02-04')).toEqual({
      from: '2026-02-02',
      to: '2026-02-08',
    })
  })

  it('pulls the start along when the end moves before it', () => {
    expect(withTo({ from: '2026-01-05', to: '2026-01-18' }, '2025-12-01')).toEqual({
      from: '2025-12-01',
      to: '2025-12-07',
    })
  })

  it(`never makes a range wider than ${MAX_WEEKS} weeks`, () => {
    const range = withTo({ from: '2026-01-05', to: '2026-01-18' }, '2027-06-30')
    expect(range.to).toBe('2027-07-04')
    expect(weekCount(range)).toBe(MAX_WEEKS)
  })

  it('rejects half-typed dates from a date input', () => {
    expect(isValidDate('2026-01-05')).toBe(true)
    expect(isValidDate('0002-01-05')).toBe(false)
    expect(isValidDate('2026-02-30')).toBe(false)
    expect(isValidDate('')).toBe(false)
  })

  it('reads a range from the URL and ignores one it cannot use', () => {
    expect(rangeFromSearch('?from=2026-01-07&to=2026-01-14')).toEqual({ from: '2026-01-05', to: '2026-01-18' })
    expect(rangeFromSearch('')).toBeNull()
    expect(rangeFromSearch('?from=2026-01-14&to=2026-01-07')).toBeNull()
    expect(rangeFromSearch('?from=2026-01-05&to=nope')).toBeNull()
    expect(rangeFromSearch('?from=2025-01-06&to=2026-12-31')).toBeNull()
  })
})
