import { useEffect, useRef } from 'react'
import { savePartialSession } from './session'
import type { StudySession } from '../types'

/** Browser Back and page switches must save the latest input too. */
export function useStudyLeaveSave(snapshot: () => StudySession, draft?: unknown) {
  const latest = useRef(snapshot)
  latest.current = snapshot
  useEffect(() => {
    if (draft === undefined) return
    const timer = window.setTimeout(() => {
      const value = latest.current()
      if (value.status === 'active') void savePartialSession(value, true).catch(() => console.error('默写草稿保存失败。'))
    }, 500)
    return () => window.clearTimeout(timer)
  }, [draft])
  useEffect(() => {
    const save = () => {
      const value = latest.current()
      if (value.status !== 'active') return
      void savePartialSession(value, true)
        .then(() => window.dispatchEvent(new Event('a4:checkpoint-saved')))
        .catch(() => console.error('学习进度保存失败，请检查浏览器存储空间。'))
    }
    window.addEventListener('pagehide', save)
    return () => { window.removeEventListener('pagehide', save); save() }
  }, [])
}
