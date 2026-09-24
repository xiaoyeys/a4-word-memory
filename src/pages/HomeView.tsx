import { AlertTriangle, ArrowRight, BookOpen, CalendarDays, CheckCircle2, Clock3, Eye, Flame, Play, RefreshCw, Search, Sparkles, Target, X } from 'lucide-react'
import { useState } from 'react'
import { formatPartOfSpeech } from '../components/MeaningDisplay'
import { dailyPlan, isLearnedCard } from '../lib/study'
import { completedDaySet, dayKey, monthCalendar, nextSevenDaysDue, studyStreak } from '../lib/checkin'
import type { AppSettings, StoredCard, StudySession, WordEntry, WordLibrary } from '../types'

export function HomeView(props: {
  library?: WordLibrary
  words: WordEntry[]
  cards: StoredCard[]
  sessions: StudySession[]
  settings: AppSettings
  activeSession?: StudySession
  onEditPlan: () => void
  onExtraStudy: () => void
  onStartWeak: () => void
  onStudyNew: () => void
  onReviewDue: () => void
  onContinue: () => void
  onAbandon: () => void
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewSearch, setPreviewSearch] = useState('')
  const { library } = props
  const libraryWords = props.words.filter((word) => word.libraryId === library?.id)
  const normalizedPreviewSearch = previewSearch.trim().toLowerCase()
  const previewWords = libraryWords.filter((word) => !normalizedPreviewSearch || `${word.word} ${word.meaning} ${word.phonetic ?? ''}`.toLowerCase().includes(normalizedPreviewSearch)).slice(0, 200)
  const wordIds = new Set(libraryWords.map((word) => word.id))
  const libraryCards = props.cards.filter((card) => wordIds.has(card.wordId))
  const cardMap = new Map(libraryCards.map((card) => [card.wordId, card]))
  const completed = props.sessions.filter((session) => session.status === 'completed' && session.completedAt)
  const today = dayKey(new Date())
  const todaySessions = completed.filter((session) => session.libraryId === library?.id && dayKey(session.completedAt!) === today)
  const todayNewIds = new Set(todaySessions.flatMap((session) => session.newWordIds ?? []))
  const todayWordIds = new Set(todaySessions.flatMap((session) => session.wordIds))
  const remainingNewTarget = Math.max(0, props.settings.dailyNewWordTarget - todayNewIds.size)
  const plan = dailyPlan(libraryWords, cardMap, remainingNewTarget)
  const totalToday = todayWordIds.size + plan.totalCount
  const learned = libraryWords.filter((word) => isLearnedCard(cardMap.get(word.id))).length
  const weakWords = libraryWords.filter((word) => {
    const card = cardMap.get(word.id)
    return isLearnedCard(card) && Boolean(card && (card.card.difficulty >= 7 || (card.forgetCount ?? 0) > 0 || (card.fuzzyCount ?? 0) > 0 || (card.spellingErrorCount ?? 0) > 0 || card.important || card.confusing))
  }).sort((a, b) => {
    const aCard = cardMap.get(a.id)!
    const bCard = cardMap.get(b.id)!
    const aErrors = (aCard.forgetCount ?? 0) * 3 + (aCard.spellingErrorCount ?? 0) * 2 + (aCard.fuzzyCount ?? 0)
    const bErrors = (bCard.forgetCount ?? 0) * 3 + (bCard.spellingErrorCount ?? 0) * 2 + (bCard.fuzzyCount ?? 0)
    return bErrors - aErrors || bCard.card.difficulty - aCard.card.difficulty
  })
  const progress = library?.wordCount ? Math.round(learned / library.wordCount * 100) : 0
  const streak = studyStreak(completed, library?.id)
  const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0); weekStart.setDate(weekStart.getDate() - 6)
  const weekDays = new Set(completed.filter((session) => session.libraryId === library?.id && new Date(session.completedAt!).getTime() >= weekStart.getTime()).map((session) => dayKey(session.completedAt!))).size
  const activeDays = completedDaySet(completed, library?.id)
  const calendar = monthCalendar(new Date().getFullYear(), new Date().getMonth(), activeDays)
  const nextReviews = nextSevenDaysDue(libraryCards)
  const estimatedMinutes = Math.max(1, Math.ceil(plan.totalCount * .6))

  return <div className="page-content daily-home">
    <header className="daily-greeting">
      <div><p className="eyebrow">今日学习</p><h1>{library ? '按计划，写完今天这张纸。' : '先选一本词书，建立你的学习计划。'}</h1></div>
      <div className="streak-chip"><Flame size={19} /><span>连续学习</span><strong>{streak}</strong><span>天</span></div>
    </header>

    {props.activeSession && <section className="resume-banner"><div><span className="resume-icon"><Play /></span><div><strong>上次学习还没有结束</strong><p>{props.activeSession.libraryName} · {props.activeSession.mode === 'due' ? `已复习 ${Object.keys(props.activeSession.reviewFirstRatings ?? {}).length}/${props.activeSession.wordIds.length} 词` : `已放置 ${props.activeSession.placed.length}/${props.activeSession.wordIds.length} 词`}</p></div></div><div><button className="text-button" onClick={props.onAbandon}>放弃</button><button className="primary" onClick={props.onContinue}>继续学习<ArrowRight size={17} /></button></div></section>}

    <div className="daily-dashboard">
      <section className="current-book-card panel">
        <div className="book-cover"><span>{library?.name.split(' ')[0] ?? 'A4'}</span><small>{library ? library.name.replace(library.name.split(' ')[0], '').trim() || '自定义词书' : '学习计划'}</small></div>
        <div className="book-summary">
          <span className="section-kicker">当前词书</span>
          <h2>{library?.name ?? '未选择词书'}</h2>
          <p>已学 <strong>{learned}</strong> / {library?.wordCount ?? 0} 词</p>
          <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
          <div className="book-card-actions"><button className="book-change" onClick={props.onEditPlan}><Target size={16} />调整计划</button>{library && <button className="book-change" onClick={() => setPreviewOpen(true)}><Eye size={16} />预览单词</button>}</div>
        </div>
      </section>

      <section className="today-plan-card panel">
        <div className="section-heading compact-heading"><div><span className="section-kicker"><Target size={16} />今日计划</span><h2>{!library ? '尚未建立计划' : plan.totalCount ? `还有 ${plan.totalCount} 个词` : '今日计划已完成'}</h2></div></div>
        <div className="plan-numbers">
          <div><span className="plan-icon"><BookOpen /></span><small>新词</small><strong>{plan.newCount}</strong></div>
          <div><span className="plan-icon"><RefreshCw /></span><small>复习</small><strong>{plan.dueCount}</strong></div>
          <div><span className="plan-icon"><Clock3 /></span><small>预计用时</small><strong>{plan.totalCount ? estimatedMinutes : 0}<em>分钟</em></strong></div>
        </div>
        <div className="daily-entry-actions"><button className="primary" disabled={!library || Boolean(props.activeSession) || plan.newCount === 0} onClick={props.onStudyNew}><BookOpen />学习新词 <strong>{plan.newCount}</strong><ArrowRight /></button><button className="secondary" disabled={!library || Boolean(props.activeSession) || plan.dueCount === 0} onClick={props.onReviewDue}><RefreshCw />复习到期词 <strong>{plan.dueCount}</strong><ArrowRight /></button><button className="extra-study-action" disabled={!library || Boolean(props.activeSession)} onClick={props.onExtraStudy}><Sparkles size={17} />加量学习</button></div>
      </section>

      <section className="checkin-card panel">
        <div><CheckCircle2 /><span><small>今日完成</small><strong>{todayWordIds.size} / {Math.max(todayWordIds.size, totalToday)}</strong></span></div>
        <div><CalendarDays /><span><small>本周完成</small><strong>{weekDays} 天</strong></span></div>
      </section>
    </div>
    <div className="home-insights-grid">
      <section className="panel checkin-calendar"><div className="section-heading compact-heading"><div><span className="section-kicker"><CalendarDays size={16} />学习打卡</span><h2>{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}</h2></div><span className="calendar-caption">已学习 {activeDays.size} 天</span></div><div className="calendar-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{calendar.map((item, index) => item ? <span key={item.key} className={item.completed ? 'calendar-day completed' : dayKey(new Date()) === item.key ? 'calendar-day today' : 'calendar-day'}>{new Date(item.date).getDate()}</span> : <i key={`empty-${index}`} />)}</div></section>
      <section className="panel upcoming-reviews"><div className="section-heading compact-heading"><div><span className="section-kicker"><RefreshCw size={16} />智能复习</span><h2>未来 7 天复习量</h2></div></div><div className="review-bars">{nextReviews.map((item) => <div key={item.key}><span>{item.date.toLocaleDateString('zh-CN', { weekday: 'short' })}</span><div><i style={{ height: `${Math.max(8, Math.min(100, item.count * 12))}%` }} /></div><strong>{item.count}</strong></div>)}</div><p className="field-help">到期词从“复习到期词”入口开始；错过的复习会保留到下一次学习。</p></section>
    </div>
    <section className="panel home-weak-zone">
      <div className="section-heading"><div><span className="section-kicker"><AlertTriangle size={16} />重点加强</span><h2>薄弱词复习</h2><p>{library ? weakWords.length ? `当前词书有 ${weakWords.length} 个词需要加强` : '当前词书暂时没有薄弱词' : '选择计划词书并开始学习后，这里会整理薄弱词'}</p></div><button className="primary" disabled={!library || !weakWords.length || Boolean(props.activeSession)} onClick={props.onStartWeak}>开始薄弱词复习<ArrowRight size={17} /></button></div>
      {weakWords.length > 0 && <div className="home-weak-preview">{weakWords.slice(0, 6).map((word) => { const card = cardMap.get(word.id)!; const reasons = [(card.forgetCount ?? 0) > 0 ? `忘记 ${card.forgetCount}` : '', (card.spellingErrorCount ?? 0) > 0 ? `拼写 ${card.spellingErrorCount}` : '', (card.fuzzyCount ?? 0) > 0 ? `模糊 ${card.fuzzyCount}` : '', card.important ? '重点' : '', card.confusing ? '易混淆' : ''].filter(Boolean); return <div key={word.id}><strong>{word.word}</strong><span>{word.meaning}</span><small>{reasons.join(' · ') || '记忆难度较高'}</small></div> })}</div>}
    </section>
    {previewOpen && library && <div className="modal-backdrop library-preview-backdrop"><section className="modal library-preview-modal" role="dialog" aria-modal="true" aria-labelledby="library-preview-title"><button className="icon-button modal-close" onClick={() => setPreviewOpen(false)} aria-label="关闭单词预览"><X /></button><p className="eyebrow">当前计划词书</p><h2 id="library-preview-title">{library.name}</h2><p className="library-preview-summary">共 {library.wordCount} 个单词，仅供预览，不会改变学习计划。</p><label className="search-box"><Search size={17} /><input value={previewSearch} onChange={(event) => setPreviewSearch(event.target.value)} placeholder="搜索英文、音标或中文释义" autoFocus /></label><div className="preview-word-table"><div className="preview-word-row preview-word-head"><span>单词</span><span>词性与释义</span></div>{previewWords.map((word) => <div className="preview-word-row" key={word.id}><span><strong>{word.word}</strong><small>{word.phonetic || '暂无音标'}</small></span><span><small>{formatPartOfSpeech(word.partOfSpeech) || '未标注词性'}</small><em>{word.meaning}</em></span></div>)}{!previewWords.length && <div className="empty-state compact">没有匹配的单词</div>}</div>{libraryWords.length > 200 && !normalizedPreviewSearch && <p className="field-help">当前先显示前 200 个单词，可通过搜索查找其他词条。</p>}</section></div>}
  </div>
}
