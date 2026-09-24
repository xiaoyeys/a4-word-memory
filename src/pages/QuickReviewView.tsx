import { ArrowLeft, Check, Heart, Keyboard, RefreshCw, Timer, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { MeaningDisplay } from '../components/MeaningDisplay'
import { db } from '../db'
import { playOnlinePronunciation, stopPronunciationAudio } from '../lib/pronunciation'
import { nextReviewQueue, normalizeQuickReviewSession } from '../lib/review'
import { finishSession, savePartialSession } from '../lib/session'
import { playFeedbackSound } from '../lib/sound'
import { findRandomPlacement, normalizeWord } from '../lib/study'
import type { AppSettings, PlacedWord, RecallRating, StoredCard, StudySession, WordEntry } from '../types'

interface QuickReviewViewProps {
  initial: StudySession
  words: WordEntry[]
  settings: AppSettings
  onFinish: (session: StudySession) => void
  onRetry: (session: StudySession, wordIds: string[]) => void
  onExit: () => void
}

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
}

function browserSpeak(text: string, settings: AppSettings) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const voices = window.speechSynthesis.getVoices()
  utterance.voice = voices.find((voice) => voice.lang === settings.accent) ?? voices.find((voice) => voice.lang.startsWith('en')) ?? null
  utterance.lang = settings.accent
  utterance.rate = settings.speechRate
  window.speechSynthesis.speak(utterance)
}

export function QuickReviewView({ initial, words, settings, onFinish, onRetry, onExit }: QuickReviewViewProps) {
  const [session, setSession] = useState(() => normalizeQuickReviewSession(initial))
  const [cards, setCards] = useState<Map<string, StoredCard>>(new Map())
  const [cardsReady, setCardsReady] = useState(false)
  const [spelling, setSpelling] = useState('')
  const [spellingMistake, setSpellingMistake] = useState(false)
  const [message, setMessage] = useState('')
  const [favoriteWordIds, setFavoriteWordIds] = useState<Set<string>>(new Set())
  const activeSecondsRef = useRef(initial.activeSeconds ?? 0)
  const activeSinceRef = useRef(Date.now())
  const lastCheckpointRef = useRef(Date.now())
  const autoSpokenKeyRef = useRef<string | undefined>(undefined)
  const [elapsedSeconds, setElapsedSeconds] = useState(initial.activeSeconds ?? 0)
  const wordsById = useMemo(() => new Map(words.map((word) => [word.id, word])), [words])
  const queue = session.reviewQueue?.length ? session.reviewQueue : session.wordIds
  const reviewIndex = session.reviewIndex ?? 0
  const currentWord = wordsById.get(queue[reviewIndex])
  const currentCard = currentWord ? cards.get(currentWord.id) : undefined
  const spellingReview = Boolean(currentCard?.pendingDictation)

  function checkpoint(value: StudySession) {
    const now = Date.now()
    const activeSeconds = activeSecondsRef.current + Math.floor((now - activeSinceRef.current) / 1000)
    activeSecondsRef.current = activeSeconds
    activeSinceRef.current = now
    lastCheckpointRef.current = now
    setElapsedSeconds(activeSeconds)
    return { ...value, activeSeconds }
  }

  useEffect(() => {
    const ids = [...new Set(session.wordIds)]
    void db.cards.bulkGet(ids).then((stored) => {
      const next = new Map(stored.filter(Boolean).map((card) => [card!.wordId, card!]))
      setCards(next)
      setFavoriteWordIds(new Set([...next.values()].filter((card) => card.favorite).map((card) => card.wordId)))
      setCardsReady(true)
    })
  }, [session.wordIds])

  useEffect(() => {
    if (initial.stage !== 'quick-review' && initial.stage !== 'complete') void savePartialSession(session)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now()
      setElapsedSeconds(activeSecondsRef.current + Math.floor((now - activeSinceRef.current) / 1000))
      if (now - lastCheckpointRef.current >= 10000) void savePartialSession(checkpoint(session))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [session])

  useEffect(() => () => {
    stopPronunciationAudio()
    window.speechSynthesis?.cancel()
  }, [])

  useEffect(() => {
    setSpelling('')
    setSpellingMistake(false)
    setMessage('')
    if (!cardsReady || !currentWord || spellingReview || !settings.autoSpeak || session.stage === 'complete') return
    const key = `${reviewIndex}:${currentWord.id}`
    if (autoSpokenKeyRef.current === key) return
    autoSpokenKeyRef.current = key
    playWord(currentWord.word)
  }, [cardsReady, currentWord?.id, reviewIndex, session.stage, settings.autoSpeak, spellingReview])

  function playWord(word: string) {
    playOnlinePronunciation(word, settings.accent, () => browserSpeak(word, settings))
  }

  async function update(next: StudySession) {
    const saved = await savePartialSession({ ...checkpoint(next), updatedAt: new Date().toISOString() })
    setSession(saved)
  }

  async function leaveReview() {
    await savePartialSession(checkpoint(session))
    onExit()
  }

  async function toggleFavorite(wordId: string) {
    const favorite = !favoriteWordIds.has(wordId)
    await db.cards.update(wordId, { favorite })
    setFavoriteWordIds((current) => {
      const next = new Set(current)
      if (favorite) next.add(wordId)
      else next.delete(wordId)
      return next
    })
  }

  async function revealMeaning() {
    playFeedbackSound('complete', settings.soundEffects)
    await update({ ...session, revealedMeaning: true, metrics: { ...session.metrics, answerReveals: session.metrics.answerReveals + 1 } })
  }

  async function rate(rating: RecallRating) {
    if (!currentWord) return
    playFeedbackSound(rating === 'remembered' ? 'correct' : rating === 'forgotten' ? 'error' : 'complete', settings.soundEffects)
    const reviewStep = nextReviewQueue(queue, session.reviewAttempts ?? {}, currentWord.id, rating)
    const { attempt, attempts, queue: nextQueue } = reviewStep
    const firstRatings = { ...(session.reviewFirstRatings ?? {}) }
    firstRatings[currentWord.id] ??= rating
    const event = { id: crypto.randomUUID(), wordId: currentWord.id, rating, round: attempt, createdAt: new Date().toISOString() }
    let placed = session.placed
    if (rating === 'forgotten' && !placed.some((item) => item.wordId === currentWord.id)) {
      const position = findRandomPlacement(currentWord.word, placed, settings.fontScale)
      const item: PlacedWord = { ...position, wordId: currentWord.id, order: placed.length + 1 }
      placed = [...placed, item]
    }
    const unmastered = new Set(session.unmasteredWordIds ?? [])
    if (spellingReview) {
      if (rating === 'remembered') unmastered.delete(currentWord.id)
      else unmastered.add(currentWord.id)
    }
    const spellingErrors = spellingReview && rating === 'forgotten'
      ? [...(session.spellingErrorWordIds ?? []), currentWord.id]
      : session.spellingErrorWordIds
    const next: StudySession = {
      ...session,
      stage: 'quick-review',
      reviewQueue: nextQueue,
      reviewIndex: reviewIndex + 1,
      reviewAttempts: attempts,
      reviewFirstRatings: firstRatings,
      revealedMeaning: false,
      events: [...session.events, event],
      placed,
      unmasteredWordIds: [...unmastered],
      spellingErrorWordIds: spellingErrors,
    }
    if ((next.reviewIndex ?? 0) >= nextQueue.length) {
      const finished = await finishSession(checkpoint(next))
      setSession(finished)
      playFeedbackSound('finish', settings.soundEffects)
      onFinish(finished)
      return
    }
    await update(next)
  }

  async function submitSpelling(event: FormEvent) {
    event.preventDefault()
    if (!currentWord) return
    if (normalizeWord(spelling) === currentWord.normalizedWord) {
      await rate('remembered')
      return
    }
    playFeedbackSound('error', settings.soundEffects)
    setSpellingMistake(true)
    setMessage((session.reviewAttempts?.[currentWord.id] ?? 0) > 0 ? '本轮仍未拼对，将保留为待补拼写。' : '请看清正确拼写，稍后会再默写一次。')
  }

  if (session.stage === 'complete') {
    const firstRatings = session.reviewFirstRatings ?? {}
    const retryIds = session.wordIds.filter((id) => firstRatings[id] && firstRatings[id] !== 'remembered')
    const remembered = Object.values(firstRatings).filter((rating) => rating === 'remembered').length
    const fuzzy = Object.values(firstRatings).filter((rating) => rating === 'fuzzy').length
    const forgotten = Object.values(firstRatings).filter((rating) => rating === 'forgotten').length
    return <div className="completion-page quick-review-completion">
      <div className="completion-mark"><Check size={34} /></div>
      <p className="eyebrow">复习完成</p>
      <h1>今天的到期词已经清完</h1>
      <p className="muted">{session.libraryName} · {session.wordIds.length}词 · {Math.max(1, Math.round((session.activeSeconds ?? 0) / 60))}分钟</p>
      <div className="summary-grid review-summary-grid">
        <div><strong>{remembered}</strong><span>首次记得</span></div>
        <div><strong>{fuzzy}</strong><span>首次模糊</span></div>
        <div><strong>{forgotten}</strong><span>首次忘记</span></div>
      </div>
      {retryIds.length > 0 && <div className="review-trouble-list"><p>本轮需要加固</p><div>{retryIds.map((id) => wordsById.get(id)).filter(Boolean).map((word) => <span key={word!.id}>{word!.word}</span>)}</div></div>}
      <div className="completion-actions">
        {retryIds.length > 0 && <button className="secondary" onClick={() => onRetry(session, retryIds)}><RefreshCw size={17} />只重练这 {retryIds.length} 个词</button>}
        <button className="primary" onClick={onExit}>返回首页</button>
      </div>
    </div>
  }

  if (!currentWord) return <div className="completion-page"><p>复习队列为空。</p><button className="primary" onClick={onExit}>返回首页</button></div>
  if (!cardsReady) return <div className="completion-page"><p>正在准备复习卡片…</p></div>

  const uniqueReviewed = Object.keys(session.reviewFirstRatings ?? {}).length
  const progress = session.wordIds.length ? uniqueReviewed / session.wordIds.length : 0
  const attempt = (session.reviewAttempts?.[currentWord.id] ?? 0) + 1

  return <div className="quick-review-page">
    <header className="quick-review-header">
      <button className="tool-button" onClick={() => void leaveReview()}><ArrowLeft size={17} />暂时离开</button>
      <div className="quick-review-progress"><span>{session.libraryName}</span><div className="progress-track"><i style={{ width: `${progress * 100}%` }} /></div><strong>{uniqueReviewed}/{session.wordIds.length}</strong></div>
      <span className="study-timer"><Timer size={15} />{formatElapsed(elapsedSeconds)}</span>
    </header>

    <main className="quick-review-card panel">
      <div className="quick-review-meta"><span>{spellingReview ? <><Keyboard size={15} />待补拼写</> : <>快速复习</>}</span><small>{attempt > 1 ? '再次回忆' : `队列 ${reviewIndex + 1}/${queue.length}`}</small></div>
      {spellingReview ? <form className="quick-dictation" onSubmit={submitSpelling}>
        <p>根据释义默写单词</p>
        <MeaningDisplay meaning={currentWord.meaning} partOfSpeech={settings.showPartOfSpeech ? currentWord.partOfSpeech : undefined} />
        {spellingMistake ? <div className="quick-spelling-answer"><small>正确拼写</small><button type="button" onClick={() => playWord(currentWord.word)}>{currentWord.word}<Volume2 size={18} /></button><button className="primary wide" type="button" onClick={() => void rate('forgotten')}>记住了，继续复习</button></div> : <><input autoFocus value={spelling} onChange={(event) => setSpelling(event.target.value)} autoComplete="off" spellCheck={false} aria-label="默写单词" /><button className="primary wide" type="submit">检查拼写</button></>}
      </form> : <>
        <div className="quick-review-word-row"><button className="quick-review-word" onClick={() => playWord(currentWord.word)}>{currentWord.word}<Volume2 size={21} /></button><button className={favoriteWordIds.has(currentWord.id) ? 'word-favorite active' : 'word-favorite'} onClick={() => void toggleFavorite(currentWord.id)} aria-label={favoriteWordIds.has(currentWord.id) ? '取消收藏单词' : '收藏单词'}><Heart /></button></div>
        {settings.showPhonetic && <p className="phonetic">{currentWord.phonetic || '暂无音标'}</p>}
        {!session.revealedMeaning ? <div className="quick-review-prompt"><p>先在心里回忆它的释义。</p><button className="primary wide" onClick={() => void revealMeaning()}>显示答案</button></div> : <div className="quick-review-answer">
          <MeaningDisplay meaning={currentWord.meaning} partOfSpeech={settings.showPartOfSpeech ? currentWord.partOfSpeech : undefined} />
          <p>刚才回忆得怎么样？</p>
          <div className="rating-actions"><button className="remember" onClick={() => void rate('remembered')}>记得</button><button className="fuzzy" onClick={() => void rate('fuzzy')}>模糊</button><button className="forget" onClick={() => void rate('forgotten')}>忘记</button></div>
        </div>}
      </>}
      {message && <div className="inline-message error">{message}</div>}
    </main>
    <p className="quick-review-footnote">模糊和忘记的词会在本轮末尾再出现一次；忘记词会自动整理到复习错词纸。</p>
  </div>
}
