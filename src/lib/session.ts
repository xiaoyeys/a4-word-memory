import { db } from '../db'
import { createEmptyCard } from 'ts-fsrs'
import type { PlacementMode, StudyMode, StudySession, WordEntry, WordLibrary } from '../types'
import { aggregateRating, pickWords, scheduleCard } from './study'

export async function createStudySession(options: {
  library: WordLibrary
  words: WordEntry[]
  mode: StudyMode
  placementMode: PlacementMode
  count: number
  allowRecent: boolean
}) {
  const storedCards = await db.cards.bulkGet(options.words.map((word) => word.id))
  const cards = new Map(storedCards.filter(Boolean).map((card) => [card!.wordId, card!]))
  const selected = pickWords(options.words, cards, options.count, options.mode, options.allowRecent)
  const newWordIds = selected.filter((word) => !cards.has(word.id)).map((word) => word.id)
  const now = new Date().toISOString()
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
    stage: 'learn',
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

export async function finishSession(session: StudySession) {
  const completed = { ...session, stage: 'complete' as const, status: 'completed' as const, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
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
      scheduled.spellingErrorCount = (stored?.spellingErrorCount ?? 0) + (completed.spellingErrorWordIds?.filter((id) => id === wordId).length ?? 0) + (completed.spellingForgottenWordIds.includes(wordId) ? 1 : 0)
      scheduled.important = stored?.important ?? false
      scheduled.confusing = stored?.confusing ?? false
      scheduled.favorite = stored?.favorite ?? false
      await db.cards.put(scheduled)
    }
  })
  return completed
}

/** Persist words genuinely encountered so far without advancing their FSRS schedule. */
export async function savePartialSession(session: StudySession) {
  const now = new Date().toISOString()
  const currentWordId = session.wordIds[session.currentWordIndex]
  const touchedIds = new Set([
    ...session.placed.map((item) => item.wordId),
    ...session.events.map((event) => event.wordId),
    ...(session.spellingErrorWordIds ?? []),
    ...session.spellingForgottenWordIds,
    ...(session.repetitions > 0 || ['spell', 'place', 'relearn'].includes(session.stage) ? [currentWordId] : []),
  ].filter((id): id is string => Boolean(id)))
  const checkpoint = { ...session, updatedAt: now }
  await db.transaction('rw', db.sessions, db.cards, async () => {
    await db.sessions.put(checkpoint)
    for (const wordId of touchedIds) {
      if (await db.cards.get(wordId)) continue
      await db.cards.put({ wordId, card: createEmptyCard(new Date()), lastStudiedAt: now })
    }
  })
  return checkpoint
}
