import { describe, expect, it, vi } from 'vitest'
import { Rating, createEmptyCard } from 'ts-fsrs'
import type { RecallEvent, StoredCard, WordEntry } from '../types'
import { aggregateRating, dailyPlan, estimateWordBox, isLearnedCard, isValidPlacement, normalizeWord, pickWords, scheduleCard } from './study'

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

  it('prioritizes unseen words after due and weak words in random mode', () => {
    vi.spyOn(Math, 'random').mockReturnValue(.5)
    const words = ['new-a', 'new-b', 'old', 'recent'].map(word)
    const card = createEmptyCard(new Date(Date.now() + 86400000))
    const cards = new Map<string, StoredCard>([
      ['old', { wordId: 'old', card, learnedAt: new Date(Date.now() - 5 * 86400000).toISOString(), lastStudiedAt: new Date(Date.now() - 5 * 86400000).toISOString() }],
      ['recent', { wordId: 'recent', card, learnedAt: new Date().toISOString(), lastStudiedAt: new Date().toISOString() }],
    ])
    expect(pickWords(words, cards, 2, 'random', false).map((item) => item.id).sort()).toEqual(['new-a', 'new-b'])
  })

  it('always schedules due words before new words', () => {
    const words = ['new-a', 'due', 'new-b'].map(word)
    const dueCard = createEmptyCard(new Date(Date.now() - 86400000))
    const cards = new Map<string, StoredCard>([['due', { wordId: 'due', card: dueCard, learnedAt: new Date(Date.now() - 5 * 86400000).toISOString(), lastStudiedAt: new Date(Date.now() - 5 * 86400000).toISOString() }]])
    expect(pickWords(words, cards, 1, 'random', false).map((item) => item.id)).toEqual(['due'])
  })

  it('builds a daily plan from all due words plus the fixed new-word target', () => {
    const words = ['new-a', 'new-b', 'due'].map(word)
    const dueCard = createEmptyCard(new Date(Date.now() - 86400000))
    const cards = new Map<string, StoredCard>([['due', { wordId: 'due', card: dueCard, learnedAt: '2026-09-20T10:00:00.000Z' }]])
    expect(dailyPlan(words, cards, 1)).toEqual({ dueCount: 1, availableNewCount: 2, newCount: 1, totalCount: 2 })
    expect(pickWords(words, cards, 1, 'daily', false).map((item) => item.id)).toContain('due')
    expect(pickWords(words, cards, 1, 'daily', false)).toHaveLength(2)
  })

  it('does not count a favorite-only empty card as learned', () => {
    const card = createEmptyCard(new Date())
    expect(isLearnedCard({ wordId: 'favorite', card, favorite: true })).toBe(false)
    expect(isLearnedCard({ wordId: 'learned', card, learnedAt: '2026-09-20T10:00:00.000Z' })).toBe(true)
  })

  it('advances an FSRS card and produces a future due date', () => {
    const now = new Date('2026-09-20T10:00:00.000Z')
    const result = scheduleCard(undefined, Rating.Good, now)
    expect(new Date(result.card.due).getTime()).toBeGreaterThan(now.getTime())
    expect(result.lastStudiedAt).toBe(now.toISOString())
  })

  it('uses accumulated active study time instead of wall-clock time for a resumed session', async () => {
    const { summaryFor } = await import('./study')
    const session = {
      id: 'session', libraryId: 'lib', libraryName: 'Test', mode: 'random', placementMode: 'manual', targetCount: 1,
      wordIds: ['one'], placed: [], stage: 'learn', currentWordIndex: 0, repetitions: 0, recallIndex: 0, recallRound: 0,
      recallLimit: 0, revealedMeaning: false, events: [], metrics: { spellingErrors: 0, answerReveals: 0, spellingSkips: 0, positionHints: 0, sequenceAids: 0 },
      spellingForgottenWordIds: [], startedAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T12:00:00.000Z',
      completedAt: '2026-09-20T12:00:00.000Z', activeSeconds: 125, status: 'completed',
    } as const
    expect(summaryFor(session as never).durationMinutes).toBe(2)
  })
})
