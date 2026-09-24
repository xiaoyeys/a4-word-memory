import { describe, expect, it } from 'vitest'
import type { MemoryFolder, MemoryPaper, StudySession, WordEntry, WordLibrary } from '../types'
import { buildArchiveRecords, libraryFolderId, paperId } from './memoryArchive'

const library = { id: 'cet4', name: '四级词汇', kind: 'builtin', description: '', version: 1, wordCount: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' } as WordLibrary
const word = { id: 'cet4-maintain', libraryId: 'cet4', word: 'maintain', normalizedWord: 'maintain', phonetic: '/meɪnˈteɪn/', partOfSpeech: 'v.', meaning: '维持', createdAt: '2026-01-01' } as WordEntry
const session = {
  id: 'session-1', libraryId: 'cet4', libraryName: '四级词汇', mode: 'daily', placementMode: 'auto', targetCount: 1,
  wordIds: [word.id], placed: [{ wordId: word.id, order: 1, page: 0, x: 100, y: 120, width: 120, height: 45, fontSize: 28 }],
  stage: 'complete', currentWordIndex: 0, repetitions: 3, recallIndex: 1, recallRound: 1, recallLimit: 1,
  revealedMeaning: false, events: [{ id: 'event-1', wordId: word.id, rating: 'remembered', round: 1, createdAt: '2026-09-21T08:01:00.000Z' }],
  metrics: { spellingErrors: 0, answerReveals: 0, spellingSkips: 0, positionHints: 0, sequenceAids: 0 }, spellingForgottenWordIds: [],
  startedAt: '2026-09-21T08:00:00.000Z', updatedAt: '2026-09-21T08:02:00.000Z', completedAt: '2026-09-21T08:02:00.000Z', status: 'completed',
} as StudySession

describe('memory archive synchronization', () => {
  it('creates a default library folder and a complete paper snapshot', () => {
    const result = buildArchiveRecords([library], [word], [session], [], [], '2026-09-22T00:00:00.000Z')
    expect(result.folders[0]).toMatchObject({ id: libraryFolderId(library.id), name: library.name, kind: 'library' })
    expect(result.papers[0]).toMatchObject({ id: paperId(session.id), folderId: libraryFolderId(library.id), favorite: false, removed: false, finalMasteryRate: 1 })
    expect(result.papers[0].words[0]).toEqual({ id: word.id, word: word.word, phonetic: word.phonetic, partOfSpeech: word.partOfSpeech, meaning: word.meaning })
  })

  it('does not recreate or overwrite an existing removed paper', () => {
    const folder = { id: libraryFolderId(library.id) } as MemoryFolder
    const existing = { sourceSessionId: session.id, removed: true, title: '我改过的名称' } as MemoryPaper
    const result = buildArchiveRecords([library], [word], [session], [folder], [existing])
    expect(result.folders).toEqual([])
    expect(result.papers).toEqual([])
  })

  it('only creates a quick-review paper when there are forgotten words', () => {
    const blankReview = { ...session, id: 'review-blank', mode: 'due', methods: [], placed: [] } as StudySession
    const blankResult = buildArchiveRecords([library], [word], [blankReview], [], [], '2026-09-22T00:00:00.000Z')
    expect(blankResult.papers).toEqual([])

    const forgottenReview = { ...session, id: 'review-forgotten', mode: 'due', methods: [] } as StudySession
    const result = buildArchiveRecords([library], [word], [forgottenReview], [], [], '2026-09-22T00:00:00.000Z')
    expect(result.papers).toHaveLength(1)
    expect(result.papers[0]).toMatchObject({ mode: 'due', title: expect.stringContaining('复习错词'), words: [{ id: word.id }] })
  })
})
