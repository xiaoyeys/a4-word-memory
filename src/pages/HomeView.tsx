import { AlertTriangle, ArrowRight, BookOpen, CalendarDays, CheckCircle2, Clock3, Eye, Flame, Play, RefreshCw, Search, Sparkles, Target } from 'lucide-react'
import { useState } from 'react'
import { PageBack, PageLink } from '../components/PageNavigation'
import { goToPage, usePageRoute } from '../lib/navigation'
import { formatPartOfSpeech } from '../components/MeaningDisplay'
import { dailyPlan, isLearnedCard } from '../lib/study'
import { dayKey, studyStreak } from '../lib/checkin'
import type { AppSettings, StoredCard, StudySession, WordEntry, WordLibrary } from '../types'

function unfinishedProgress(session: StudySession) {
  const total = session.wordIds.length
  if (session.mode === 'due') return `已复习 ${Object.keys(session.reviewFirstRatings ?? {}).length}/${total} 词`
  const progress = session.methodProgress
  if (session.stage === 'dictation') {
    const phase = progress?.dictationPhase ?? 3
    const label = phase === 3 ? '第一次默写单词' : phase === 4 ? '第一次默写释义' : phase === 5 ? '第二次默写单词' : '第二次默写释义'
    return `折叠默写 · ${label} · 已完成 ${progress?.dictationAttemptedWordIds?.length ?? 0}/${total} 词`
  }
  if (session.stage === 'match') {
    const matched = Math.min(total, (progress?.matchGroupIndex ?? 0) * (session.methodGroupSize ?? 8) + (progress?.matchedWordIds?.length ?? 0))
    return `词义连连看 · 已配对 ${matched}/${total} 词`
  }
  return `随机散点 · 已放置 ${session.placed.length}/${total} 词`
}

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
  const section = usePageRoute().split('/')[1] ?? ''
  const [weakSearch, setWeakSearch] = useState('')
  const [weakFilter, setWeakFilter] = useState('all')
  const [previewLimit, setPreviewLimit] = useState(50)
  const [weakLimit, setWeakLimit] = useState(40)
  const [previewSearch, setPreviewSearch] = useState('')
  const { library } = props
  const libraryWords = props.words.filter((word) => word.libraryId === library?.id)
  const normalizedPreviewSearch = previewSearch.trim().toLowerCase()
  const previewWords = libraryWords.filter((word) => !normalizedPreviewSearch || `${word.word} ${word.meaning} ${word.phonetic ?? ''}`.toLowerCase().includes(normalizedPreviewSearch)).slice(0, previewLimit)
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
  const estimatedMinutes = Math.max(1, Math.ceil(plan.totalCount * .6))


  const filteredWeak = weakWords.filter((word) => {
    const card = cardMap.get(word.id)!
    const matchesFilter = weakFilter === 'all' || (weakFilter === 'forget' ? (card.forgetCount ?? 0) > 0 : weakFilter === 'spelling' ? (card.spellingErrorCount ?? 0) > 0 : weakFilter === 'fuzzy' ? (card.fuzzyCount ?? 0) > 0 : weakFilter === 'important' ? card.important : card.confusing)
    return matchesFilter && (!weakSearch || `${word.word} ${word.meaning}`.toLowerCase().includes(weakSearch.toLowerCase()))
  })
  if (section === 'preview') return <div className="page-content word-preview-page">
    <PageBack fallback="home" label="返回学习" /><div className="page-heading"><p className="eyebrow">当前词书预览</p><h1>{library?.name ?? '未选择词书'}</h1><p>{library ? `共 ${library.wordCount} 词，浏览不改变学习计划。` : '选择词书后即可查看单词。'}</p></div>
    <label className="search-box list-search"><Search size={17} /><input value={previewSearch} onChange={(event) => { setPreviewSearch(event.target.value); setPreviewLimit(50) }} placeholder="搜索英文、音标或中文释义" /></label>
    <div className="panel preview-word-table"><div className="preview-word-row preview-word-head"><span>单词</span><span>词性与释义</span></div>{previewWords.map((word) => <div className="preview-word-row" key={word.id}><span><strong>{word.word}</strong><small>{word.phonetic || '暂无音标'}</small></span><span><small>{formatPartOfSpeech(word.partOfSpeech) || '未标注词性'}</small><em>{word.meaning}</em></span></div>)}{!previewWords.length && <div className="empty-state compact">没有匹配的单词</div>}</div>
    {previewWords.length === previewLimit && <button className="secondary list-more" onClick={() => setPreviewLimit((count) => count + 50)}>查看更多单词</button>}
  </div>
  if (section === 'weak') return <div className="page-content weak-detail-page">
    <PageBack fallback="home" label="返回学习" /><div className="page-heading"><p className="eyebrow">重点加强 · {library?.name ?? '未选择词书'}</p><h1>薄弱词专区</h1><p>{weakWords.length} 个词需要加强，可按错误类型查看。</p></div>
    <div className="detail-action-bar"><button className="primary" disabled={!library || !weakWords.length || Boolean(props.activeSession)} onClick={props.onStartWeak}>开始薄弱词复习<ArrowRight size={17} /></button></div>
    <div className="segmented-filter">{[['all', '全部'], ['forget', '忘记'], ['spelling', '拼写错误'], ['fuzzy', '模糊'], ['important', '重点'], ['confusing', '易混淆']].map(([id, label]) => <button key={id} className={weakFilter === id ? 'active' : ''} onClick={() => { setWeakFilter(id); setWeakLimit(40) }}>{label}</button>)}</div>
    <label className="search-box list-search"><Search size={17} /><input value={weakSearch} onChange={(event) => { setWeakSearch(event.target.value); setWeakLimit(40) }} placeholder="搜索单词或释义" /></label>
    <div className="panel weak-detail-list">{filteredWeak.slice(0, weakLimit).map((word) => { const card = cardMap.get(word.id)!; const reasons = [(card.forgetCount ?? 0) > 0 ? `忘记 ${card.forgetCount} 次` : '', (card.spellingErrorCount ?? 0) > 0 ? `拼写错误 ${card.spellingErrorCount} 次` : '', (card.fuzzyCount ?? 0) > 0 ? `模糊 ${card.fuzzyCount} 次` : '', card.important ? '重点词' : '', card.confusing ? '易混淆' : ''].filter(Boolean); return <article key={word.id}><strong>{word.word}</strong><p>{word.meaning}</p><small>{reasons.join(' · ') || '记忆难度较高'}</small></article> })}{!filteredWeak.length && <div className="empty-state compact">当前没有匹配的薄弱词</div>}</div>
    {filteredWeak.length > weakLimit && <button className="secondary list-more" onClick={() => setWeakLimit((count) => count + 40)}>查看更多</button>}
  </div>

  return <div className="page-content daily-home">
    <header className="daily-greeting">
      <div><p className="eyebrow">今日学习</p><h1>{library ? '开始今天的学习。' : '选一本词书，开始学习。'}</h1></div>
      <div className="streak-chip"><Flame size={19} /><span>连续学习</span><strong>{streak}</strong><span>天</span></div>
    </header>

    {props.activeSession && <section className="resume-banner"><div><span className="resume-icon"><Play /></span><div><strong>上次学习还没有结束</strong><p>{props.activeSession.libraryName} · {unfinishedProgress(props.activeSession)}</p></div></div><div><button className="text-button" onClick={props.onAbandon}>放弃</button><button className="primary" onClick={props.onContinue}>继续学习<ArrowRight size={17} /></button></div></section>}

    <div className="daily-dashboard">
      <section className="current-book-card panel">
        {library
          ? <div className="book-cover"><span>{library.name.split(' ')[0]}</span><small>{library.name.replace(library.name.split(' ')[0], '').trim() || '自定义词书'}</small></div>
          : <button type="button" className="book-cover book-cover-button" onClick={props.onEditPlan} aria-label="选择计划词书"><span>A4</span><small>点击选择词书</small></button>}
        <div className="book-summary">
          <span className="section-kicker">当前词书</span>
          <h2>{library?.name ?? '未选择词书'}</h2>
          <p>已学 <strong>{learned}</strong> / {library?.wordCount ?? 0} 词</p>
          <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
          <div className="book-card-actions"><button className="book-change" onClick={props.onEditPlan}><Target size={16} />调整计划</button>{library && <button className="book-change" onClick={() => goToPage('home/preview')}><Eye size={16} />预览单词</button>}</div>
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

    <div className="home-shortcuts">
      <PageLink to="stats/calendar" title="学习打卡" description={`连续 ${streak} 天 · 本周学习 ${weekDays} 天`} icon={<CalendarDays />} />
      <PageLink to="stats/reviews" title="复习安排" description={`今日到期 ${plan.dueCount} 词 · 查看未来 7 天`} icon={<RefreshCw />} />
    </div>
    <section className="panel home-weak-zone">
      <div className="section-heading"><div><span className="section-kicker"><AlertTriangle size={16} />重点加强</span><h2>薄弱词复习</h2><p>{library ? weakWords.length ? `当前词书有 ${weakWords.length} 个词需要加强` : '当前词书暂时没有薄弱词' : '开始学习后，这里会整理薄弱词'}</p></div><button className="secondary" onClick={() => goToPage('home/weak')}>查看详情<ArrowRight size={17} /></button></div>
      {weakWords.length > 0 && <button className="primary" disabled={Boolean(props.activeSession)} onClick={props.onStartWeak}>开始薄弱词复习<ArrowRight size={17} /></button>}
    </section>
  </div>
}
