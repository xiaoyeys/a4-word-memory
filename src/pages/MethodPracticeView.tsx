import { ArrowLeft, Check, CheckCircle2, Eye, EyeOff, RotateCcw, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db'
import { playFeedbackSound } from '../lib/sound'
import { finishSession, savePartialSession } from '../lib/session'
import { normalizeWord } from '../lib/study'
import { playOnlinePronunciation } from '../lib/pronunciation'
import type { AppSettings, MethodProgress, RecallEvent, StudyMethod, StudySession, WordEntry } from '../types'
import { CompletedDictationPaper } from '../components/CompletedDictationPaper'
import { useStudyLeaveSave } from '../lib/useStudyLeaveSave'
import { MeaningDisplay, splitMeaning } from '../components/MeaningDisplay'

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

type DictationPhase = 3 | 4 | 5 | 6

function normalizeMeaningAnswer(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s\u3000]/g, '').replace(/[。.!！?？、,，;；|/]+$/g, '')
}

function meaningCandidates(word: WordEntry) {
  return splitMeaning(word.meaning, word.partOfSpeech)
    .flatMap((part) => part.text.split(/[、,，;；|/]/))
    .map(normalizeMeaningAnswer)
    .filter(Boolean)
}

function meaningAnswerMatches(word: WordEntry, answer: string) {
  const accepted = new Set(meaningCandidates(word))
  return answer.split(/[、,，;；|/]/).map(normalizeMeaningAnswer).some((candidate) => accepted.has(candidate))
}

export function MethodPracticeView({ initial, words, settings, onFinish, onExit }: Props) {
  const [showAllColumns, setShowAllColumns] = useState(false)
  const [session, setSession] = useState(initial)
  const [showDictationCover, setShowDictationCover] = useState(true)
  const [showCompletedPaper, setShowCompletedPaper] = useState(false)
  const [dictationDrafts, setDictationDrafts] = useState<Record<string, string>>({})
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
  const activeBatch = currentBatch.length ? currentBatch : batch
  const dictationPhase: DictationPhase = progress.dictationPhase ?? 3
  const phaseKey = String(dictationPhase)
  const phaseAnswers = dictationPhase === 3 ? (progress.dictationAnswers ?? {}) : dictationPhase === 4 ? (progress.dictationMeaningAnswers ?? {}) : dictationPhase === 5 ? (progress.dictationSecondWordAnswers ?? {}) : (progress.dictationSecondMeaningAnswers ?? {})
  const currentAnswerField = dictationPhase === 3 ? 'dictationAnswers' : dictationPhase === 4 ? 'dictationMeaningAnswers' : dictationPhase === 5 ? 'dictationSecondWordAnswers' : 'dictationSecondMeaningAnswers'
  const phaseIsWord = dictationPhase === 3 || dictationPhase === 5
  const phaseAnswerLabel = dictationPhase === 3 ? '第一次默写单词' : dictationPhase === 4 ? '第一次默写释义' : dictationPhase === 5 ? '第二次默写单词' : '第二次默写释义'
  const answersByPhase: Record<string, Record<string, string>> = {
    '3': progress.dictationAnswers ?? {},
    '4': progress.dictationMeaningAnswers ?? {},
    '5': progress.dictationSecondWordAnswers ?? {},
    '6': progress.dictationSecondMeaningAnswers ?? {},
  }
  const allTried = session.wordIds.every((id) => attempted.includes(id))
  useStudyLeaveSave(() => ({ ...session, activeSeconds: activeSecondsRef.current + Math.floor((Date.now() - activeSinceRef.current) / 1000), methodProgress: currentMethod === 'dictation' ? { ...progress, [currentAnswerField]: { ...phaseAnswers, ...dictationDrafts } } : progress }), currentMethod === 'dictation' ? dictationDrafts : undefined)

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

  useEffect(() => {
    setDictationDrafts({ ...phaseAnswers })
  }, [dictationPhase, progress.dictationIndex, session.id])

  async function persist(next: StudySession) {
    const value = checkpoint(next)
    await savePartialSession(value)
    setSession(value)
  }

  async function leave() {
    const next = currentMethod === 'dictation'
      ? { ...session, methodProgress: { ...progress, [currentAnswerField]: { ...phaseAnswers, ...dictationDrafts } } }
      : session
    try { await persist(next); onExit() } catch { setMessage('保存失败，请检查浏览器存储空间后重试。') }
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
    const submittedAnswers = { ...phaseAnswers, ...dictationDrafts }
    const gradeCorrect = activeBatch.filter((id) => {
      const word = wordsById.get(id)
      if (!word) return false
      return phaseIsWord ? normalizeWord(submittedAnswers[id] ?? '') === word.normalizedWord : meaningAnswerMatches(word, submittedAnswers[id] ?? '')
    })
    const phaseCorrect = { ...(progress.dictationPhaseCorrectIds ?? {}), [phaseKey]: gradeCorrect }
    playFeedbackSound(gradeCorrect.length === activeBatch.length ? 'correct' : 'complete', settings.soundEffects)
    if (dictationPhase < 6) {
      const nextPhase = (dictationPhase + 1) as DictationPhase
      await persist({ ...session, methodProgress: { ...progress, [currentAnswerField]: submittedAnswers, dictationBatchWordIds: activeBatch, dictationPhase: nextPhase, dictationPhaseCorrectIds: phaseCorrect } })
      setMessage(`${phaseAnswerLabel}完成：${gradeCorrect.length}/${activeBatch.length} 个词匹配`)
      return
    }

    const batchNow = activeBatch
    const wasCorrect = new Set(batchNow.filter((id) => phaseCorrect['5']?.includes(id) && phaseCorrect['6']?.includes(id)))
    const attemptedNext = Array.from(new Set([...attempted, ...batchNow]))
    const correctNext = Array.from(new Set([...correctDictation, ...wasCorrect]))
    const errors = { ...(progress.dictationErrors ?? {}) }
    batchNow.forEach((id) => {
      const misses = [3, 4, 5, 6].filter((phase) => !phaseCorrect[String(phase)]?.includes(id)).length
      if (misses) errors[id] = (errors[id] ?? 0) + misses
    })
    const missed = batchNow.filter((id) => !wasCorrect.has(id))
    const unattempted = session.wordIds.filter((id) => !attemptedNext.includes(id))
    const nextBatch = attemptedNext.length === session.wordIds.length ? [] : [...missed, ...unattempted].slice(0, groupSize)
    const completedAnswers = { ...(progress.dictationCompletedAnswers ?? {}) }
    batchNow.forEach((id) => {
      completedAnswers[id] = {
        firstWord: answersByPhase['3']?.[id] ?? '',
        firstMeaning: answersByPhase['4']?.[id] ?? '',
        secondWord: answersByPhase['5']?.[id] ?? '',
        secondMeaning: submittedAnswers[id] ?? '',
      }
    })
    const nextProgress: MethodProgress = {
      ...progress,
      dictationAttemptedWordIds: attemptedNext,
      dictationCorrectWordIds: correctNext,
      dictationErrors: errors,
      dictationBatchWordIds: nextBatch,
      dictationAnswers: {},
      dictationMeaningAnswers: {},
      dictationSecondWordAnswers: {},
      dictationSecondMeaningAnswers: {},
      dictationCompletedAnswers: completedAnswers,
      dictationPhase: 3,
      dictationPhaseCorrectIds: {},
      dictationGradeCorrectIds: undefined,
      dictationOverrides: {},
      dictationQueue: [...missed, ...unattempted],
      dictationIndex: (progress.dictationIndex ?? 0) + 1,
      dictationRoundComplete: attemptedNext.length === session.wordIds.length,
    }
    await persist({ ...session, methodProgress: nextProgress })
    if (!nextBatch.length && attemptedNext.length === session.wordIds.length) setMessage('本组四列已完成。可再练错词，或结束本方法并将未拼对的词加入待复习。')
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
      nextProgress.dictationMeaningAnswers = {}
      nextProgress.dictationSecondWordAnswers = {}
      nextProgress.dictationSecondMeaningAnswers = {}
      nextProgress.dictationCompletedAnswers = {}
      nextProgress.dictationPhase = 3
      nextProgress.dictationPhaseCorrectIds = {}
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
        ? <span>{word.word}</span>
        : <MeaningDisplay meaning={word.meaning} partOfSpeech={word.partOfSpeech} compact maxMeaningsPerPart={2} />
      : direction === 'en-zh'
        ? <MeaningDisplay meaning={word.meaning} partOfSpeech={word.partOfSpeech} compact maxMeaningsPerPart={2} />
        : <span>{word.word}</span>
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
      <div className="method-heading"><p className="eyebrow">折叠默写 · 第 {(progress.dictationIndex ?? 0) + 1} 轮</p><h1>{phaseAnswerLabel}</h1><p>当前列完成后自动进入下一列；已完成的填写会保留在纸上，但会高模糊遮挡，避免直接看到答案。</p><button className="text-button" onClick={() => setShowDictationCover((current) => !current)} aria-pressed={showDictationCover}>{showDictationCover ? <><EyeOff size={15} />隐藏遮挡</> : <><Eye size={15} />显示遮挡</>}</button></div>
        {!visibleBatch.length ? <><section className="dictation-finish panel"><CheckCircle2 /><h2>{correctDictation.length}/{session.wordIds.length} 个词已完成四列默写</h2><p>现在可以解除遮挡查看完整 A4 纸；完成学习后，这张纸会自动进入学习档案。</p><div className="method-action-row"><button className="secondary" onClick={() => setShowCompletedPaper((current) => !current)}><Eye size={16} />{showCompletedPaper ? '收起完整纸面' : '查看完整 A4 纸'}</button><button className="secondary" onClick={() => { const missed = session.wordIds.filter((id) => !correctDictation.includes(id)); void persist({ ...session, methodProgress: { ...progress, dictationRoundComplete: false, dictationBatchWordIds: missed.slice(0, groupSize), dictationQueue: missed, dictationAnswers: {}, dictationMeaningAnswers: {}, dictationSecondWordAnswers: {}, dictationSecondMeaningAnswers: {}, dictationPhase: 3, dictationPhaseCorrectIds: {}, dictationGradeCorrectIds: undefined, dictationOverrides: {} } }) }} disabled={!session.wordIds.some((id) => !correctDictation.includes(id))}><RotateCcw size={16} />再练错词</button><button className="primary" disabled={!allTried} onClick={() => void finishDictation(true)}>完成并存入学习档案</button></div>{!allTried && <small>继续练习，确保每个目标词至少完成四列默写。</small>}</section>{showCompletedPaper && <CompletedDictationPaper wordIds={session.wordIds} wordsById={wordsById} progress={progress} />}</> : <>
        <button className="tool-button mobile-dictation-view" onClick={() => setShowAllColumns((current) => !current)} aria-pressed={showAllColumns}>{showAllColumns ? '返回当前列填写' : '查看完整六列纸面'}</button>
        <div className={`dictation-paper-workspace ${showAllColumns ? 'show-all-columns' : 'focus-column'} phase-${dictationPhase}${showDictationCover ? ' cover-enabled' : ''}`}>
          <div className="dictation-paper" role="table" aria-label="六列折叠默写纸">
            <div className="dictation-column-head" role="row">
              <span role="columnheader">1 · 单词提示</span>
              <span role="columnheader">2 · 词性与释义</span>
              <span role="columnheader">3 · 第一次默写单词</span>
              <span role="columnheader">4 · 第一次默写释义</span>
              <span role="columnheader">5 · 第二次默写单词</span>
              <span role="columnheader">6 · 第二次默写释义</span>
            </div>
            <div className="dictation-list">{visibleBatch.map((id) => {
              const word = wordsById.get(id)
              if (!word) return null
              const renderAnswerCell = (phase: DictationPhase, placeholder: string) => {
                const completed = phase < dictationPhase
                const active = phase === dictationPhase
                const answer = active ? (dictationDrafts[id] ?? answersByPhase[String(phase)]?.[id] ?? '') : (answersByPhase[String(phase)]?.[id] ?? '')
                const englishAnswer = phase === 3 || phase === 5
                return <div className={`dictation-paper-cell dictation-answer ${completed ? 'is-obscured' : ''} ${active ? 'is-active' : ''}`} role="cell">{completed ? <strong>{answer || '—'}</strong> : active ? <input value={answer} onChange={(event) => setDictationDrafts((current) => ({ ...current, [id]: event.target.value }))} type="text" inputMode="text" lang={englishAnswer ? 'en' : 'zh-CN'} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} aria-label={`${word.word}${placeholder}`} placeholder={placeholder} /> : <span className="dictation-pending">待进行</span>}</div>
              }
              const maskWordPrompt = phaseIsWord && showDictationCover
              const maskMeaningPrompt = !phaseIsWord && showDictationCover
              return <article className="dictation-row" role="row" key={id}>
                <div className="dictation-paper-cell dictation-word-cell" role="cell">{!maskWordPrompt && <div className="dictation-word">{word.word}<button className="icon-button" onClick={() => play(word)} aria-label={`朗读${word.word}`}><Volume2 size={15} /></button></div>}</div>
                <div className="dictation-paper-cell dictation-meaning" role="cell">{!maskMeaningPrompt ? <MeaningDisplay meaning={word.meaning} partOfSpeech={word.partOfSpeech} compact maxMeaningsPerPart={2} /> : null}</div>
                {renderAnswerCell(3, '输入英文')}
                {renderAnswerCell(4, '输入释义')}
                {renderAnswerCell(5, '再次输入英文')}
                {renderAnswerCell(6, '再次输入释义')}
              </article>
            })}</div>
          </div>
          {showDictationCover && <div className={`dictation-fold-sheet ${phaseIsWord ? 'mask-word' : 'mask-meaning'}`} aria-label={phaseIsWord ? '单词提示已遮挡' : '释义提示已遮挡'}>{phaseIsWord ? '单词折叠中' : '释义折叠中'}</div>}
        </div>
        <div className="dictation-review-actions"><span>{phaseAnswerLabel} · 完成后进入下一列</span><button className="primary wide dictation-submit" onClick={() => void submitDictation()}>批改并进入下一列</button></div>
      </>}
      <div className="method-bottom-note"><span>已尝试 {attempted.length}/{session.wordIds.length} · 已拼对 {correctDictation.length}</span>{message && <span role="status">{message}</span>}</div>
    </main>}
  </div>
}
