import { ArrowLeft, Check, CheckCircle2, Eye, EyeOff, RotateCcw, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db'
import { playFeedbackSound } from '../lib/sound'
import { finishSession, savePartialSession } from '../lib/session'
import { normalizeWord } from '../lib/study'
import { playOnlinePronunciation } from '../lib/pronunciation'
import type { AppSettings, MethodProgress, RecallEvent, StudyMethod, StudySession, WordEntry } from '../types'
import { MeaningDisplay } from '../components/MeaningDisplay'

interface Props {
  initial: StudySession
  words: WordEntry[]
  settings: AppSettings
  onFinish: (session: StudySession) => void
  onExit: () => void
}

const methodName: Record<StudyMethod, string> = { scatter: '随机散点顺序回忆', match: '词义连连看', dictation: '折叠默写纠错' }
const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - .5)

function eventFor(wordId: string, rating: RecallEvent['rating'], round: number, method: 'match' | 'dictation'): RecallEvent {
  return { id: crypto.randomUUID(), wordId, rating, round, createdAt: new Date().toISOString(), method }
}

export function MethodPracticeView({ initial, words, settings, onFinish, onExit }: Props) {
  const [session, setSession] = useState(initial)
  const [meaningFolded, setMeaningFolded] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 700)
  const [message, setMessage] = useState('')
  const [confirming, setConfirming] = useState(false)
  const activeSecondsRef = useRef(initial.activeSeconds ?? 0)
  const activeSinceRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(initial.activeSeconds ?? 0)
  const progress: MethodProgress = session.methodProgress ?? {}
  const methods = session.methods?.length ? session.methods : ['scatter'] as StudyMethod[]
  const currentMethod = methods[session.methodIndex ?? 0] ?? 'match'
  const wordsById = useMemo(() => new Map(words.map((word) => [word.id, word])), [words])
  const matchOrder = progress.matchOrder ?? []
  const matched = progress.matchedWordIds ?? []
  const groupSize = currentMethod === 'dictation' ? session.dictationGroupSize ?? 10 : session.methodGroupSize ?? 8
  const groupIndex = progress.matchGroupIndex ?? 0
  const matchIds = matchOrder.slice(groupIndex * groupSize, (groupIndex + 1) * groupSize)
  const meaningMatchIds = (progress.matchMeaningOrder ?? matchIds).slice(groupIndex * groupSize, (groupIndex + 1) * groupSize)
  const direction = progress.matchDirection ?? 'en-zh'
  const batch = progress.dictationBatchWordIds?.length ? progress.dictationBatchWordIds : progress.dictationQueue?.slice(0, groupSize) ?? session.wordIds.slice(0, groupSize)
  const attempted = progress.dictationAttemptedWordIds ?? []
  const correctDictation = progress.dictationCorrectWordIds ?? []
  const currentBatch = progress.dictationBatchWordIds ?? []
  const isGradedBatch = Array.isArray(progress.dictationGradeCorrectIds)
  const gradedIds = progress.dictationGradeCorrectIds ?? []
  const gradeOverrides = progress.dictationOverrides ?? {}
  const effectiveCorrectIds = currentBatch.filter((id) => gradeOverrides[id] ?? gradedIds.includes(id))
  const allTried = session.wordIds.every((id) => attempted.includes(id))

  function play(word: WordEntry) {
    playOnlinePronunciation(word.word, settings.accent, () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(word.word)
        utterance.lang = settings.accent
        utterance.rate = settings.speechRate
        window.speechSynthesis.speak(utterance)
      }
    })
  }

  function checkpoint(next: StudySession) {
    const now = Date.now()
    activeSecondsRef.current += Math.floor((now - activeSinceRef.current) / 1000)
    activeSinceRef.current = now
    setElapsed(activeSecondsRef.current)
    return { ...next, activeSeconds: activeSecondsRef.current, updatedAt: new Date().toISOString() }
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsed(activeSecondsRef.current + Math.floor((Date.now() - activeSinceRef.current) / 1000))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  async function persist(next: StudySession) {
    const value = checkpoint(next)
    await savePartialSession(value)
    setSession(value)
  }

  async function leave() {
    try { await persist(session); onExit() } catch { setMessage('保存失败，请检查浏览器存储空间后重试。') }
  }

  async function advanceMethod(nextProgress: MethodProgress, generatedEvents: RecallEvent[], unresolved: string[] = []) {
    const nextIndex = (session.methodIndex ?? 0) + 1
    const nextMethod = methods[nextIndex]
    const next: StudySession = {
      ...session,
      methodProgress: nextProgress,
      methodEvents: [...(session.methodEvents ?? []), ...generatedEvents],
      unmasteredWordIds: Array.from(new Set([...(session.unmasteredWordIds ?? []), ...unresolved])),
      methodIndex: nextIndex,
      stage: !nextMethod ? 'complete' : nextMethod === 'scatter' ? 'learn' : nextMethod,
      currentWordIndex: 0,
      repetitions: 0,
      recallIndex: 0,
      recallLimit: 0,
      placed: nextMethod === 'scatter' ? [] : session.placed,
      preview: undefined,
      selectedRecallWordId: undefined,
      revealedMeaning: false,
      updatedAt: new Date().toISOString(),
    }
    if (!nextMethod) {
      try {
        const completed = await finishSession(checkpoint(next))
        playFeedbackSound('finish', settings.soundEffects)
        setSession(completed)
        onFinish(completed)
      } catch { setMessage('学习结果保存失败，请检查本地存储后重试。') }
    } else {
      await persist(next)
    }
  }

  async function finishMatch() {
    const errors = progress.matchErrors ?? {}
    const generated = matchOrder.map((id) => eventFor(id, (errors[id] ?? 0) ? 'fuzzy' : 'remembered', 1, 'match'))
    await advanceMethod(progress, generated)
  }

  async function selectPair(id: string, side: 'word' | 'meaning') {
    if (matched.includes(id)) return
    const selected = progress.matchSelectedWordId
    const selectedSide = progress.matchSelectedSide
    if (!selected || !selectedSide || selectedSide === side) {
      await persist({ ...session, methodProgress: { ...progress, matchSelectedWordId: id, matchSelectedSide: side } })
      return
    }
    const isPair = selected === id
    if (isPair) {
      const nextMatched = [...matched, id]
      const nextProgress = { ...progress, matchedWordIds: nextMatched, matchSelectedWordId: undefined, matchSelectedSide: undefined }
      playFeedbackSound('correct', settings.soundEffects)
      setMessage('配对正确')
      await persist({ ...session, methodProgress: nextProgress })
      if (matchIds.every((wordId) => nextMatched.includes(wordId))) {
        if ((groupIndex + 1) * groupSize < matchOrder.length) {
          setConfirming(true)
        } else {
          await finishMatch()
        }
      }
      return
    }
    const wordId = selectedSide === 'word' ? selected : id
    const meaningId = selectedSide === 'meaning' ? selected : id
    const errors = { ...(progress.matchErrors ?? {}), [wordId]: (progress.matchErrors?.[wordId] ?? 0) + 1, [meaningId]: (progress.matchErrors?.[meaningId] ?? 0) + 1 }
    playFeedbackSound('error', settings.soundEffects)
    setMessage('不匹配，再想想释义')
    await persist({ ...session, methodProgress: { ...progress, matchSelectedWordId: undefined, matchSelectedSide: undefined, matchErrors: errors } })
  }

  async function submitDictation() {
    const answers = progress.dictationAnswers ?? {}
    const gradeCorrect = currentBatch.filter((id) => {
      const word = wordsById.get(id)
      return Boolean(word && (gradeOverrides[id] ?? normalizeWord(answers[id] ?? '') === word.normalizedWord))
    })
    playFeedbackSound(gradeCorrect.length === currentBatch.length ? 'correct' : 'complete', settings.soundEffects)
    await persist({ ...session, methodProgress: { ...progress, dictationBatchWordIds: currentBatch.length ? currentBatch : batch, dictationGradeCorrectIds: gradeCorrect } })
  }

  async function confirmDictationBatch() {
    const batchNow = currentBatch.length ? currentBatch : batch
    const wasCorrect = new Set(batchNow.filter((id) => gradeOverrides[id] ?? gradedIds.includes(id)))
    const attemptedNext = Array.from(new Set([...attempted, ...batchNow]))
    const correctNext = Array.from(new Set([...correctDictation, ...gradedIds]))
    const errors = { ...(progress.dictationErrors ?? {}) }
    batchNow.filter((id) => !wasCorrect.has(id)).forEach((id) => { errors[id] = (errors[id] ?? 0) + 1 })
    const missed = batchNow.filter((id) => !wasCorrect.has(id))
    const unattempted = session.wordIds.filter((id) => !attemptedNext.includes(id))
    const nextBatch = attemptedNext.length === session.wordIds.length ? [] : [...missed, ...unattempted].slice(0, groupSize)
    const nextProgress: MethodProgress = {
      ...progress,
      dictationAttemptedWordIds: attemptedNext,
      dictationCorrectWordIds: correctNext,
      dictationErrors: errors,
      dictationBatchWordIds: nextBatch,
      dictationAnswers: {},
      dictationGradeCorrectIds: undefined,
      dictationOverrides: {},
      dictationQueue: [...missed, ...unattempted],
      dictationIndex: (progress.dictationIndex ?? 0) + 1,
      dictationRoundComplete: attemptedNext.length === session.wordIds.length,
    }
    await persist({ ...session, methodProgress: nextProgress })
    setMeaningFolded(false)
    if (!nextBatch.length && attemptedNext.length === session.wordIds.length) setMessage('全部单词都已批改。可再练错词，或结束本方法并将未拼对的词加入待复习。')
  }

  async function finishDictation(allowMissed: boolean) {
    const errors = progress.dictationErrors ?? {}
    const unresolved = allowMissed ? session.wordIds.filter((id) => !correctDictation.includes(id)) : []
    const generated = session.wordIds.filter((id) => attempted.includes(id)).map((id) => eventFor(id, correctDictation.includes(id) ? 'remembered' : 'forgotten', errors[id] ?? 1, 'dictation'))
    await advanceMethod(progress, generated, unresolved)
  }

  async function startNextMatchGroup() {
    const nextIndex = groupIndex + 1
    setConfirming(false)
    await persist({ ...session, methodProgress: { ...progress, matchGroupIndex: nextIndex, matchedWordIds: [], matchSelectedWordId: undefined, matchSelectedSide: undefined } })
  }

  async function initializeOrder() {
    const nextProgress: MethodProgress = { ...progress }
    if (currentMethod === 'match' && !nextProgress.matchOrder) nextProgress.matchOrder = shuffle(session.wordIds)
    if (currentMethod === 'match' && !nextProgress.matchMeaningOrder) {
      const order = nextProgress.matchOrder ?? session.wordIds
      nextProgress.matchMeaningOrder = order.flatMap((_, index) => index % groupSize === 0 ? shuffle(order.slice(index, index + groupSize)) : [])
    }
    if (currentMethod === 'match' && !nextProgress.matchDirection) nextProgress.matchDirection = 'en-zh'
    if (currentMethod === 'dictation' && !nextProgress.dictationQueue) {
      nextProgress.dictationOrder = [...session.wordIds]
      nextProgress.dictationQueue = session.wordIds.slice(0, groupSize)
      nextProgress.dictationBatchWordIds = session.wordIds.slice(0, groupSize)
      nextProgress.dictationAttemptedWordIds = []
      nextProgress.dictationCorrectWordIds = []
      nextProgress.dictationAnswers = {}
      nextProgress.dictationErrors = {}
    }
    await persist({ ...session, methodProgress: nextProgress })
  }

  const hasOrder = currentMethod === 'match' ? Boolean(progress.matchOrder && progress.matchMeaningOrder) : currentMethod === 'dictation' ? Boolean(progress.dictationQueue) : true
  const initializing = useRef(false)
  useEffect(() => {
    if (!hasOrder && !initializing.current) {
      initializing.current = true
      void initializeOrder().finally(() => { initializing.current = false })
    }
  }, [hasOrder, currentMethod])

  const methodIndex = session.methodIndex ?? 0
  const progressPercent = Math.round((methodIndex / methods.length) * 100)
  const visibleBatch = progress.dictationRoundComplete ? [] : batch.length ? batch : session.wordIds.slice(0, groupSize)
  const leftMatchIds = direction === 'en-zh' ? matchIds : meaningMatchIds
  const rightMatchIds = direction === 'en-zh' ? meaningMatchIds : matchIds
  function renderMatchCard(id: string, side: 'word' | 'meaning') {
    const word = wordsById.get(id)
    if (!word) return null
    const isMatched = matched.includes(id)
    const selected = progress.matchSelectedWordId === id && progress.matchSelectedSide === side
    const content = side === 'word'
      ? direction === 'en-zh'
        ? <><span>{word.word}</span><Volume2 size={15} onClick={(event) => { event.stopPropagation(); play(word) }} /></>
        : <MeaningDisplay meaning={word.meaning} partOfSpeech={word.partOfSpeech} compact maxMeaningsPerPart={2} />
      : direction === 'en-zh'
        ? <MeaningDisplay meaning={word.meaning} partOfSpeech={word.partOfSpeech} compact maxMeaningsPerPart={2} />
        : <><span>{word.word}</span><Volume2 size={15} onClick={(event) => { event.stopPropagation(); play(word) }} /></>
    return <button key={`${side}-${id}`} className={`match-card${isMatched ? ' correct' : ''}${selected ? ' selected' : ''}`} disabled={isMatched} onClick={() => void selectPair(id, side)}>{content}</button>
  }

  return <div className="method-study-page">
    <header className="method-study-header"><button className="tool-button" onClick={() => void leave()}><ArrowLeft size={17} />暂时离开</button><div className="method-progress"><span>{session.libraryName} · {methodIndex + 1}/{methods.length} {methodName[currentMethod]}</span><div className="progress-track"><i style={{ width: `${progressPercent}%` }} /></div></div><span className="method-count">{session.wordIds.length} 个目标词 · {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</span></header>

    {currentMethod === 'match' && <main className="method-paper match-method">
      <div className="method-heading"><p className="eyebrow">词义连连看 · 第 {groupIndex + 1} 组</p><h1>找到英文与释义的对应关系</h1><p>先选一边，再选另一边；答错不会显示答案，可以重新尝试。</p><button className="text-button" onClick={() => void persist({ ...session, methodProgress: { ...progress, matchDirection: direction === 'en-zh' ? 'zh-en' : 'en-zh', matchSelectedWordId: undefined } })}>切换为{direction === 'en-zh' ? '中文 → 英文' : '英文 → 中文'}</button></div>
      {!matchIds.length ? <div className="empty-state">正在准备题目…</div> : <div className="match-columns" aria-label="英文与释义配对">{leftMatchIds.map((id, index) => <div className="match-pair-row" key={`pair-${id}`}><div className="match-column" aria-label={index === 0 ? (direction === 'en-zh' ? '英文单词' : '中文释义') : undefined}>{renderMatchCard(id, 'word')}</div><div className="match-column" aria-label={index === 0 ? (direction === 'en-zh' ? '释义' : '英文单词') : undefined}>{renderMatchCard(rightMatchIds[index], 'meaning')}</div></div>)}</div>}
      <div className="method-bottom-note"><span><CheckCircle2 size={17} />本组已配对 {matched.length}/{matchIds.length}</span>{message && <span role="status">{message}</span>}</div>
      {confirming && <div className="modal-backdrop"><section className="modal"><p className="eyebrow">本组完成</p><h2>这一组已经全部配对</h2><p>完成本轮后，系统会按错误情况安排复习。</p><div className="modal-actions"><button className="primary" onClick={() => void startNextMatchGroup()}>继续下一组</button></div></section></div>}
    </main>}

    {currentMethod === 'dictation' && <main className="method-paper dictation-method">
      <div className="method-heading"><p className="eyebrow">折叠默写纠错 · 第 {(progress.dictationIndex ?? 0) + 1} 轮</p><h1>看释义，写出英文单词</h1><p>把第1列折起来，只看释义默写；按“蓝笔批改”后可以逐词改判。</p><button className="text-button" onClick={() => setMeaningFolded((current) => !current)}>{meaningFolded ? <><Eye size={15} />显示单词提示</> : <><EyeOff size={15} />折叠第1列</>}</button></div>
        {!visibleBatch.length ? <section className="dictation-finish panel"><CheckCircle2 /><h2>{correctDictation.length}/{session.wordIds.length} 个词已拼对</h2><p>未拼对的词会保留在待复习区，你也可以再默写一轮。</p><div className="method-action-row"><button className="secondary" onClick={() => { const missed = session.wordIds.filter((id) => !correctDictation.includes(id)); void persist({ ...session, methodProgress: { ...progress, dictationRoundComplete: false, dictationBatchWordIds: missed.slice(0, groupSize), dictationQueue: missed, dictationAnswers: {}, dictationGradeCorrectIds: [], dictationOverrides: {} } }) }} disabled={!session.wordIds.some((id) => !correctDictation.includes(id))}><RotateCcw size={16} />再练错词</button><button className="primary" disabled={!allTried} onClick={() => void finishDictation(true)}>完成并保存待复习词</button></div>{!allTried && <small>继续练习，确保每个目标词至少默写并批改一次。</small>}</section> : <>
        <div className="dictation-column-head"><span>第1列 · 单词提示</span><span>第2列 · 词性与释义</span><span>第3列 · 默写</span></div>
      <div className="dictation-list">{visibleBatch.map((id) => { const word = wordsById.get(id); if (!word) return null; const answer = progress.dictationAnswers?.[id] ?? ''; const autoCorrect = gradedIds.includes(id); const isCorrect = gradeOverrides[id] ?? autoCorrect; const errors = progress.dictationErrors?.[id] ?? 0; return <article className={`dictation-row${isGradedBatch ? (isCorrect ? ' dictation-correct' : errors ? ' dictation-repeat-error' : ' dictation-error') : ''}`} key={id}><div className={`dictation-word ${meaningFolded ? 'folded' : ''}`}>{meaningFolded ? '••••••••' : word.word}{!meaningFolded && <button className="icon-button" onClick={() => play(word)} aria-label={`朗读${word.word}`}><Volume2 size={15} /></button>}</div><div className="dictation-meaning"><MeaningDisplay meaning={word.meaning} partOfSpeech={word.partOfSpeech} compact maxMeaningsPerPart={2} /></div><div className="dictation-answer">{isGradedBatch ? <><strong>{answer || '（未填写）'}</strong><div className="grade-override"><button className={isCorrect ? 'active correct' : ''} onClick={() => void persist({ ...session, methodProgress: { ...progress, dictationOverrides: { ...gradeOverrides, [id]: true } } })}>判对</button><button className={!isCorrect ? 'active wrong' : ''} onClick={() => void persist({ ...session, methodProgress: { ...progress, dictationOverrides: { ...gradeOverrides, [id]: false } } })}>判错</button></div></> : <input value={answer} onChange={(event) => void persist({ ...session, methodProgress: { ...progress, dictationBatchWordIds: visibleBatch, dictationAnswers: { ...(progress.dictationAnswers ?? {}), [id]: event.target.value } } })} autoComplete="off" spellCheck={false} aria-label={`${word.word}的默写答案`} placeholder="输入单词" />}</div><small className="dictation-error-count">{errors > 0 ? `错误 ${errors} 次` : isGradedBatch && isCorrect ? '正确' : ''}</small></article> })}</div>
        {!isGradedBatch ? <button className="primary wide dictation-submit" onClick={() => void submitDictation()}>蓝笔批改</button> : <div className="dictation-review-actions"><span>批改 {effectiveCorrectIds.length}/{currentBatch.length} 正确，可逐词改判</span><button className="primary" onClick={() => void confirmDictationBatch()}>确认批改并继续</button></div>}
      </>}
      <div className="method-bottom-note"><span>已尝试 {attempted.length}/{session.wordIds.length} · 已拼对 {correctDictation.length}</span>{message && <span role="status">{message}</span>}</div>
    </main>}
  </div>
}
