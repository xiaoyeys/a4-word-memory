import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStudyLeaveSave } from './useStudyLeaveSave'
import { savePartialSession } from './session'
import type { StudySession } from '../types'

vi.mock('./session', () => ({ savePartialSession: vi.fn().mockResolvedValue(undefined) }))
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.useRealTimers() })

describe('leaving a study page', () => {
  it('preserves the latest unfinished dictation input on browser Back', () => {
    const session = { id: 'test-session', status: 'active', methodProgress: { dictationAnswers: { apple: 'ap' } } } as unknown as StudySession
    const result = renderHook(({ value }) => useStudyLeaveSave(() => value), { initialProps: { value: session } })
    const latest = { ...session, methodProgress: { dictationAnswers: { apple: 'appl' } } }
    result.rerender({ value: latest })
    result.unmount()
    expect(savePartialSession).toHaveBeenCalledWith(latest, true)
  })
  it('does not save a finished session as an unfinished one', () => {
    const result = renderHook(() => useStudyLeaveSave(() => ({ status: 'completed' } as StudySession)))
    result.unmount()
    expect(savePartialSession).not.toHaveBeenCalled()
  })
})
