import type { Card } from 'ts-fsrs'

export type LibraryKind = 'builtin' | 'custom'
export type StudyMode = 'random' | 'weak' | 'due'
export type PlacementMode = 'manual' | 'auto'
export type RecallRating = 'remembered' | 'fuzzy' | 'forgotten'
export type StudyStage = 'learn' | 'spell' | 'place' | 'recall' | 'relearn' | 'complete'

export interface WordEntry {
  id: string
  libraryId: string
  word: string
  normalizedWord: string
  phonetic?: string
  partOfSpeech?: string
  meaning: string
  createdAt: string
}

export interface WordLibrary {
  id: string
  name: string
  kind: LibraryKind
  description: string
  version: number
  wordCount: number
  createdAt: string
  updatedAt: string
}

export interface StoredCard {
  wordId: string
  card: Card
  lastStudiedAt?: string
}

export interface PlacedWord {
  wordId: string
  order: number
  page: number
  x: number
  y: number
  width: number
  height: number
  fontSize: number
}

export interface RecallEvent {
  id: string
  wordId: string
  rating: RecallRating
  round: number
  createdAt: string
}

export interface SessionMetrics {
  spellingErrors: number
  answerReveals: number
  spellingSkips: number
  positionHints: number
  sequenceAids: number
}

export interface StudySession {
  id: string
  libraryId: string
  libraryName: string
  mode: StudyMode
  placementMode: PlacementMode
  targetCount: number
  wordIds: string[]
  placed: PlacedWord[]
  stage: StudyStage
  currentWordIndex: number
  repetitions: number
  recallIndex: number
  recallRound: number
  recallLimit: number
  selectedRecallWordId?: string
  revealedMeaning: boolean
  preview?: Omit<PlacedWord, 'wordId' | 'order'>
  events: RecallEvent[]
  metrics: SessionMetrics
  spellingForgottenWordIds: string[]
  startedAt: string
  updatedAt: string
  completedAt?: string
  status: 'active' | 'completed' | 'abandoned'
}

export interface AppSettings {
  accent: 'en-US' | 'en-GB'
  fontScale: number
  defaultPlacement: PlacementMode
  allowRecentRepeat: boolean
  showSequence: boolean
  onboardingDone: boolean
}

export interface SessionSummary {
  sessionId: string
  totalWords: number
  firstRecallRate: number
  finalMasteryRate: number
  remembered: number
  fuzzy: number
  forgotten: number
  durationMinutes: number
}

export const defaultSettings: AppSettings = {
  accent: 'en-US',
  fontScale: 1,
  defaultPlacement: 'manual',
  allowRecentRepeat: false,
  showSequence: false,
  onboardingDone: false,
}
