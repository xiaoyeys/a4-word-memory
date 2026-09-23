import { ArrowLeft, BookOpenCheck, Check, Eye, EyeOff, GripHorizontal, Keyboard, MapPin, Maximize2, PanelBottom, PanelLeft, PanelRight, PanelTop, RotateCcw, Volume2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db'
import { estimateWordBox, findRandomPlacement, normalizeWord, summaryFor } from '../lib/study'
import { finishSession } from '../lib/session'
import { playFeedbackSound } from '../lib/sound'
import { playOnlinePronunciation, stopPronunciationAudio } from '../lib/pronunciation'
import type { AppSettings, PlacedWord, RecallRating, StudySession, WordEntry } from '../types'
import { PaperCanvas } from '../components/PaperCanvas'
import { MeaningDisplay } from '../components/MeaningDisplay'

interface StudyViewProps {
  initial: StudySession
  words: WordEntry[]
  settings: AppSettings
  onSettings: (value: AppSettings) => void
  onFinish: (session: StudySession) => void
  onExit: () => void
}

type PanelDock = 'free' | 'left' | 'right' | 'top' | 'bottom'

interface PanelPosition {
  x: number
  y: number
  dock: PanelDock
}

const PANEL_WIDTH = 380
const PANEL_HEIGHT = 650
const PANEL_STORAGE_KEY = 'a4-word-memory-panel-position'
const PAPER_STORAGE_KEY = 'a4-word-memory-mobile-paper-position'

function panelSize(dock: PanelDock = 'free') {
  if (dock === 'top' || dock === 'bottom') {
    return {
      width: Math.min(900, window.innerWidth - 24),
      height: Math.min(250, window.innerHeight - 142),
    }
  }
  return {
    width: Math.min(PANEL_WIDTH, window.innerWidth - 24),
    height: Math.min(PANEL_HEIGHT, window.innerHeight - 142),
  }
}

function dockedPanelPosition(dock: Exclude<PanelDock, 'free'>): PanelPosition {
  const { width, height } = panelSize(dock)
  const sideY = Math.max(128, (window.innerHeight - height) / 2)
  if (dock === 'left') return { x: 12, y: sideY, dock }
  if (dock === 'right') return { x: window.innerWidth - width - 12, y: sideY, dock }
  if (dock === 'top') return { x: (window.innerWidth - width) / 2, y: 128, dock }
  return { x: (window.innerWidth - width) / 2, y: window.innerHeight - height - 12, dock }
}

function initialPanelPosition(): PanelPosition {
  try {
    const stored = JSON.parse(localStorage.getItem(PANEL_STORAGE_KEY) ?? '') as PanelPosition
    if (Number.isFinite(stored.x) && Number.isFinite(stored.y)) return stored.dock === 'free' ? stored : dockedPanelPosition(stored.dock)
  } catch {
    // Use the default dock when no valid preference has been stored.
  }
  return dockedPanelPosition('right')
}

function initialMobilePaperPosition() {
  try {
    const stored = JSON.parse(localStorage.getItem(PAPER_STORAGE_KEY) ?? '') as { x: number; y: number }
    if (Number.isFinite(stored.x) && Number.isFinite(stored.y)) return stored
  } catch {
    // Use the default corner when no valid preference has been stored.
  }
  return { x: Math.max(8, window.innerWidth - 146), y: Math.max(90, window.innerHeight - 300) }
}

function speak(text: string, accent: AppSettings['accent'], onFailure?: () => void) {
  if (!('speechSynthesis' in window)) {
    onFailure?.()
    return false
  }
  const synthesis = window.speechSynthesis
  synthesis.cancel()
  synthesis.resume()
  const utterance = new SpeechSynthesisUtterance(text)
  const voices = synthesis.getVoices()
  utterance.voice = voices.find((voice) => voice.lang === accent) ?? voices.find((voice) => voice.lang.startsWith('en')) ?? null
  utterance.lang = accent
  utterance.rate = .82
  utterance.volume = 1
  utterance.onerror = () => onFailure?.()
  synthesis.speak(utterance)
  return true
}

export function StudyView({ initial, words, settings, onSettings, onFinish, onExit }: StudyViewProps) {
  const [session, setSession] = useState(initial)
  const [spelling, setSpelling] = useState('')
  const [message, setMessage] = useState('')
  const [currentPage, setCurrentPage] = useState(initial.preview?.page ?? Math.max(0, ...initial.placed.map((item) => item.page)))
  const [highlightedId, setHighlightedId] = useState<string>()
  const [panelPosition, setPanelPosition] = useState<PanelPosition>(initialPanelPosition)
  const [mobileSurface, setMobileSurface] = useState<'card' | 'paper'>('card')
  const [mobilePaperPosition, setMobilePaperPosition] = useState(initialMobilePaperPosition)
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.innerWidth <= 700)
  const [nextReviewAt, setNextReviewAt] = useState<string>()
  const autoSpokenKeyRef = useRef<string | undefined>(undefined)
  const dragOffset = useRef<{ x: number; y: number } | undefined>(undefined)
  const paperDrag = useRef<{ pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean } | undefined>(undefined)
  const suppressPaperExpand = useRef(false)
  const wordsById = useMemo(() => new Map(words.map((word) => [word.id, word])), [words])
  const currentWord = wordsById.get(session.wordIds[session.currentWordIndex])
  const recallPlacement = session.placed[session.recallIndex]
  const recallWord = recallPlacement ? wordsById.get(recallPlacement.wordId) : undefined
  const relearnWord = session.selectedRecallWordId ? wordsById.get(session.selectedRecallWordId) : undefined

  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const synthesis = window.speechSynthesis
    synthesis.getVoices()
    const refreshVoices = () => synthesis.getVoices()
    synthesis.addEventListener('voiceschanged', refreshVoices)
    return () => synthesis.removeEventListener('voiceschanged', refreshVoices)
  }, [])

  useEffect(() => () => {
    stopPronunciationAudio()
    window.speechSynthesis?.cancel()
  }, [])

  useEffect(() => {
    setMobileSurface('card')
  }, [session.stage])

  useEffect(() => {
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(panelPosition))
  }, [panelPosition])

  useEffect(() => {
    localStorage.setItem(PAPER_STORAGE_KEY, JSON.stringify(mobilePaperPosition))
  }, [mobilePaperPosition])

  useEffect(() => {
    function keepPaperVisible() {
      const width = 136
      const height = 204
      setIsMobileViewport(window.innerWidth <= 700)
      setMobilePaperPosition((current) => ({
        x: Math.max(8, Math.min(window.innerWidth - width - 8, current.x)),
        y: Math.max(72, Math.min(window.innerHeight - height - 74, current.y)),
      }))
    }
    window.addEventListener('resize', keepPaperVisible)
    return () => window.removeEventListener('resize', keepPaperVisible)
  }, [])

  useEffect(() => {
    function movePanel(event: PointerEvent) {
      if (!dragOffset.current) return
      const { width, height } = panelSize()
      setPanelPosition({
        x: Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - dragOffset.current.x)),
        y: Math.max(120, Math.min(window.innerHeight - height - 8, event.clientY - dragOffset.current.y)),
        dock: 'free',
      })
    }
    function stopDragging() { dragOffset.current = undefined }
    window.addEventListener('pointermove', movePanel)
    window.addEventListener('pointerup', stopDragging)
    window.addEventListener('pointercancel', stopDragging)
    return () => {
      window.removeEventListener('pointermove', movePanel)
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
    }
  }, [])

  useEffect(() => {
    function keepPanelVisible() {
      if (panelPosition.dock !== 'free') setPanelPosition(dockedPanelPosition(panelPosition.dock))
      else {
        const { width, height } = panelSize()
        setPanelPosition((current) => ({ ...current, x: Math.max(8, Math.min(window.innerWidth - width - 8, current.x)), y: Math.max(120, Math.min(window.innerHeight - height - 8, current.y)) }))
      }
    }
    window.addEventListener('resize', keepPanelVisible)
    return () => window.removeEventListener('resize', keepPanelVisible)
  }, [panelPosition.dock])

  function startPanelDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (window.innerWidth <= 700) return
    dragOffset.current = { x: event.clientX - panelPosition.x, y: event.clientY - panelPosition.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function dockPanel(dock: Exclude<PanelDock, 'free'>) {
    setPanelPosition(dockedPanelPosition(dock))
  }

  function playWord(word: string) {
    playOnlinePronunciation(word, settings.accent, () => {
      speak(word, settings.accent, () => setMessage('在线发音和浏览器朗读都不可用，请检查网络或系统语音设置'))
    })
  }

  function changeMobileSurface(next: 'card' | 'paper') {
    setMobileSurface(next)
    if (next !== 'card') return
    const visibleWord = session.stage === 'learn' ? currentWord
      : session.stage === 'relearn' ? relearnWord
        : session.stage === 'recall' && session.selectedRecallWordId ? recallWord
          : undefined
    if (visibleWord) playWord(visibleWord.word)
  }

  function startMobilePaperDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!isMobileViewport || event.button !== 0) return
    paperDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - mobilePaperPosition.x,
      offsetY: event.clientY - mobilePaperPosition.y,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveMobilePaper(event: React.PointerEvent<HTMLDivElement>) {
    const drag = paperDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true
    if (!drag.moved) return
    const width = 136
    const height = 204
    setMobilePaperPosition({
      x: Math.max(8, Math.min(window.innerWidth - width - 8, event.clientX - drag.offsetX)),
      y: Math.max(72, Math.min(window.innerHeight - height - 74, event.clientY - drag.offsetY)),
    })
  }

  function endMobilePaperDrag(event: React.PointerEvent<HTMLDivElement>) {
    const drag = paperDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    paperDrag.current = undefined
    if (drag.moved) {
      suppressPaperExpand.current = true
      window.setTimeout(() => { suppressPaperExpand.current = false }, 350)
    }
  }

  function expandMobilePaper() {
    if (suppressPaperExpand.current) {
      suppressPaperExpand.current = false
      return
    }
    changeMobileSurface('paper')
  }

  useEffect(() => {
    const word = session.stage === 'learn' ? currentWord : session.stage === 'relearn' ? relearnWord : undefined
    if (!word) return
    const key = session.stage === 'learn'
      ? `learn:${session.currentWordIndex}:${word.id}`
      : `relearn:${session.recallRound}:${session.recallIndex}:${word.id}`
    if (autoSpokenKeyRef.current === key) return
    autoSpokenKeyRef.current = key
    playWord(word.word)
  }, [currentWord, relearnWord, session.currentWordIndex, session.recallIndex, session.recallRound, session.stage, settings.accent])

  async function update(next: StudySession) {
    const value = { ...next, updatedAt: new Date().toISOString() }
    try {
      await db.sessions.put(value)
      setSession(value)
    } catch {
      setMessage('学习进度保存失败，可能是本地存储空间不足。请先导出备份并释放浏览器空间。')
    }
  }

  async function complete(next: StudySession) {
    try {
      const finished = await finishSession(next)
      playFeedbackSound('finish', settings.soundEffects)
      const cards = (await db.cards.bulkGet(finished.wordIds)).filter(Boolean)
      const nextDue = cards.map((card) => new Date(card!.card.due).getTime()).filter(Number.isFinite).sort((a, b) => a - b)[0]
      if (nextDue) setNextReviewAt(new Date(nextDue).toISOString())
      setSession(finished)
      onFinish(finished)
    } catch {
      setMessage('本轮结果保存失败，请先不要关闭页面，并检查浏览器可用存储空间。')
    }
  }

  async function endRecallOrContinue(next: StudySession) {
    if (next.recallIndex < next.recallLimit) {
      await update({ ...next, stage: 'recall', selectedRecallWordId: undefined, revealedMeaning: false })
      return
    }
    if (next.placed.length >= next.wordIds.length) {
      await complete(next)
      return
    }
    await update({ ...next, stage: 'learn', currentWordIndex: next.placed.length, repetitions: 0, recallIndex: 0, selectedRecallWordId: undefined, revealedMeaning: false })
  }

  async function markRepetition() {
    playFeedbackSound('complete', settings.soundEffects)
    const repetitions = session.repetitions + 1
    if (session.stage === 'relearn' && repetitions >= 3) {
      await endRecallOrContinue({ ...session, repetitions: 0 })
      return
    }
    if (session.stage === 'learn' && repetitions >= 3) {
      await update({ ...session, repetitions: 3, stage: 'spell' })
      setSpelling('')
      return
    }
    await update({ ...session, repetitions })
  }

  async function submitSpelling(event: React.FormEvent) {
    event.preventDefault()
    if (!currentWord) return
    if (normalizeWord(spelling) !== currentWord.normalizedWord) {
      playFeedbackSound('error', settings.soundEffects)
      setMessage('拼写不正确，请再试一次')
      await update({ ...session, metrics: { ...session.metrics, spellingErrors: session.metrics.spellingErrors + 1 } })
      return
    }
    playFeedbackSound('correct', settings.soundEffects)
    setMessage('拼写正确，可以放到纸上了')
    const next = { ...session, stage: 'place' as const, preview: undefined }
    if (session.placementMode === 'auto') {
      const placement = findRandomPlacement(currentWord.word, session.placed, settings.fontScale)
      await placeWord(next, placement)
    } else {
      await update(next)
    }
  }

  async function revealAnswer(skip: boolean) {
    if (!currentWord) return
    playFeedbackSound(skip ? 'error' : 'complete', settings.soundEffects)
    setSpelling(currentWord.word)
    setMessage(skip ? '已记为忘记。重新背3遍后，再正确拼写。' : '重新背3遍后，再正确拼写。')
    await update({
      ...session,
      stage: 'learn',
      repetitions: 0,
      metrics: {
        ...session.metrics,
        answerReveals: session.metrics.answerReveals + 1,
        spellingSkips: session.metrics.spellingSkips + (skip ? 1 : 0),
      },
      spellingForgottenWordIds: skip && !session.spellingForgottenWordIds.includes(currentWord.id)
        ? [...session.spellingForgottenWordIds, currentWord.id]
        : session.spellingForgottenWordIds,
    })
  }

  async function placeWord(base: StudySession, placement: Omit<PlacedWord, 'wordId' | 'order'>) {
    if (!currentWord) return
    playFeedbackSound('place', settings.soundEffects)
    const placed: PlacedWord[] = [...base.placed, { ...placement, wordId: currentWord.id, order: base.placed.length + 1 }]
    const shouldRecall = placed.length % 3 === 0 || placed.length === base.wordIds.length
    setCurrentPage(placement.page)
    if (isMobileViewport) setMobileSurface('card')
    setMessage(shouldRecall ? `已写入${placed.length}个单词，开始累积回忆` : '已写入纸面，继续下一个单词')
    if (shouldRecall) {
      await update({ ...base, placed, preview: undefined, stage: 'recall', recallIndex: 0, recallLimit: placed.length, recallRound: base.recallRound + 1, selectedRecallWordId: undefined, revealedMeaning: false })
    } else {
      await update({ ...base, placed, preview: undefined, stage: 'learn', currentWordIndex: placed.length, repetitions: 0 })
    }
  }

  async function selectPaperWord(item: PlacedWord) {
    if (session.stage !== 'recall') {
      playWord(wordsById.get(item.wordId)?.word ?? '')
      return
    }
    if (item.wordId !== recallPlacement?.wordId) {
      playFeedbackSound('error', settings.soundEffects)
      setMessage('顺序不对，请继续寻找')
      window.setTimeout(() => setMessage(''), 1800)
      return
    }
    setMessage('先在心里回忆释义，再显示答案')
    playWord(wordsById.get(item.wordId)?.word ?? '')
    if (isMobileViewport) setMobileSurface('card')
    await update({ ...session, selectedRecallWordId: item.wordId, revealedMeaning: false })
  }

  async function rateRecall(rating: RecallRating) {
    if (!recallWord) return
    playFeedbackSound(rating === 'remembered' ? 'correct' : rating === 'forgotten' ? 'error' : 'complete', settings.soundEffects)
    const event = { id: crypto.randomUUID(), wordId: recallWord.id, rating, round: session.recallRound, createdAt: new Date().toISOString() }
    const next = { ...session, events: [...session.events, event], recallIndex: session.recallIndex + 1, selectedRecallWordId: undefined, revealedMeaning: false }
    if (rating === 'forgotten') {
      await update({ ...next, stage: 'relearn', repetitions: 0, selectedRecallWordId: recallWord.id })
      return
    }
    await endRecallOrContinue(next)
  }

  async function hintPosition() {
    if (!recallPlacement) return
    playFeedbackSound('complete', settings.soundEffects)
    setCurrentPage(recallPlacement.page)
    setHighlightedId(recallPlacement.wordId)
    setMessage('已提示当前位置，请继续完成回忆')
    window.setTimeout(() => setHighlightedId(undefined), 1800)
    await update({ ...session, metrics: { ...session.metrics, positionHints: session.metrics.positionHints + 1 } })
  }

  async function toggleSequence() {
    const next = { ...settings, showSequence: !settings.showSequence }
    onSettings(next)
    if (!settings.showSequence && session.stage === 'recall') {
      await update({ ...session, metrics: { ...session.metrics, sequenceAids: session.metrics.sequenceAids + 1 } })
    }
  }

  async function revealRecallMeaning() {
    playFeedbackSound('complete', settings.soundEffects)
    await update({ ...session, revealedMeaning: true })
  }

  const placingBox = currentWord && session.stage === 'place' && (!isMobileViewport || mobileSurface === 'paper') ? { word: currentWord.word, ...estimateWordBox(currentWord.word, settings.fontScale) } : undefined
  const progress = session.wordIds.length ? session.placed.length / session.wordIds.length : 0
  const paperPages = Math.max(1, ...session.placed.map((item) => item.page + 1), session.preview ? session.preview.page + 1 : 1)

  if (session.stage === 'complete') {
    const summary = summaryFor(session)
    return (
      <div className="completion-page">
        <div className="completion-mark"><Check size={34} /></div>
        <p className="eyebrow">本轮完成</p>
        <h1>这张记忆纸写完了</h1>
        <p className="muted">{session.libraryName} · {summary.totalWords}词 · {summary.durationMinutes}分钟</p>
        <div className="summary-grid">
          <div><strong>{Math.round(summary.firstRecallRate * 100)}%</strong><span>首次记忆率</span></div>
          <div><strong>{Math.round(summary.finalMasteryRate * 100)}%</strong><span>最终掌握率</span></div>
          <div><strong>{summary.remembered}</strong><span>记得次数</span></div>
          <div><strong>{summary.forgotten}</strong><span>忘记次数</span></div>
        </div>
        {nextReviewAt && <p className="next-review">本轮最早复习时间：<strong>{new Date(nextReviewAt).toLocaleString('zh-CN')}</strong></p>}
        <button className="primary" onClick={onExit}>返回首页</button>
      </div>
    )
  }

  return (
    <div className={`study-layout mobile-surface-${mobileSurface}`}>
      <header className="study-header">
        <button className="tool-button" onClick={onExit}><ArrowLeft size={17} />暂时离开</button>
        <div className="study-progress">
          <span>{session.libraryName}</span>
          <div className="progress-track"><i style={{ width: `${progress * 100}%` }} /></div>
          <span>{session.placed.length}/{session.wordIds.length}</span>
        </div>
        <button className={settings.showSequence ? 'tool-button active' : 'tool-button'} onClick={toggleSequence}>{settings.showSequence ? <EyeOff size={17} /> : <Eye size={17} />}{settings.showSequence ? '隐藏序号' : '显示序号'}</button>
      </header>

      <div className={`mobile-paper-window${mobileSurface === 'paper' ? ' is-expanded' : ' is-collapsed'}`} style={isMobileViewport && mobileSurface === 'card' ? { left: mobilePaperPosition.x, top: mobilePaperPosition.y } : undefined}>
        {isMobileViewport && mobileSurface === 'card' && <div className="mobile-paper-drag-handle" onPointerDown={startMobilePaperDrag} onPointerMove={moveMobilePaper} onPointerUp={endMobilePaperDrag} onPointerCancel={endMobilePaperDrag} onClick={expandMobilePaper} title="拖动A4纸，点击放大">
          <GripHorizontal size={15} /><span>A4纸</span><small>{currentPage + 1}/{paperPages}</small><Maximize2 size={14} />
        </div>}
        <PaperCanvas
          placed={session.placed}
          words={wordsById}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onWordClick={(item) => {
            if (isMobileViewport && mobileSurface !== 'paper') {
              changeMobileSurface('paper')
              return
            }
            void selectPaperWord(item)
          }}
          onPreview={(preview) => update({ ...session, preview })}
          onInvalidPlacement={() => { playFeedbackSound('error', settings.soundEffects); setMessage('这里空间不足或超出纸面，请换一个位置，或新建下一页') }}
          preview={session.preview}
          placing={placingBox}
          showSequence={settings.showSequence}
          highlightedId={highlightedId}
          onSpeak={playWord}
          canHint={session.stage === 'recall' && !session.selectedRecallWordId}
          onHint={hintPosition}
          mobileExpanded={mobileSurface === 'paper'}
          onMobileToggle={() => {
            if (isMobileViewport && session.stage === 'place') return
            changeMobileSurface(mobileSurface === 'paper' ? 'card' : 'paper')
          }}
          showMobileToggle={!isMobileViewport || session.stage !== 'place'}
        />
        {isMobileViewport && mobileSurface === 'paper' && session.stage === 'place' && currentWord && <div className="mobile-paper-placement-bar">
          <div><strong>{currentWord.word}</strong><span className={!session.preview && message.includes('空间不足') ? 'has-error' : ''}>{session.preview ? '位置已选' : message.includes('空间不足') ? message : '点纸面选择位置'}</span></div>
          {session.preview && <button className="text-button" onClick={() => update({ ...session, preview: undefined })}>重选</button>}
          <button className="primary" disabled={!session.preview} onClick={() => session.preview && void placeWord(session, session.preview)}>确认放置</button>
        </div>}
        {isMobileViewport && mobileSurface === 'paper' && session.stage === 'recall' && message.includes('顺序不对') && <div className="mobile-paper-feedback" role="status">顺序不对，请继续寻找</div>}
      </div>

      <aside className={`study-panel floating-panel dock-${panelPosition.dock} stage-${session.stage}`} style={{ left: panelPosition.x, top: panelPosition.y }}>
        <div className="floating-panel-bar" onPointerDown={startPanelDrag}>
          <span><GripHorizontal size={18} />拖动学习面板</span>
          <div className="dock-actions" aria-label="停靠学习面板">
            <button className={panelPosition.dock === 'left' ? 'active' : ''} onPointerDown={(event) => event.stopPropagation()} onClick={() => dockPanel('left')} aria-label="停靠左侧" title="停靠左侧"><PanelLeft /></button>
            <button className={panelPosition.dock === 'top' ? 'active' : ''} onPointerDown={(event) => event.stopPropagation()} onClick={() => dockPanel('top')} aria-label="停靠顶部" title="停靠顶部"><PanelTop /></button>
            <button className={panelPosition.dock === 'bottom' ? 'active' : ''} onPointerDown={(event) => event.stopPropagation()} onClick={() => dockPanel('bottom')} aria-label="停靠底部" title="停靠底部"><PanelBottom /></button>
            <button className={panelPosition.dock === 'right' ? 'active' : ''} onPointerDown={(event) => event.stopPropagation()} onClick={() => dockPanel('right')} aria-label="停靠右侧" title="停靠右侧"><PanelRight /></button>
          </div>
        </div>
        <div className="stage-label">
          {session.stage === 'learn' && <><BookOpenCheck />记忆当前单词</>}
          {session.stage === 'spell' && <><Keyboard />拼写当前单词</>}
          {session.stage === 'place' && <><MapPin />选择纸面位置</>}
          {session.stage === 'recall' && <><RotateCcw />第{session.recallRound}轮累积回忆</>}
          {session.stage === 'relearn' && <><RotateCcw />重新记忆</>}
        </div>

        {(session.stage === 'learn' || session.stage === 'relearn') && (session.stage === 'relearn' ? relearnWord : currentWord) && (() => {
          const word = session.stage === 'relearn' ? relearnWord! : currentWord!
          return <div className="word-study">
            <button className="word-title" onClick={() => playWord(word.word)}>{word.word}<Volume2 size={19} /></button>
            <p className="phonetic">{word.phonetic || '暂无音标'}</p>
            <MeaningDisplay meaning={word.meaning} partOfSpeech={word.partOfSpeech} />
            <div className="repetition-dots" aria-label={`已完成${session.repetitions}遍`}>
              {[1, 2, 3].map((item) => <i key={item} className={item <= session.repetitions ? 'done' : ''} />)}
            </div>
            <button className="primary wide" onClick={markRepetition}>完成第{Math.min(3, session.repetitions + 1)}遍</button>
          </div>
        })()}

        {session.stage === 'spell' && currentWord && <form className="spelling-form" onSubmit={submitSpelling}>
          <p className="prompt">根据刚才的记忆，完整拼写这个单词</p>
          <input autoFocus value={spelling} onChange={(event) => { setSpelling(event.target.value); setMessage('') }} autoComplete="off" spellCheck={false} aria-label="拼写单词" />
          <button className="primary wide" type="submit">检查拼写</button>
          <div className="secondary-actions">
            <button type="button" onClick={() => revealAnswer(false)}>查看答案</button>
            <button type="button" onClick={() => revealAnswer(true)}>暂时跳过</button>
          </div>
        </form>}

        {session.stage === 'place' && currentWord && <div className="placement-panel">
          <p className="prompt">{isMobileViewport ? '在悬浮纸上选好位置，再点纸面底部的“确认放置”。' : `点击悬浮 A4 纸放大，再选“${currentWord.word}”的位置。`}</p>
          {!isMobileViewport && session.preview ? <>
            <div className="placement-ready"><Check />当前位置可用</div>
            <button className="primary wide" onClick={() => placeWord(session, session.preview!)}>确认放置</button>
            <button className="text-button" onClick={() => update({ ...session, preview: undefined })}>重新选择</button>
          </> : !isMobileViewport && <p className="muted small">确认后位置将锁定，不能移动。</p>}
        </div>}

        {session.stage === 'recall' && recallWord && <div className="recall-panel">
          <p className="recall-counter">顺序 {session.recallIndex + 1} / {session.recallLimit}</p>
          {!session.selectedRecallWordId ? <>
            <p className="prompt">请在纸面中找到下一个单词。系统不会提前高亮它。</p>
            <p className="muted small">点击错误只会提示顺序不对，不会计入成绩。</p>
          </> : !session.revealedMeaning ? <>
            <h2>{recallWord.word}</h2>
            <p className="prompt">先在心里说出释义。</p>
            <button className="primary wide" onClick={revealRecallMeaning}>显示释义</button>
          </> : <>
            <h2>{recallWord.word}</h2>
            <p className="phonetic">{recallWord.phonetic || '暂无音标'}</p>
            <MeaningDisplay meaning={recallWord.meaning} partOfSpeech={recallWord.partOfSpeech} compact />
            <div className="rating-actions">
              <button className="remember" onClick={() => rateRecall('remembered')}>记得</button>
              <button className="fuzzy" onClick={() => rateRecall('fuzzy')}>模糊</button>
              <button className="forget" onClick={() => rateRecall('forgotten')}>忘记</button>
            </div>
          </>}
        </div>}

        {message && <div className={message.includes('不正确') || message.includes('顺序不对') || message.includes('朗读') ? 'inline-message error' : 'inline-message'}><span>{message}</span><button onClick={() => setMessage('')} aria-label="关闭提示"><X size={15} /></button></div>}
      </aside>
    </div>
  )
}
