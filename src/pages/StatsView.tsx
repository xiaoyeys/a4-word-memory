import { BookOpen, CalendarDays, CheckCircle2, Clock3, Flame, Layers3, Search, Target, TrendingUp, X } from 'lucide-react'
import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { nextSevenDaysDue, studyStreak } from '../lib/checkin'
import { classifyCard, isLearnedCard, summaryFor } from '../lib/study'
import { formatPartOfSpeech } from '../components/MeaningDisplay'
import type { StoredCard, StudySession, WordEntry, WordLibrary } from '../types'

interface StatsViewProps {
  sessions: StudySession[]
  cards: StoredCard[]
  words: WordEntry[]
  library?: WordLibrary
  onEditPlan: () => void
}

function dayKey(value: Date | string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours} 小时 ${remainder} 分` : `${hours} 小时`
}

type StatsRange = 7 | 30 | 'all'

export function StatsView({ sessions, cards, words, library, onEditPlan }: StatsViewProps) {
  const [selectedWord, setSelectedWord] = useState<WordEntry>()
  const [wordSearch, setWordSearch] = useState('')
  const [methodFilter, setMethodFilter] = useState<'all' | 'scatter' | 'match' | 'dictation'>('all')
  const [range, setRange] = useState<StatsRange>(30)
  const libraryWords = words.filter((word) => word.libraryId === library?.id)
  const wordIds = new Set(libraryWords.map((word) => word.id))
  const libraryCards = cards.filter((card) => wordIds.has(card.wordId))
  const cardMap = new Map(libraryCards.map((card) => [card.wordId, card]))
  const librarySessions = sessions.filter((session) => session.libraryId === library?.id)
  const rangeStart = range === 'all' ? undefined : (() => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (range - 1))
    return date
  })()
  const inRange = (value?: string) => Boolean(value && (!rangeStart || new Date(value) >= rangeStart))
  const rangeSessions = librarySessions.filter((session) => inRange(session.completedAt ?? session.updatedAt))
  const filteredSessions = rangeSessions.filter((session) => methodFilter === 'all' || (session.methods ?? ['scatter']).includes(methodFilter))
  const completed = filteredSessions.filter((session) => session.status === 'completed' && session.completedAt)
  const periodCompleted = librarySessions.filter((session) => session.status === 'completed' && session.completedAt && inRange(session.completedAt))
  const summaries = completed.map((session) => ({ session, summary: summaryFor(session) }))
  const learnedWords = libraryWords.filter((word) => isLearnedCard(cardMap.get(word.id)))
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  const dueCount = learnedWords.filter((word) => new Date(cardMap.get(word.id)!.card.due) <= endOfToday).length
  const allWeakWords = learnedWords.filter((word) => {
    const card = cardMap.get(word.id)!
    return card.card.difficulty >= 7 || (card.forgetCount ?? 0) > 0 || (card.fuzzyCount ?? 0) > 0 || (card.spellingErrorCount ?? 0) > 0 || card.important || card.confusing
  }).sort((a, b) => {
    const aCard = cardMap.get(a.id)!
    const bCard = cardMap.get(b.id)!
    return new Date(aCard.card.due).getTime() - new Date(bCard.card.due).getTime() || bCard.card.difficulty - aCard.card.difficulty
  })
  const scatterSessions = completed.filter((session) => (session.methods ?? ['scatter']).includes('scatter'))
  const totalRecallEvents = scatterSessions.reduce((sum, session) => sum + session.events.filter((event) => (event.method ?? 'scatter') === 'scatter').length, 0)
  const positionHints = scatterSessions.reduce((sum, session) => sum + session.metrics.positionHints, 0)
  const positionRecallRate = totalRecallEvents ? Math.max(0, totalRecallEvents - positionHints) / totalRecallEvents : 0
  const spellingSessions = completed.filter((session) => (session.methods ?? ['scatter']).some((method) => method === 'scatter' || method === 'dictation'))
  const spellingErrors = spellingSessions.reduce((sum, session) => sum + session.metrics.spellingErrors + session.metrics.spellingSkips, 0)
  const spellingSuccesses = spellingSessions.reduce((sum, session) => sum + session.wordIds.length, 0)
  const spellingRate = spellingSuccesses ? spellingSuccesses / (spellingSuccesses + spellingErrors) : 0
  const completionRate = filteredSessions.length ? completed.length / filteredSessions.length : 0
  const masteryRate = summaries.length ? summaries.reduce((sum, item) => sum + item.summary.finalMasteryRate, 0) / summaries.length : 0
  const progress = library?.wordCount ? learnedWords.length / library.wordCount : 0
  const periodWordCount = new Set(completed.flatMap((session) => session.wordIds)).size
  const periodStudyDays = new Set(completed.map((session) => dayKey(session.completedAt!))).size
  const periodMinutes = summaries.reduce((sum, item) => sum + item.summary.durationMinutes, 0)
  const currentStreak = studyStreak(librarySessions, library?.id)
  const weakIds = new Set(allWeakWords.map((word) => word.id))
  const stableCount = learnedWords.filter((word) => !weakIds.has(word.id) && cardMap.get(word.id)!.card.stability >= 21).length
  const learningCount = Math.max(0, learnedWords.length - allWeakWords.length - stableCount)
  const unseenCount = Math.max(0, (library?.wordCount ?? libraryWords.length) - learnedWords.length)
  const statusTotal = Math.max(1, library?.wordCount ?? libraryWords.length)
  const statusItems = [
    { key: 'unseen', label: '未学习', count: unseenCount },
    { key: 'learning', label: '学习中', count: learningCount },
    { key: 'weak', label: '薄弱词', count: allWeakWords.length },
    { key: 'stable', label: '稳定掌握', count: stableCount },
  ]
  const reviewForecast = nextSevenDaysDue(libraryCards.filter((card) => isLearnedCard(card))).map((item, index) => ({
    ...item,
    count: index === 0 ? dueCount : item.count,
  }))
  const maxForecast = Math.max(1, ...reviewForecast.map((item) => item.count))
  const forecastTotal = reviewForecast.reduce((sum, item) => sum + item.count, 0)
  const methodStats = (['scatter', 'match', 'dictation'] as const).map((method) => {
    const methodSessions = periodCompleted.filter((session) => (session.methods ?? ['scatter']).includes(method))
    const events = methodSessions.flatMap((session) => session.events.filter((event) => (event.method ?? 'scatter') === method))
    const positive = events.filter((event) => event.rating === 'remembered').length
    const label = method === 'scatter' ? '随机散点' : method === 'match' ? '词义连连看' : '折叠默写'
    const wordsPracticed = new Set(methodSessions.flatMap((session) => session.wordIds)).size
    return { method, label, attempts: events.length, rate: events.length ? positive / events.length : undefined, rounds: methodSessions.length, wordsPracticed }
  })

  const chartStart = rangeStart ?? (() => {
    const earliest = completed.reduce<Date | undefined>((result, session) => {
      const date = new Date(session.completedAt!)
      return !result || date < result ? date : result
    }, undefined)
    const date = earliest ?? new Date()
    date.setHours(0, 0, 0, 0)
    return date
  })()
  const chartDays = Math.max(1, Math.round((new Date().setHours(0, 0, 0, 0) - chartStart.getTime()) / 86400000) + 1)
  const chartData = Array.from({ length: chartDays }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (chartDays - 1 - index))
    const matching = summaries.filter(({ session }) => dayKey(session.completedAt!) === dayKey(date))
    const totalWords = matching.reduce((sum, item) => sum + item.summary.totalWords, 0)
    const weighted = (key: 'firstRecallRate' | 'finalMasteryRate') => totalWords
      ? Math.round(matching.reduce((sum, item) => sum + item.summary[key] * item.summary.totalWords, 0) / totalWords * 100)
      : null
    return {
      date: date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }),
      firstRate: weighted('firstRecallRate'),
      masteryRate: weighted('finalMasteryRate'),
    }
  })

  const visibleLearned = learnedWords.filter((word) => !wordSearch || `${word.word} ${word.meaning}`.toLowerCase().includes(wordSearch.toLowerCase())).slice(0, 100)
  const selectedCard = selectedWord ? cardMap.get(selectedWord.id) : undefined
  const selectedHistory = selectedWord ? completed.filter((session) => session.wordIds.includes(selectedWord.id)).slice().reverse().slice(0, 10) : []
  const ratingLabel = { remembered: '记得', fuzzy: '模糊', forgotten: '忘记' }
  const rangeLabel = range === 'all' ? '全部时间' : `近 ${range} 天`

  return <div className="page-content stats-page">
    <div className="page-heading split-heading stats-heading">
      <div><p className="eyebrow">学习统计</p><h1>{library?.name ?? '尚未选择词书'}</h1><p>统计只计算当前词书，切换词书不会混入其他学习记录。</p></div>
      <button className="secondary" onClick={onEditPlan}><BookOpen size={17} />调整计划</button>
    </div>

    <div className="stats-toolbar">
      <div><span>学习方法</span><div className="stats-method-filter" role="group" aria-label="按学习方法筛选统计">{([['all', '全部方法'], ['scatter', '随机散点'], ['match', '词义连连看'], ['dictation', '折叠默写']] as const).map(([key, label]) => <button key={key} className={methodFilter === key ? 'active' : ''} onClick={() => setMethodFilter(key)}>{label}</button>)}</div></div>
      <div><span>统计周期</span><div className="stats-range-filter" role="group" aria-label="选择统计周期">{([[7, '近 7 天'], [30, '近 30 天'], ['all', '全部']] as const).map(([key, label]) => <button key={key} className={range === key ? 'active' : ''} onClick={() => setRange(key)}>{label}</button>)}</div></div>
    </div>

    <div className="stats-overview-heading"><h2>{rangeLabel}概览</h2><p>随上方方法和时间筛选同步变化</p></div>
    <div className="metric-grid stats-metrics stats-overview-grid">
      <div className="metric"><Layers3 /><span>练习词汇</span><strong>{periodWordCount}</strong><small>去重</small></div>
      <div className="metric"><CheckCircle2 /><span>完成任务</span><strong>{completed.length}</strong><small>轮</small></div>
      <div className="metric"><CalendarDays /><span>学习天数</span><strong>{periodStudyDays}</strong><small>天</small></div>
      <div className="metric"><Clock3 /><span>学习时长</span><strong>{formatMinutes(periodMinutes)}</strong><small>有效时长</small></div>
    </div>

    <div className="stats-summary-grid">
      <section className="panel vocabulary-status-panel">
        <div className="section-heading"><div><h2>词汇掌握分布</h2><p>当前计划词书的累计状态，不受上方筛选影响</p></div><strong className="book-progress-value">{percent(progress)}</strong></div>
        <div className="status-distribution" aria-label="词汇状态分布">{statusItems.map((item) => <i key={item.key} className={`status-${item.key}`} style={{ width: `${item.count / statusTotal * 100}%` }} />)}</div>
        <div className="status-breakdown">{statusItems.map((item) => <div key={item.key}><i className={`status-${item.key}`} /><span>{item.label}</span><strong>{item.count}</strong></div>)}</div>
        <div className="status-notes"><span><CalendarDays size={16} />今日及逾期待复习 <strong>{dueCount}</strong></span><span><Flame size={16} />连续学习 <strong>{currentStreak} 天</strong></span></div>
      </section>

      <section className="panel review-pressure-panel">
        <div className="section-heading"><div><h2>未来 7 天复习量</h2><p>今天包含已经逾期的单词</p></div><strong>{forecastTotal} 词次</strong></div>
        <div className="stats-review-bars">{reviewForecast.map((item, index) => <div key={item.key}><span>{item.count}</span><div><i style={{ height: `${Math.max(5, item.count / maxForecast * 100)}%` }} /></div><small>{index === 0 ? '今天' : item.date.toLocaleDateString('zh-CN', { weekday: 'short' })}</small></div>)}</div>
      </section>
    </div>

    <section className="method-performance-section"><div className="section-heading"><div><h2>方法表现</h2><p>{rangeLabel}内的记忆结果对比</p></div></div><div className="method-stat-grid" aria-label="各学习方法表现">{methodStats.filter((item) => methodFilter === 'all' || item.method === methodFilter).map((item) => <article className="panel method-stat-card" key={item.method}><span>{item.label}</span><strong>{item.rate === undefined ? '--' : percent(item.rate)}</strong><small>{item.rate === undefined ? '暂无词级回忆记录' : `${item.wordsPracticed} 个词 · ${item.attempts} 次回忆 · ${item.rounds} 轮任务`}</small></article>)}</div></section>

    <section className="panel stats-trend">
      <div className="section-heading"><div><h2>{rangeLabel}记忆趋势</h2><p>按每天完成的学习任务加权计算</p></div><span className="trend-legend"><i />首次记忆率 <i />最终掌握率</span></div>
      {completed.length ? <ResponsiveContainer width="100%" height={290}><AreaChart data={chartData}><defs><linearGradient id="firstRateFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d78752" stopOpacity={.25}/><stop offset="100%" stopColor="#d78752" stopOpacity={0}/></linearGradient><linearGradient id="masteryRateFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#245846" stopOpacity={.2}/><stop offset="100%" stopColor="#245846" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e2d9" /><XAxis dataKey="date" tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(chartData.length / 6) - 1)} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} unit="%" /><Tooltip formatter={(value, name) => [`${value}%`, name === 'firstRate' ? '首次记忆率' : '最终掌握率']} /><Area type="monotone" dataKey="firstRate" stroke="#d78752" fill="url(#firstRateFill)" connectNulls /><Area type="monotone" dataKey="masteryRate" stroke="#245846" fill="url(#masteryRateFill)" connectNulls /></AreaChart></ResponsiveContainer> : <div className="stats-empty-compact"><TrendingUp /><div><strong>还没有符合筛选条件的记录</strong><span>完成一轮学习后，这里会显示首次记忆率和最终掌握率。</span></div></div>}
    </section>

    <div className="stats-overview-heading"><h2>关键表现</h2><p>{rangeLabel}内的数据</p></div>
    <div className="accuracy-grid">
      <section className="accuracy-item"><span><Target /></span><div><strong>{totalRecallEvents ? percent(positionRecallRate) : '--'}</strong><h3>位置回忆独立率</h3><p>无需位置提示完成的散点回忆</p></div></section>
      <section className="accuracy-item"><span><CheckCircle2 /></span><div><strong>{spellingSuccesses ? percent(spellingRate) : '--'}</strong><h3>拼写正确率</h3><p>正确拼写占全部拼写尝试</p></div></section>
      <section className="accuracy-item"><span><TrendingUp /></span><div><strong>{summaries.length ? percent(masteryRate) : '--'}</strong><h3>最终掌握率</h3><p>每轮最后一次回忆为“记得”</p></div></section>
      <section className="accuracy-item"><span><CalendarDays /></span><div><strong>{filteredSessions.length ? percent(completionRate) : '--'}</strong><h3>任务完成率</h3><p>已完成任务占全部已开始任务</p></div></section>
    </div>

    <section className="panel history-panel"><div className="section-heading"><div><h2>最近学习</h2><p>{rangeLabel}内最近完成的 8 次任务</p></div></div>{summaries.length ? <div className="history-list">{summaries.slice(-8).reverse().map(({ session, summary }) => <div className="history-row compact-history" key={session.id}><span><strong>{new Date(session.completedAt!).toLocaleDateString('zh-CN')}</strong><small>{summary.totalWords} 词 · {summary.durationMinutes} 分钟</small></span><span>首次 {percent(summary.firstRecallRate)}</span><span>掌握 {percent(summary.finalMasteryRate)}</span></div>)}</div> : <div className="empty-state compact">暂无完成记录</div>}</section>

    <section className="panel learned-words-panel"><div className="section-heading"><div><h2>已学单词</h2><p>点击查看表现和下次复习时间</p></div></div><label className="search-box"><Search size={17} /><input value={wordSearch} onChange={(event) => setWordSearch(event.target.value)} placeholder="搜索已学单词或释义" /></label><div className="learned-word-list">{visibleLearned.map((word) => <button key={word.id} onClick={() => setSelectedWord(word)}><strong>{word.word}</strong><span>{classifyCard(cardMap.get(word.id))}</span><small>{new Date(cardMap.get(word.id)!.card.due).toLocaleDateString('zh-CN')}</small></button>)}{!visibleLearned.length && <div className="empty-state compact">没有匹配的已学单词</div>}</div>{learnedWords.length > 100 && !wordSearch && <p className="field-help">当前先显示 100 个单词，可通过搜索查找其他单词。</p>}</section>

    {selectedWord && selectedCard && <div className="modal-backdrop"><section className="modal word-detail-modal" role="dialog" aria-modal="true"><button className="icon-button modal-close" onClick={() => setSelectedWord(undefined)} aria-label="关闭单词详情"><X /></button><p className="eyebrow">单词详情</p><h2>{selectedWord.word}</h2><p className="phonetic detail-phonetic">{selectedWord.phonetic || '暂无音标'} · {formatPartOfSpeech(selectedWord.partOfSpeech) || '词性未标注'}</p><p className="meaning compact">{selectedWord.meaning}</p><dl className="word-schedule"><div><dt>当前状态</dt><dd>{classifyCard(selectedCard)}</dd></div><div><dt>下次复习</dt><dd>{new Date(selectedCard.card.due).toLocaleString('zh-CN')}</dd></div><div><dt>难度</dt><dd>{selectedCard.card.difficulty.toFixed(1)}</dd></div><div><dt>稳定性</dt><dd>{selectedCard.card.stability.toFixed(1)} 天</dd></div></dl><h3>最近学习记录</h3><div className="word-history">{selectedHistory.map((session) => { const events = session.events.filter((event) => event.wordId === selectedWord.id); return <div key={session.id}><span>{new Date(session.completedAt!).toLocaleDateString('zh-CN')}</span><strong>{events.length ? events.map((event) => ratingLabel[event.rating]).join(' → ') : session.spellingForgottenWordIds.includes(selectedWord.id) ? '拼写时忘记' : '完成'}</strong></div> })}{!selectedHistory.length && <p className="muted small">暂无历史明细</p>}</div></section></div>}
  </div>
}
