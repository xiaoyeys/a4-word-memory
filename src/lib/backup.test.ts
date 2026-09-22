import { describe, expect, it } from 'vitest'
import { inspectBackup } from './backup'

function backupFile(payload: unknown) {
  return { text: async () => JSON.stringify(payload) } as File
}

describe('backup validation', () => {
  it('accepts a structurally valid backup', async () => {
    const data = await inspectBackup(backupFile({
      product: 'A4词忆', version: 1, exportedAt: '2026-09-21T00:00:00.000Z',
      libraries: [{ id: 'lib', name: '词库', wordCount: 1 }],
      words: [{ id: 'word', libraryId: 'lib', word: 'maintain', meaning: '维持' }],
      sessions: [{ id: 'session', libraryId: 'lib', wordIds: ['word'], events: [] }],
      cards: [{ wordId: 'word', card: { due: '2026-09-22T00:00:00.000Z' } }],
      settings: [{ key: 'app', value: {} }],
    }))
    expect(data.words).toHaveLength(1)
    expect(data.version).toBe(2)
    expect(data.memoryPapers).toEqual([])
  })

  it('rejects a backup with invalid card dates', async () => {
    await expect(inspectBackup(backupFile({
      product: 'A4词忆', version: 1, exportedAt: '2026-09-21T00:00:00.000Z',
      libraries: [], words: [], sessions: [],
      cards: [{ wordId: 'word', card: { due: 'not-a-date' } }],
      settings: [],
    }))).rejects.toThrow('复习排程无效')
  })
})
