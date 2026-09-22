import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, Clock3, Flame, Play, RefreshCw, Sparkles, Target } from 'lucide-react'
import { dailyPlan } from '../lib/study'
import type { AppSettings, StoredCard, StudySession, WordEntry, WordLibrary } from '../types'

function localDay(value: string | Date) {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function studyStreak(sessions: StudySession[]) {
  const days = new Set(sessions.filter((session) => session.status === 'completed' && session.completedAt).map((session) => localDay(session.completedAt!)))
  const cursor = new Date()
  if (!days.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (days.has(localDay(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function HomeView(props: {
  library?: WordLibrary
  words: WordEntry[]
  cards: StoredCard[]
  sessions: StudySession[]
  settings: AppSettings
  activeSession?: StudySession
  onChangeLibrary: () => void
  onEditPlan: () => void
  onExtraStudy: () => void
  onStartDaily: (newWordCount: number) => void
  onContinue: () => void
  onAbandon: () => void
}) {
  const { library } = props
  const libraryWords = props.words.filter((word) => word.libraryId === library?.id)
  const wordIds = new Set(libraryWords.map((word) => word.id))
  const libraryCards = props.cards.filter((card) => wordIds.has(card.wordId))
  const cardMap = new Map(libraryCards.map((card) => [card.wordId, card]))
  const completed = props.sessions.filter((session) => session.status === 'completed' && session.completedAt)
  const today = localDay(new Date())
  const todaySessions = completed.filter((session) => session.libraryId === library?.id && localDay(session.completedAt!) === today)
  const todayNewIds = new Set(todaySessions.flatMap((session) => session.newWordIds ?? []))
  const todayWordIds = new Set(todaySessions.flatMap((session) => session.wordIds))
  const remainingNewTarget = Math.max(0, props.settings.dailyNewWordTarget - todayNewIds.size)
  const plan = dailyPlan(libraryWords, cardMap, remainingNewTarget)
  const totalToday = todayWordIds.size + plan.totalCount
  const learned = libraryWords.filter((word) => cardMap.has(word.id)).length
  const progress = library?.wordCount ? Math.round(learned / library.wordCount * 100) : 0
  const streak = studyStreak(completed)
  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - 6)
  const weekDays = new Set(completed.filter((session) => new Date(session.completedAt!).getTime() >= weekStart.getTime()).map((session) => localDay(session.completedAt!))).size
  const estimatedMinutes = Math.max(1, Math.ceil(plan.totalCount * .6))

  return <div className="page-content daily-home">
    <header className="daily-greeting">
      <div><p className="eyebrow">今日学习</p><h1>按计划，写完今天这张纸。</h1></div>
      <div className="streak-chip"><Flame size={19} /><span>连续学习</span><strong>{streak}</strong><span>天</span></div>
    </header>

    {props.activeSession && <section className="resume-banner"><div><span className="resume-icon"><Play /></span><div><strong>上次学习还没有结束</strong><p>{props.activeSession.libraryName} · 已放置 {props.activeSession.placed.length}/{props.activeSession.wordIds.length} 词</p></div></div><div><button className="text-button" onClick={props.onAbandon}>放弃</button><button className="primary" onClick={props.onContinue}>继续学习<ArrowRight size={17} /></button></div></section>}

    <div className="daily-dashboard">
      <section className="current-book-card panel">
        <div className="book-cover"><span>{library?.name.split(' ')[0] ?? 'A4'}</span><small>{library?.name.replace(library.name.split(' ')[0], '').trim() || '自定义词书'}</small></div>
        <div className="book-summary">
          <span className="section-kicker">当前词书</span>
          <h2>{library?.name ?? '请选择词书'}</h2>
          <p>已学 <strong>{learned}</strong> / {library?.wordCount ?? 0} 词</p>
          <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
          <button className="book-change" onClick={props.onChangeLibrary}><RefreshCw size={16} />更换词书</button>
        </div>
      </section>

      <section className="today-plan-card panel">
        <div className="section-heading compact-heading"><div><span className="section-kicker"><Target size={16} />今日计划</span><h2>{plan.totalCount ? `还有 ${plan.totalCount} 个词` : '今日计划已完成'}</h2></div><button className="text-button" onClick={props.onEditPlan}>调整计划</button></div>
        <div className="plan-numbers">
          <div><span className="plan-icon"><BookOpen /></span><small>新词</small><strong>{plan.newCount}</strong></div>
          <div><span className="plan-icon"><RefreshCw /></span><small>复习</small><strong>{plan.dueCount}</strong></div>
          <div><span className="plan-icon"><Clock3 /></span><small>预计用时</small><strong>{plan.totalCount ? estimatedMinutes : 0}<em>分钟</em></strong></div>
        </div>
        {plan.totalCount ? <button className="primary daily-start" disabled={!library || Boolean(props.activeSession)} onClick={() => props.onStartDaily(plan.newCount)}>开始今日学习<ArrowRight /></button> : <button className="secondary daily-start extra-study" disabled={!library || Boolean(props.activeSession)} onClick={props.onExtraStudy}><Sparkles />加量学习<ArrowRight /></button>}
      </section>

      <section className="checkin-card panel">
        <div><CheckCircle2 /><span><small>今日完成</small><strong>{todayWordIds.size} / {Math.max(todayWordIds.size, totalToday)}</strong></span></div>
        <div><CalendarDays /><span><small>本周完成</small><strong>{weekDays} 天</strong></span></div>
      </section>
    </div>
  </div>
}
