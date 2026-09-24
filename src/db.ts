import Dexie, { type EntityTable } from 'dexie'
import type { AppSettings, MemoryFolder, MemoryPaper, StoredCard, StudySession, WordEntry, WordLibrary } from './types'
import { builtinLibraries, loadBuiltinWords } from './data/seed'
import { defaultSettings } from './types'

interface SettingRow {
  key: 'app'
  value: AppSettings
}

class A4Database extends Dexie {
  libraries!: EntityTable<WordLibrary, 'id'>
  words!: EntityTable<WordEntry, 'id'>
  sessions!: EntityTable<StudySession, 'id'>
  cards!: EntityTable<StoredCard, 'wordId'>
  settings!: EntityTable<SettingRow, 'key'>
  memoryFolders!: EntityTable<MemoryFolder, 'id'>
  memoryPapers!: EntityTable<MemoryPaper, 'id'>

  constructor() {
    super('a4-word-memory-v1')
    this.version(1).stores({
      libraries: 'id, kind, updatedAt',
      words: 'id, libraryId, normalizedWord, [libraryId+normalizedWord]',
      sessions: 'id, libraryId, status, startedAt, completedAt',
      cards: 'wordId, lastStudiedAt',
      settings: 'key',
    })
    this.version(2).stores({
      libraries: 'id, kind, updatedAt',
      words: 'id, libraryId, normalizedWord, [libraryId+normalizedWord]',
      sessions: 'id, libraryId, status, startedAt, completedAt',
      cards: 'wordId, lastStudiedAt',
      settings: 'key',
      memoryFolders: 'id, kind, libraryId, order, updatedAt',
      memoryPapers: 'id, sourceSessionId, folderId, libraryId, favorite, removed, completedAt, updatedAt',
    })
  }
}

export const db = new A4Database()

export interface LibraryLoadProgress {
  phase: 'checking' | 'downloading' | 'processing' | 'saving' | 'complete'
  libraryId: string
  libraryName: string
  percent?: number
}

export async function initializeDatabase() {
  await db.transaction('rw', db.libraries, async () => {
    for (const library of builtinLibraries) {
      const existing = await db.libraries.get(library.id)
      await db.libraries.put({
        ...library,
        // Version 0 means the catalog is available but its word data has not been downloaded yet.
        version: existing?.kind === 'builtin' ? existing.version : 0,
        createdAt: existing?.kind === 'builtin' ? existing.createdAt : library.createdAt,
      })
    }
  })
  await db.transaction('rw', db.settings, async () => {
    if (!(await db.settings.get('app'))) {
      await db.settings.put({ key: 'app', value: defaultSettings })
    }
  })
}

export async function ensureBuiltinLibraryLoaded(libraryId: string, onProgress?: (progress: LibraryLoadProgress) => void) {
  const library = builtinLibraries.find((item) => item.id === libraryId)
  if (!library) {
    const stored = await db.libraries.get(libraryId)
    if (stored?.kind === 'custom') return
    throw new Error('没有找到要加载的词书')
  }

  const report = (phase: LibraryLoadProgress['phase'], percent?: number) => onProgress?.({
    phase,
    libraryId: library.id,
    libraryName: library.name,
    percent,
  })
  report('checking', 4)
  const [stored, existingCount] = await Promise.all([
    db.libraries.get(library.id),
    db.words.where('libraryId').equals(library.id).count(),
  ])
  if (stored && stored.version >= library.version && existingCount === library.wordCount) {
    report('complete', 100)
    return
  }

  const existingWords = await db.words.where('libraryId').equals(library.id).toArray()
  const words = await loadBuiltinWords(library, existingWords, (progress) => {
    if (progress.phase === 'downloading') {
      report('downloading', progress.percent === undefined ? undefined : 8 + Math.round(progress.percent * .48))
    } else {
      report('processing', 62)
    }
  })
  report('saving', 78)
  await db.transaction('rw', db.libraries, db.words, async () => {
    await db.words.where('libraryId').equals(library.id).delete()
    await db.words.bulkPut(words)
    await db.libraries.put(library)
  })
  report('complete', 100)
}

export async function getSettings() {
  const stored = (await db.settings.get('app'))?.value
  if (!stored) return defaultSettings
  if (!stored.sequencePreferenceSet) return { ...defaultSettings, ...stored, showSequence: true, sequencePreferenceSet: true }
  return { ...defaultSettings, ...stored }
}

export async function saveSettings(value: AppSettings) {
  await db.settings.put({ key: 'app', value })
}
