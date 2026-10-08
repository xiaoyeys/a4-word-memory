import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { defaultSettings } from './types'

const fixture = vi.hoisted(() => ({ settings: {} as Record<string, unknown>, save: vi.fn(), books: [
  { id: 'a', name: '词书甲', kind: 'builtin', description: '', version: 1, wordCount: 1, createdAt: '', updatedAt: '' },
  { id: 'b', name: '词书乙', kind: 'builtin', description: '', version: 1, wordCount: 1, createdAt: '', updatedAt: '' },
] }))
vi.mock('./db', () => ({
  initializeDatabase: vi.fn().mockResolvedValue(undefined),
  ensureBuiltinLibraryLoaded: vi.fn().mockResolvedValue(undefined),
  getSettings: async () => fixture.settings,
  saveSettings: async (value: Record<string, unknown>) => { fixture.save(value); fixture.settings = value },
  db: {
    libraries: { toArray: async () => fixture.books },
    words: { toArray: async () => fixture.books.map((book) => ({ id: `${book.id}-word`, libraryId: book.id, word: 'apple', normalizedWord: 'apple', meaning: '苹果', createdAt: '' })) },
    cards: { toArray: async () => [] },
    sessions: { orderBy: () => ({ toArray: async () => [] }) },
    memoryFolders: { toArray: async () => [] }, memoryPapers: { toArray: async () => [] },
  },
}))
vi.mock('./lib/memoryArchive', () => ({ syncMemoryArchive: vi.fn().mockResolvedValue(undefined), defaultFolderId: 'default' }))
vi.mock('./lib/pwa', () => ({ subscribeToAppUpdate: () => () => {}, applyAppUpdate: vi.fn() }))

beforeEach(() => {
  fixture.settings = { ...defaultSettings, currentLibraryId: 'a', onboardingDone: true }
  fixture.save.mockClear()
  window.history.replaceState({ a4Trail: [] }, '', '#/home')
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

async function chooseBookB() {
  fireEvent.click(screen.getByRole('button', { name: '调整计划' }))
  fireEvent.change(screen.getByLabelText('自定义每日新词数量'), { target: { value: '17' } })
  fireEvent.click(screen.getByRole('button', { name: '更换词书' }))
  const preview = await screen.findByRole('button', { name: '预览词书乙' })
  const card = preview.closest('article')!
  fireEvent.click(within(card).getByRole('button', { name: '选用' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '保存计划' })).toBeInTheDocument())
}

describe('plan library selection', () => {
  it('commits the selected book and edited goal together only when saved', async () => {
    render(<App />)
    await screen.findByRole('button', { name: '调整计划' })
    await chooseBookB()
    expect(screen.getByLabelText('自定义每日新词数量')).toHaveValue(17)
    expect(fixture.save).not.toHaveBeenCalled()
    expect(fixture.settings.currentLibraryId).toBe('a')
    fireEvent.click(screen.getByRole('button', { name: '保存计划' }))
    await waitFor(() => expect(fixture.save).toHaveBeenCalledWith(expect.objectContaining({ currentLibraryId: 'b', dailyNewWordTarget: 17 })))
    await waitFor(() => expect(screen.getByRole('heading', { level: 2, name: '词书乙' })).toBeInTheDocument())
  })

  it('cancelling a book change leaves the saved plan untouched', async () => {
    render(<App />)
    await screen.findByRole('button', { name: '调整计划' })
    await chooseBookB()
    fireEvent.click(screen.getByRole('button', { name: '返回首页' }))
    expect(screen.getByRole('heading', { level: 2, name: '词书甲' })).toBeInTheDocument()
    expect(fixture.save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '调整计划' }))
    await waitFor(() => expect(screen.getByLabelText('自定义每日新词数量')).toHaveValue(30))
    expect(screen.getByText('词书甲', { selector: '.plan-book-row strong' })).toBeInTheDocument()
  })
})
