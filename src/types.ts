import type { Card } from 'ts-fsrs'

export type LibraryKind = 'builtin' | 'custom'
export type StudyMode = 'daily' | 'random' | 'weak' | 'due'
export type PlacementMode = 'manual' | 'auto'
export type RecallRating = 'remembered' | 'fuzzy' | 'forgotten'
export type StudyMethod = 'scatter' | 'match' | 'dictation'
export type StudyStage = 'learn' | 'spell' | 'place' | 'recall' | 'relearn' | 'match' | 'dictation' | 'quick-review' | 'complete'

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
  learnedAt?: string
  forgetCount?: number
  fuzzyCount?: number
  spellingErrorCount?: number
  important?: boolean
  confusing?: boolean
  favorite?: boolean
  pendingDictation?: boolean
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
  method?: StudyMethod
}

export interface SessionMetrics {
  spellingErrors: number
  answerReveals: number
  spellingSkips: number
  positionHints: number
  sequenceAids: number
}

export interface MethodProgress {
  matchOrder?: string[]
  matchedWordIds?: string[]
  matchErrors?: Record<string, number>
  matchSelectedWordId?: string
  matchSelectedSide?: 'word' | 'meaning'
  matchMeaningOrder?: string[]
  matchDirection?: 'en-zh' | 'zh-en'
  matchGroupIndex?: number
  dictationOrder?: string[]
  dictationQueue?: string[]
  dictationAttemptedWordIds?: string[]
  dictationBatchWordIds?: string[]
  dictationAnswers?: Record<string, string>
  dictationMeaningAnswers?: Record<string, string>
  dictationSecondWordAnswers?: Record<string, string>
  dictationSecondMeaningAnswers?: Record<string, string>
  dictationPhase?: 3 | 4 | 5 | 6
  dictationPhaseCorrectIds?: Record<string, string[]>
  dictationCorrectWordIds?: string[]
  dictationGradeCorrectIds?: string[]
  dictationOverrides?: Record<string, boolean>
  dictationErrors?: Record<string, number>
  dictationConfirmedWordIds?: string[]
  dictationIndex?: number
  dictationMeaningTest?: boolean
  dictationRoundComplete?: boolean
}

export interface StudySession {
  id: string
  libraryId: string
  libraryName: string
  mode: StudyMode
  methods?: StudyMethod[]
  methodIndex?: number
  methodProgress?: MethodProgress
  methodEvents?: RecallEvent[]
  methodGroupSize?: number
  dictationGroupSize?: number
  randomSpellCheck?: boolean
  scatterRepetitions?: number
  scatterRecallBatchSize?: number
  unmasteredWordIds?: string[]
  reviewQueue?: string[]
  reviewIndex?: number
  reviewAttempts?: Record<string, number>
  reviewFirstRatings?: Record<string, RecallRating>
  placementMode: PlacementMode
  targetCount: number
  wordIds: string[]
  newWordIds?: string[]
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
  spellingErrorWordIds?: string[]
  startedAt: string
  updatedAt: string
  activeSeconds?: number
  completedAt?: string
  status: 'active' | 'completed' | 'abandoned'
}

export interface MemoryFolder {
  id: string
  name: string
  kind: 'library' | 'custom'
  libraryId?: string
  order: number
  createdAt: string
  updatedAt: string
}

export interface MemoryWordSnapshot {
  id: string
  word: string
  phonetic?: string
  partOfSpeech?: string
  meaning: string
}

export interface MemoryPaper {
  id: string
  sourceSessionId: string
  folderId: string
  libraryId: string
  libraryName: string
  title: string
  favorite: boolean
  removed: boolean
  placed: PlacedWord[]
  words: MemoryWordSnapshot[]
  completedAt: string
  firstRecallRate: number
  finalMasteryRate: number
  createdAt: string
  updatedAt: string
  methods?: StudyMethod[]
  methodEvents?: RecallEvent[]
  methodProgress?: MethodProgress
  unmasteredWordIds?: string[]
  mode?: StudyMode
}

export interface AppSettings {
  accent: 'en-US' | 'en-GB'
  fontScale: number
  defaultPlacement: PlacementMode
  allowRecentRepeat: boolean
  showSequence: boolean
  sequencePreferenceSet: boolean
  onboardingDone: boolean
  backupReminderShown: boolean
  lastBackupAt?: string
  currentLibraryId?: string
  dailyNewWordTarget: number
  soundEffects: boolean
  repetitionsPerWord: number
  recallBatchSize: number
  paperTheme: 'plain' | 'grid' | 'ruled'
  showPhonetic: boolean
  showPartOfSpeech: boolean
  showMeaning: boolean
  autoSpeak: boolean
  speechRate: number
  reminderEnabled: boolean
  reminderTime: string
  showStudyHints: boolean
  lastStudyMethods?: StudyMethod[]
  lastMethodGroupSize?: number
  lastDictationGroupSize?: number
  lastRandomSpellCheck?: boolean
  lastScatterRepetitions?: number
  lastScatterRecallBatchSize?: number
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
  showSequence: true,
  sequencePreferenceSet: false,
  onboardingDone: false,
  backupReminderShown: false,
  dailyNewWordTarget: 30,
  soundEffects: true,
  repetitionsPerWord: 3,
  recallBatchSize: 3,
  paperTheme: 'plain',
  showPhonetic: true,
  showPartOfSpeech: true,
  showMeaning: true,
  autoSpeak: true,
  speechRate: 1,
  reminderEnabled: false,
  reminderTime: '20:00',
  showStudyHints: true,
}
