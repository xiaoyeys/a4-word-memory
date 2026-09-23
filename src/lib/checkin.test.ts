import { describe, expect, it } from 'vitest'
import { dayKey, monthCalendar, nextSevenDaysDue, studyStreak } from './checkin'

describe('local check-in helpers', () => {
  it('uses a stable local day key and pads month values', () => {
    expect(dayKey(new Date(2026, 0, 5, 12))).toBe('2026-01-05')
  })

  it('calculates a streak across today and yesterday', () => {
    const now = new Date()
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
    expect(studyStreak([
      { status: 'completed', completedAt: now.toISOString() } as never,
      { status: 'completed', completedAt: yesterday.toISOString() } as never,
    ])).toBe(2)
  })

  it('creates a calendar with leading blanks and forecasts due cards', () => {
    const days = monthCalendar(2026, 1)
    expect(days.filter(Boolean)).toHaveLength(28)
    const due = new Date(); due.setHours(0, 0, 0, 0); due.setDate(due.getDate() + 2)
    expect(nextSevenDaysDue([{ wordId: 'one', card: { due } }])[2].count).toBe(1)
  })
})

