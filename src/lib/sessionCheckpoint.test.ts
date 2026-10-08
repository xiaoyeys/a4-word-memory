import { beforeEach, describe, expect, it, vi } from 'vitest'
import { savePartialSession } from './session'
import type { StudySession } from '../types'

const storage = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('../db', () => ({ db: {
  sessions: { get: storage.get, put: storage.put }, cards: {},
  transaction: async (...args: unknown[]) => (args[args.length - 1] as () => Promise<void>)(),
} }))
const snapshot = { id: 'session-a', status: 'active', stage: 'dictation', methodIndex: 1, events: [] } as unknown as StudySession
beforeEach(() => { vi.clearAllMocks() })

describe('exit checkpoints', () => {
  it('never reopens a completed session through an old exit snapshot', async () => {
    storage.get.mockResolvedValue({ ...snapshot, status: 'completed' })
    await savePartialSession(snapshot, true)
    expect(storage.put).not.toHaveBeenCalled()
  })
  it('never overwrites the next method with the previous method on unmount', async () => {
    storage.get.mockResolvedValue({ ...snapshot, stage: 'learn', methodIndex: 2 })
    await savePartialSession(snapshot, true)
    expect(storage.put).not.toHaveBeenCalled()
  })
  it('saves the current active method when leaving a page', async () => {
    storage.get.mockResolvedValue(snapshot)
    await savePartialSession(snapshot, true)
    expect(storage.put).toHaveBeenCalledWith(expect.objectContaining({ id: snapshot.id, status: 'active', stage: 'dictation' }))
  })
})
