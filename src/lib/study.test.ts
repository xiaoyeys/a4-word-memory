import { describe, expect, it, vi } from 'vitest'
import { Rating, createEmptyCard } from 'ts-fsrs'
import type { RecallEvent, StoredCard, WordEntry } from '../types'
import { aggregateRating, estimateWordBox, isValidPlacement, normalizeWord, pickWords, scheduleCard } from './study'

const event = (rating: RecallEvent['rating'], index: number): RecallEvent => ({
  id: String(index), wordId: 'word-1', rating, round: 1, createdAt: new Date(2026, 0, index + 1).toISOString(),
})

const word = (id: string): WordEntry => ({ id, libraryId: 'lib', word: id, normalizedWord: id, meaning: id, createdAt: '2026-01-01T00:00:00.000Z' })

describe('study rules', () => {
  it('normalizes case and edge whitespace without changing punctuation', () => {
    expect(normalizeWord('  Well-Being  ')).toBe('well-being')
  })

  it('aggregates short-term recall into one conservative FSRS rating', () => {
    expect(aggregateRating([event('remembered', 0)], false)).toBe(Rating.Good)
    expect(aggregateRating([event('fuzzy', 0), event('remembered', 1)], false)).toBe(Rating.Hard)
    expect(aggregateRating([event('forgotten', 0), event('remembered', 1)], false)).toBe(Rating.Hard)
    expect(aggregateRating([event('forgotten', 0)], false)).toBe(Rating.Again)
    expect(aggregateRating([event('remembered', 0)], true)).toBe(Rating.Hard)
  })

  it('rejects overlapping and out-of-page placements', () => {
    const box = estimateWordBox('maintain', 1)
    const placed = [{ wordId: 'a', order: 1, page: 0, x: 100, y: 100, ...box }]
    expect(isValidPlacement({ page: 0, x: 110, y: 110, ...box }, placed)).toBe(false)
    expect(isValidPlacement({ page: 0, x: 500, y: 500, ...box }, placed)).toBe(true)
    expect(isValidPlacement({ page: 0, x: -1, y: 500, ...box }, placed)).toBe(false)
    expect(isValidPlacement({ page: 1, x: 100, y: 100, ...box }, placed)).toBe(true)
  })

  it('prioritizes unseen words when random mode excludes recent repeats', () => {
    vi.spyOn(Math, 'random').mockReturnValue(.5)
    const words = ['new-a', 'new-b', 'old', 'recent'].map(word)
    const card = createEmptyCard(new Date(Date.now() + 86400000))
    const cards = new Map<string, StoredCard>([
      ['old', { wordId: 'old', card, lastStudiedAt: new Date(Date.now() - 5 * 86400000).toISOString() }],
      ['recent', { wordId: 'recent', card, lastStudiedAt: new Date().toISOString() }],
    ])
    expect(pickWords(words, cards, 2, 'random', false).map((item) => item.id).sort()).toEqual(['new-a', 'new-b'])
  })

  it('advances an FSRS card and produces a future due date', () => {
    const now = new Date('2026-09-20T10:00:00.000Z')
    const result = scheduleCard(undefined, Rating.Good, now)
    expect(new Date(result.card.due).getTime()).toBeGreaterThan(now.getTime())
    expect(result.lastStudiedAt).toBe(now.toISOString())
  })
})
