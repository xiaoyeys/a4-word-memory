import type { StudySession } from '../types'

export function dayKey(value: Date | string = new Date()) {
  const date = typeof value === 'string' ? new Date(value) : new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function startOfDay(value: Date | string = new Date()) {
  const date = typeof value === 'string' ? new Date(value) : new Date(value)
  date.setHours(0, 0, 0, 0)
  return date
}

export function completedSessions(sessions: StudySession[], libraryId?: string) {
  return sessions.filter((session) => session.status === 'completed' && session.completedAt && (!libraryId || session.libraryId === libraryId))
}

export function completedDaySet(sessions: StudySession[], libraryId?: string) {
  return new Set(completedSessions(sessions, libraryId).map((session) => dayKey(session.completedAt!)))
}

export function studyStreak(sessions: StudySession[], libraryId?: string) {
  const days = completedDaySet(sessions, libraryId)
  const cursor = startOfDay()
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function monthCalendar(year = new Date().getFullYear(), month = new Date().getMonth(), days = new Set<string>()) {
  const first = new Date(year, month, 1)
  const count = new Date(year, month + 1, 0).getDate()
  const leading = (first.getDay() + 6) % 7
  return Array.from({ length: leading + count }, (_, index) => {
    if (index < leading) return undefined
    const date = new Date(year, month, index - leading + 1)
    return { date, key: dayKey(date), completed: days.has(dayKey(date)) }
  })
}

export function nextSevenDaysDue(cards: { wordId: string; card: { due: Date | string } }[]) {
  const now = startOfDay()
  const dueByDay = new Map<string, number>()
  cards.forEach((stored) => {
    const due = new Date(stored.card.due)
    const day = startOfDay(due)
    const diff = Math.round((day.getTime() - now.getTime()) / 86400000)
    if (diff >= 0 && diff < 7) dueByDay.set(dayKey(day), (dueByDay.get(dayKey(day)) ?? 0) + 1)
  })
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now)
    date.setDate(date.getDate() + index)
    return { date, key: dayKey(date), count: dueByDay.get(dayKey(date)) ?? 0 }
  })
}
