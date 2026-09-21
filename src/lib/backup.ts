import { db } from '../db'
import type { AppSettings, StoredCard, StudySession, WordEntry, WordLibrary } from '../types'

const BACKUP_VERSION = 1

interface BackupPayload {
  product: 'A4词忆'
  version: number
  exportedAt: string
  libraries: WordLibrary[]
  words: WordEntry[]
  sessions: StudySession[]
  cards: StoredCard[]
  settings: Array<{ key: 'app'; value: AppSettings }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function validDate(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

async function buildBackup(): Promise<BackupPayload> {
  return {
    product: 'A4词忆',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    libraries: await db.libraries.toArray(),
    words: await db.words.toArray(),
    sessions: await db.sessions.toArray(),
    cards: await db.cards.toArray(),
    settings: await db.settings.toArray(),
  }
}

function downloadPayload(payload: BackupPayload, suffix = '') {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `A4词忆-${suffix ? `${suffix}-` : ''}备份-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0)
}

export async function exportBackup() {
  const payload = await buildBackup()
  downloadPayload(payload)
  return payload.exportedAt
}

export async function inspectBackup(file: File) {
  const data: unknown = JSON.parse(await file.text())
  if (!isRecord(data)) throw new Error('备份文件结构不完整')
  if (data.product !== 'A4词忆' || data.version !== BACKUP_VERSION) throw new Error('备份文件版本不兼容')
  if (![data.libraries, data.words, data.sessions, data.cards, data.settings].every(Array.isArray)) throw new Error('备份文件结构不完整')
  if (!validDate(data.exportedAt)) throw new Error('备份时间无效')
  const libraries = data.libraries as unknown[]
  const words = data.words as unknown[]
  const sessions = data.sessions as unknown[]
  const cards = data.cards as unknown[]
  const settings = data.settings as unknown[]
  if (!libraries.every((item) => isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.wordCount === 'number')) throw new Error('备份中的词库数据无效')
  if (!words.every((item) => isRecord(item) && typeof item.id === 'string' && typeof item.libraryId === 'string' && typeof item.word === 'string' && typeof item.meaning === 'string')) throw new Error('备份中的词条数据无效')
  if (!sessions.every((item) => isRecord(item) && typeof item.id === 'string' && typeof item.libraryId === 'string' && Array.isArray(item.wordIds) && Array.isArray(item.events))) throw new Error('备份中的学习记录无效')
  if (!cards.every((item) => isRecord(item) && typeof item.wordId === 'string' && isRecord(item.card) && validDate(item.card.due))) throw new Error('备份中的复习排程无效')
  if (!settings.every((item) => isRecord(item) && item.key === 'app' && isRecord(item.value))) throw new Error('备份中的设置无效')
  return data as unknown as BackupPayload
}

export async function restoreBackup(data: BackupPayload) {
  downloadPayload(await buildBackup(), '恢复前')
  await db.transaction('rw', db.libraries, db.words, db.sessions, db.cards, db.settings, async () => {
    await Promise.all([db.libraries.clear(), db.words.clear(), db.sessions.clear(), db.cards.clear(), db.settings.clear()])
    await db.libraries.bulkPut(data.libraries)
    await db.words.bulkPut(data.words)
    await db.sessions.bulkPut(data.sessions)
    await db.cards.bulkPut(data.cards)
    await db.settings.bulkPut(data.settings)
  })
}
