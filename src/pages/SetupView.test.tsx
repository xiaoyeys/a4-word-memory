import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SetupView } from './SetupView'
import { defaultSettings, type WordLibrary } from '../types'
import { goToPage } from '../lib/navigation'

const library: WordLibrary = { id: 'book-a', name: '测试词书', kind: 'custom', description: '', version: 1, wordCount: 1, createdAt: '', updatedAt: '' }
function props(purpose: 'plan' | 'start' = 'plan') {
  return { purpose, initialMode: 'random' as const, library, words: [{ id: 'word-a', libraryId: library.id, word: 'apple', normalizedWord: 'apple', meaning: '苹果', createdAt: '' }], cards: [], sessions: [], settings: defaultSettings, onSettings: vi.fn(), onChoosePlanLibrary: vi.fn(), onSaved: vi.fn(), onStart: vi.fn() }
}
beforeEach(() => { window.history.replaceState({ a4Trail: [] }, '', '#/setup'); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('plan editing and extra practice', () => {
  it('keeps goal changes as a draft when opening the book picker', () => {
    const callbacks = props()
    render(<SetupView {...callbacks} />)
    fireEvent.change(screen.getByLabelText('自定义每日新词数量'), { target: { value: '17' } })
    fireEvent.click(screen.getByRole('button', { name: '更换词书' }))
    expect(callbacks.onChoosePlanLibrary).toHaveBeenCalledOnce()
    expect(callbacks.onSettings).not.toHaveBeenCalled()
    expect(screen.getByLabelText('自定义每日新词数量')).toHaveValue(17)
  })

  it('only saves a plan through the explicit save action', async () => {
    const callbacks = props()
    render(<SetupView {...callbacks} />)
    fireEvent.change(screen.getByLabelText('自定义每日新词数量'), { target: { value: '17' } })
    fireEvent.click(screen.getByRole('button', { name: '保存计划' }))
    await waitFor(() => expect(callbacks.onSaved).toHaveBeenCalledOnce())
    expect(callbacks.onSettings).toHaveBeenCalledWith(expect.objectContaining({ dailyNewWordTarget: 17 }))
  })

  it('starts extra practice without replacing default settings', async () => {
    window.history.replaceState({ a4Trail: [] }, '', '#/setup/extra')
    const callbacks = props('start')
    render(<SetupView {...callbacks} />)
    fireEvent.change(screen.getByLabelText('加练词数'), { target: { value: '7' } })
    fireEvent.click(screen.getByRole('button', { name: '开始加练' }))
    await waitFor(() => expect(callbacks.onStart).toHaveBeenCalledOnce())
    expect(callbacks.onSettings).not.toHaveBeenCalled()
    expect(callbacks.onStart).toHaveBeenCalledWith(expect.objectContaining({ count: 7 }))
  })

  it('restores the method editor and draft on browser Back', async () => {
    const callbacks = props()
    render(<SetupView {...callbacks} />)
    fireEvent.click(screen.getByRole('button', { name: /选择方法、调整顺序/ }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('学习流程')
    fireEvent.click(screen.getByRole('button', { name: /随机散点顺序回忆设置/ }))
    fireEvent.change(screen.getByRole('combobox', { name: /每词背诵遍数/ }), { target: { value: '5' } })
    act(() => { window.history.back() })
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('学习流程'))
    expect(screen.getByRole('button', { name: /随机散点顺序回忆设置/ })).toHaveTextContent('5 遍')
    expect(callbacks.onSettings).not.toHaveBeenCalled()
    act(() => goToPage('setup'))
    expect(screen.getByRole('button', { name: '保存计划' })).toBeInTheDocument()
  })
})
