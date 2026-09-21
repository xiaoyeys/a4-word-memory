import { db } from '../db'

const BACKUP_VERSION = 1

export async function exportBackup() {
  const payload = {
    product: 'A4词忆',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    libraries: await db.libraries.toArray(),
    words: await db.words.toArray(),
    sessions: await db.sessions.toArray(),
    cards: await db.cards.toArray(),
    settings: await db.settings.toArray(),
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `A4词忆-备份-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(link.href)
}

export async function inspectBackup(file: File) {
  const data = JSON.parse(await file.text())
  if (data.product !== 'A4词忆' || data.version !== BACKUP_VERSION) throw new Error('备份文件版本不兼容')
  if (![data.libraries, data.words, data.sessions, data.cards, data.settings].every(Array.isArray)) throw new Error('备份文件结构不完整')
  return data
}

export async function restoreBackup(data: Awaited<ReturnType<typeof inspectBackup>>) {
  await db.transaction('rw', db.libraries, db.words, db.sessions, db.cards, db.settings, async () => {
    await Promise.all([db.libraries.clear(), db.words.clear(), db.sessions.clear(), db.cards.clear(), db.settings.clear()])
    await db.libraries.bulkPut(data.libraries)
    await db.words.bulkPut(data.words)
    await db.sessions.bulkPut(data.sessions)
    await db.cards.bulkPut(data.cards)
    await db.settings.bulkPut(data.settings)
  })
}
