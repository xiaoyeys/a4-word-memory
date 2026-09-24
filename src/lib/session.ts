import { db } from '../db'
import { createEmptyCard } from 'ts-fsrs'
import type { PlacementMode, StudyMethod, StudyMode, StudySession, WordEntry, WordLibrary } from '../types'
import { aggregateRating, isLearnedCard, pickWords, scheduleCard } from './study'

export async function createStudySession(options: {
  library: WordLibrary
  words: WordEntry[]
  mode: StudyMode
  placementMode: PlacementMode
  count: number
  allowRecent: boolean
  methods?: StudyMethod[]
  methodGroupSize?: number
  dictationGroupSize?: number
  randomSpellCheck?: boolean
  scatterRepetitions?: number
  scatterRecallBatchSize?: number
}) {
  const storedCards = await db.cards.bulkGet(options.words.map((word) => word.id))
  const cards = new Map(storedCards.filter(Boolean).map((card) => [card!.wordId, card!]))
  const selected = pickWords(options.words, cards, options.count, options.mode, options.allowRecent)
  const newWordIds = selected.filter((word) => !cards.get(word.id)?.pendingDictation && !isLearnedCard(cards.get(word.id))).map((word) => word.id)
  const now = new Date().toISOString()
  const methods: StudyMethod[] = options.mode === 'due' ? [] : options.methods?.length ? options.methods : ['scatter']
  const firstMethod = methods[0]
  const session: StudySession = {
    id: crypto.randomUUID(),
    libraryId: options.library.id,
    libraryName: options.library.name,
    mode: options.mode,
    placementMode: options.placementMode,
    targetCount: selected.length,
    wordIds: selected.map((word) => word.id),
    newWordIds,
    placed: [],
    stage: options.mode === 'due' ? 'quick-review' : firstMethod === 'match' ? 'match' : firstMethod === 'dictation' ? 'dictation' : 'learn',
    methods,
    methodIndex: 0,
    methodGroupSize: options.methodGroupSize ?? 8,
    dictationGroupSize: options.dictationGroupSize ?? 10,
    randomSpellCheck: options.randomSpellCheck ?? true,
    scatterRepetitions: options.scatterRepetitions ?? 3,
    scatterRecallBatchSize: options.scatterRecallBatchSize ?? 3,
    methodProgress: {},
    reviewQueue: options.mode === 'due' ? selected.map((word) => word.id) : undefined,
    reviewIndex: options.mode === 'due' ? 0 : undefined,
    reviewAttempts: options.mode === 'due' ? {} : undefined,
    reviewFirstRatings: options.mode === 'due' ? {} : undefined,
    currentWordIndex: 0,
    repetitions: 0,
    recallIndex: 0,
    recallRound: 0,
    recallLimit: 0,
    revealedMeaning: false,
    events: [],
    metrics: { spellingErrors: 0, answerReveals: 0, spellingSkips: 0, positionHints: 0, sequenceAids: 0 },
    spellingForgottenWordIds: [],
    spellingErrorWordIds: [],
    startedAt: now,
    updatedAt: now,
    status: 'active',
  }
  await db.sessions.add(session)
  return session
}

export async function createQuickReviewRetry(source: StudySession, wordIds: string[]) {
  const now = new Date().toISOString()
  const session: StudySession = {
    ...source,
    id: crypto.randomUUID(),
    targetCount: wordIds.length,
    wordIds,
    newWordIds: [],
    placed: [],
    stage: 'quick-review',
    methods: [],
    methodIndex: 0,
    methodProgress: {},
    methodEvents: [],
    unmasteredWordIds: [],
    reviewQueue: [...wordIds],
    reviewIndex: 0,
    reviewAttempts: {},
    reviewFirstRatings: {},
    currentWordIndex: 0,
    repetitions: 0,
    recallIndex: 0,
    recallRound: 0,
    recallLimit: 0,
    selectedRecallWordId: undefined,
    revealedMeaning: false,
    preview: undefined,
    events: [],
    metrics: { spellingErrors: 0, answerReveals: 0, spellingSkips: 0, positionHints: 0, sequenceAids: 0 },
    spellingForgottenWordIds: [],
    spellingErrorWordIds: [],
    startedAt: now,
    updatedAt: now,
    activeSeconds: 0,
    completedAt: undefined,
    status: 'active',
  }
  await db.sessions.add(session)
  return session
}

export async function finishSession(session: StudySession) {
  const completed = { ...session, events: [...session.events, ...(session.methodEvents ?? [])], stage: 'complete' as const, status: 'completed' as const, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  await db.transaction('rw', db.sessions, db.cards, async () => {
    await db.sessions.put(completed)
    for (const wordId of completed.wordIds) {
      const events = completed.events.filter((event) => event.wordId === wordId)
      if (!events.length && !completed.spellingForgottenWordIds.includes(wordId)) continue
      const stored = await db.cards.get(wordId)
      const scheduled = scheduleCard(stored, aggregateRating(events, completed.spellingForgottenWordIds.includes(wordId)))
      scheduled.wordId = wordId
      scheduled.forgetCount = (stored?.forgetCount ?? 0) + events.filter((event) => event.rating === 'forgotten').length
      scheduled.fuzzyCount = (stored?.fuzzyCount ?? 0) + events.filter((event) => event.rating === 'fuzzy').length
      scheduled.spellingErrorCount = (stored?.spellingErrorCount ?? 0) + (completed.spellingErrorWordIds?.filter((id) => id === wordId).length ?? 0) + (completed.spellingForgottenWordIds.includes(wordId) ? 1 : 0) + (completed.methodProgress?.dictationErrors?.[wordId] ?? 0)
      scheduled.important = stored?.important ?? false
      scheduled.confusing = stored?.confusing ?? false
      scheduled.favorite = stored?.favorite ?? false
      const unmastered = Boolean(completed.unmasteredWordIds?.includes(wordId) || (completed.methods?.length && completed.spellingForgottenWordIds.includes(wordId)))
      scheduled.pendingDictation = unmastered
      scheduled.learnedAt = stored?.learnedAt ?? (!unmastered && events.length ? completed.completedAt : undefined)
      await db.cards.put(scheduled)
    }
  })
  return completed
}

/** Persist words genuinely encountered so far without advancing their FSRS schedule. */
export async function savePartialSession(session: StudySession) {
  const now = new Date().toISOString()
  const touchedIds = new Set(session.events.map((event) => event.wordId))
  const checkpoint = { ...session, updatedAt: now }
  await db.transaction('rw', db.sessions, db.cards, async () => {
    await db.sessions.put(checkpoint)
    for (const wordId of touchedIds) {
      const stored = await db.cards.get(wordId)
      if (stored) {
        await db.cards.update(wordId, { lastStudiedAt: now, learnedAt: stored.learnedAt ?? (session.methods && session.methods.length > 1 ? undefined : now) })
      } else {
        await db.cards.put({ wordId, card: createEmptyCard(new Date()), lastStudiedAt: now, learnedAt: session.methods && session.methods.length > 1 ? undefined : now })
      }
    }
  })
  return checkpoint
}
