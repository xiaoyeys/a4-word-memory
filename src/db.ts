import Dexie, { type EntityTable } from 'dexie'
import type { AppSettings, StoredCard, StudySession, WordEntry, WordLibrary } from './types'
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

  constructor() {
    super('a4-word-memory-v1')
    this.version(1).stores({
      libraries: 'id, kind, updatedAt',
      words: 'id, libraryId, normalizedWord, [libraryId+normalizedWord]',
      sessions: 'id, libraryId, status, startedAt, completedAt',
      cards: 'wordId, lastStudiedAt',
      settings: 'key',
    })
  }
}

export const db = new A4Database()

export async function initializeDatabase() {
  for (const library of builtinLibraries) {
    const existing = await db.libraries.get(library.id)
    const existingWords = await db.words.where('libraryId').equals(library.id).toArray()
    if (!existing || existing.version < library.version || existingWords.length !== library.wordCount) {
      const words = await loadBuiltinWords(library, existingWords)
      await db.transaction('rw', db.libraries, db.words, async () => {
        await db.libraries.put(library)
        await db.words.where('libraryId').equals(library.id).delete()
        await db.words.bulkPut(words)
      })
    }
  }
  await db.transaction('rw', db.settings, async () => {
    if (!(await db.settings.get('app'))) {
      await db.settings.put({ key: 'app', value: defaultSettings })
    }
  })
}

export async function getSettings() {
  return (await db.settings.get('app'))?.value ?? defaultSettings
}

export async function saveSettings(value: AppSettings) {
  await db.settings.put({ key: 'app', value })
}
