import type { RecallRating, StudySession } from '../types'

export function normalizeQuickReviewSession(initial: StudySession): StudySession {
  if (initial.stage === 'complete') return initial
  const legacy = initial.stage !== 'quick-review'
  return {
    ...initial,
    stage: 'quick-review',
    methods: [],
    methodIndex: 0,
    placed: legacy ? [] : initial.placed,
    events: legacy ? [] : initial.events,
    methodEvents: legacy ? [] : initial.methodEvents,
    unmasteredWordIds: legacy ? [] : initial.unmasteredWordIds,
    spellingForgottenWordIds: legacy ? [] : initial.spellingForgottenWordIds,
    spellingErrorWordIds: legacy ? [] : initial.spellingErrorWordIds,
    reviewQueue: initial.reviewQueue?.length ? initial.reviewQueue : [...initial.wordIds],
    reviewIndex: initial.reviewIndex ?? 0,
    reviewAttempts: initial.reviewAttempts ?? {},
    reviewFirstRatings: initial.reviewFirstRatings ?? {},
    revealedMeaning: legacy ? false : initial.revealedMeaning,
  }
}

export function nextReviewQueue(queue: string[], attempts: Record<string, number>, wordId: string, rating: RecallRating) {
  const nextAttempts = { ...attempts }
  const attempt = (nextAttempts[wordId] ?? 0) + 1
  nextAttempts[wordId] = attempt
  const nextQueue = [...queue]
  if (rating !== 'remembered' && attempt < 2) nextQueue.push(wordId)
  return { attempt, attempts: nextAttempts, queue: nextQueue }
}
