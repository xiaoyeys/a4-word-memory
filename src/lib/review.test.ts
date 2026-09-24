import { describe, expect, it } from 'vitest'
import type { StudySession } from '../types'
import { nextReviewQueue, normalizeQuickReviewSession } from './review'

describe('quick review flow', () => {
  it('migrates an unfinished legacy due session into quick review', () => {
    const legacy = { mode: 'due', stage: 'learn', wordIds: ['one', 'two'], placed: [{ wordId: 'one' }], events: [{ wordId: 'one' }], revealedMeaning: true } as StudySession
    expect(normalizeQuickReviewSession(legacy)).toMatchObject({
      stage: 'quick-review', methods: [], reviewQueue: ['one', 'two'], reviewIndex: 0, placed: [], events: [], revealedMeaning: false,
    })
  })

  it('requeues a fuzzy or forgotten word only once', () => {
    const first = nextReviewQueue(['one', 'two'], {}, 'one', 'fuzzy')
    expect(first.queue).toEqual(['one', 'two', 'one'])
    const second = nextReviewQueue(first.queue, first.attempts, 'one', 'forgotten')
    expect(second.queue).toEqual(['one', 'two', 'one'])
    expect(second.attempt).toBe(2)
  })

  it('does not requeue a remembered word', () => {
    expect(nextReviewQueue(['one'], {}, 'one', 'remembered').queue).toEqual(['one'])
  })
})
