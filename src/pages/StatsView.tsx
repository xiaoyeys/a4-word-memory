import { AlertTriangle, BookOpen, CalendarDays, CheckCircle2, Flag, Search, Target, TrendingUp, X } from 'lucide-react'
import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { classifyCard, summaryFor } from '../lib/study'
import { formatPartOfSpeech } from '../components/MeaningDisplay'
import { db } from '../db'
import type { StoredCard, StudySession, WordEntry, WordLibrary } from '../types'

interface StatsViewProps {
  sessions: StudySession[]
  cards: StoredCard[]
  words: WordEntry[]
  library?: WordLibrary
  onChangeLibrary: () => void
  onStartWeak: () => void
  onChanged?: () => Promise<void>
}

function dayKey(value: Date | string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

export function StatsView({ sessions, cards, words, library, onChangeLibrary, onStartWeak, onChanged }: StatsViewProps) {
  const [selectedWord, setSelectedWord] = useState<WordEntry>()
  const [wordSearch, setWordSearch] = useState('')
  const [weakFilter, setWeakFilter] = useState<'all' | 'spelling' | 'forgotten' | 'fuzzy' | 'flagged'>('all')
  const libraryWords = words.filter((word) => word.libraryId === library?.id)
  const wordIds = new Set(libraryWords.map((word) => word.id))
  const libraryCards = cards.filter((card) => wordIds.has(card.wordId))
  const cardMap = new Map(libraryCards.map((card) => [card.wordId, card]))
  const librarySessions = sessions.filter((session) => session.libraryId === library?.id)
  const completed = librarySessions.filter((session) => session.status === 'completed' && session.completedAt)
  const summaries = completed.map((session) => ({ session, summary: summaryFor(session) }))
  const learnedWords = libraryWords.filter((word) => cardMap.has(word.id))
  const dueCount = learnedWords.filter((word) => new Date(cardMap.get(word.id)!.card.due) <= new Date()).length
  const allWeakWords = learnedWords.filter((word) => {
    const card = cardMap.get(word.id)!
    return card.card.difficulty >= 7 || (card.forgetCount ?? 0) > 0 || (card.fuzzyCount ?? 0) > 0 || (card.spellingErrorCount ?? 0) > 0 || card.important || card.confusing
  }).sort((a, b) => {
    const aCard = cardMap.get(a.id)!
    const bCard = cardMap.get(b.id)!
    return new Date(aCard.card.due).getTime() - new Date(bCard.card.due).getTime() || bCard.card.difficulty - aCard.card.difficulty
  })
  const weakWords = allWeakWords.filter((word) => {
    const card = cardMap.get(word.id)!
    if (weakFilter === 'spelling') return (card.spellingErrorCount ?? 0) > 0
    if (weakFilter === 'forgotten') return (card.forgetCount ?? 0) > 0
    if (weakFilter === 'fuzzy') return (card.fuzzyCount ?? 0) > 0
    if (weakFilter === 'flagged') return Boolean(card.important || card.confusing)
    return true
  }).slice(0, 12)

  async function toggleFlag(wordId: string, key: 'important' | 'confusing') {
    const card = cardMap.get(wordId)
    if (!card) return
    await db.cards.update(wordId, { [key]: !card[key] })
    await onChanged?.()
  }

  const totalRecallEvents = completed.reduce((sum, session) => sum + session.events.length, 0)
  const positionHints = completed.reduce((sum, session) => sum + session.metrics.positionHints, 0)
  const positionRecallRate = totalRecallEvents ? Math.max(0, totalRecallEvents - positionHints) / totalRecallEvents : 0
  const spellingErrors = completed.reduce((sum, session) => sum + session.metrics.spellingErrors + session.metrics.spellingSkips, 0)
  const spellingSuccesses = completed.reduce((sum, session) => sum + session.wordIds.length, 0)
  const spellingRate = spellingSuccesses ? spellingSuccesses / (spellingSuccesses + spellingErrors) : 0
  const completionRate = librarySessions.length ? completed.length / librarySessions.length : 0
  const masteryRate = summaries.length ? summaries.reduce((sum, item) => sum + item.summary.finalMasteryRate, 0) / summaries.length : 0
  const progress = library?.wordCount ? learnedWords.length / library.wordCount : 0

  const chartData = Array.from({ length: 30 }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (29 - index))
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

  return <div className="page-content stats-page">
    <div className="page-heading split-heading stats-heading">
      <div><p className="eyebrow">学习统计</p><h1>{library?.name ?? '尚未选择词书'}</h1><p>统计只计算当前词书，切换词书不会混入其他学习记录。</p></div>
      <button className="secondary" onClick={onChangeLibrary}><BookOpen size={17} />更换词书</button>
    </div>

    <div className="metric-grid stats-metrics">
      <div className="metric"><BookOpen /><span>已学词汇</span><strong>{learnedWords.length}</strong><small>/ {library?.wordCount ?? 0}</small></div>
      <div className="metric"><CalendarDays /><span>今日待复习</span><strong>{dueCount}</strong><small>词</small></div>
      <div className="metric"><AlertTriangle /><span>薄弱词</span><strong>{allWeakWords.length}</strong><small>词</small></div>
      <div className="metric"><Target /><span>词书进度</span><strong>{percent(progress)}</strong><small>{completed.length} 次学习</small></div>
    </div>

    <section className="panel stats-trend">
      <div className="section-heading"><div><h2>30 天记忆趋势</h2><p>按每天完成的学习任务加权计算</p></div><span className="trend-legend"><i />首次记忆率 <i />最终掌握率</span></div>
      {completed.length ? <ResponsiveContainer width="100%" height={290}><AreaChart data={chartData}><defs><linearGradient id="firstRateFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d78752" stopOpacity={.25}/><stop offset="100%" stopColor="#d78752" stopOpacity={0}/></linearGradient><linearGradient id="masteryRateFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#245846" stopOpacity={.2}/><stop offset="100%" stopColor="#245846" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6e2d9" /><XAxis dataKey="date" tickLine={false} axisLine={false} interval={5} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} unit="%" /><Tooltip formatter={(value, name) => [`${value}%`, name === 'firstRate' ? '首次记忆率' : '最终掌握率']} /><Area type="monotone" dataKey="firstRate" stroke="#d78752" fill="url(#firstRateFill)" connectNulls /><Area type="monotone" dataKey="masteryRate" stroke="#245846" fill="url(#masteryRateFill)" connectNulls /></AreaChart></ResponsiveContainer> : <div className="empty-state">完成第一轮学习后，这里会出现趋势图。</div>}
    </section>

    <div className="accuracy-grid">
      <section className="accuracy-item"><span><Target /></span><div><strong>{percent(positionRecallRate)}</strong><h3>位置回忆独立率</h3><p>无需位置提示完成的回忆次数</p></div></section>
      <section className="accuracy-item"><span><CheckCircle2 /></span><div><strong>{percent(spellingRate)}</strong><h3>拼写正确率</h3><p>正确拼写占全部拼写尝试</p></div></section>
      <section className="accuracy-item"><span><TrendingUp /></span><div><strong>{percent(masteryRate)}</strong><h3>最终掌握率</h3><p>每轮最后一次回忆为“记得”</p></div></section>
      <section className="accuracy-item"><span><CalendarDays /></span><div><strong>{percent(completionRate)}</strong><h3>任务完成率</h3><p>已完成任务占全部已开始任务</p></div></section>
    </div>

    <div className="stats-detail-grid">
      <section className="panel weak-zone"><div className="section-heading"><div><h2>薄弱词专区</h2><p>按错误记录和个人标记筛选，错得多的词会优先复习。</p></div><button className="primary" disabled={!allWeakWords.length} onClick={onStartWeak}><Target size={16} />开始薄弱词 A4 复习</button></div><div className="weak-filters">{([['all', '全部'], ['spelling', '拼写错误'], ['forgotten', '忘记'], ['fuzzy', '模糊'], ['flagged', '重点/易混淆']] as const).map(([value, label]) => <button key={value} className={weakFilter === value ? 'active' : ''} onClick={() => setWeakFilter(value)}>{label}</button>)}</div><div className="weak-word-grid">{weakWords.map((word) => { const card = cardMap.get(word.id)!; return <div className="weak-word-item" key={word.id}><button className="weak-word-main" onClick={() => setSelectedWord(word)}><strong>{word.word}</strong><span>{word.meaning}</span><small>{classifyCard(card)} · 忘记 {card.forgetCount ?? 0} · 模糊 {card.fuzzyCount ?? 0} · 拼写 {card.spellingErrorCount ?? 0}</small></button><div className="weak-word-flags"><button className={card.important ? 'flag active' : 'flag'} title="重点词" aria-label="标记重点词" onClick={() => void toggleFlag(word.id, 'important')}><Flag size={14} /></button><button className={card.confusing ? 'flag active' : 'flag'} title="易混淆词" aria-label="标记易混淆词" onClick={() => void toggleFlag(word.id, 'confusing')}><AlertTriangle size={14} /></button></div></div> })}{!weakWords.length && <div className="empty-state compact">暂无符合条件的薄弱词</div>}</div></section>
      <section className="panel history-panel"><div className="section-heading"><div><h2>最近学习</h2><p>当前词书最近完成的 8 次任务</p></div></div>{summaries.length ? <div className="history-list">{summaries.slice(-8).reverse().map(({ session, summary }) => <div className="history-row compact-history" key={session.id}><span><strong>{new Date(session.completedAt!).toLocaleDateString('zh-CN')}</strong><small>{summary.totalWords} 词 · {summary.durationMinutes} 分钟</small></span><span>首次 {percent(summary.firstRecallRate)}</span><span>掌握 {percent(summary.finalMasteryRate)}</span></div>)}</div> : <div className="empty-state compact">暂无完成记录</div>}</section>
    </div>

    <section className="panel learned-words-panel"><div className="section-heading"><div><h2>已学单词</h2><p>点击查看表现和下次复习时间</p></div></div><label className="search-box"><Search size={17} /><input value={wordSearch} onChange={(event) => setWordSearch(event.target.value)} placeholder="搜索已学单词或释义" /></label><div className="learned-word-list">{visibleLearned.map((word) => <button key={word.id} onClick={() => setSelectedWord(word)}><strong>{word.word}</strong><span>{classifyCard(cardMap.get(word.id))}</span><small>{new Date(cardMap.get(word.id)!.card.due).toLocaleDateString('zh-CN')}</small></button>)}{!visibleLearned.length && <div className="empty-state compact">没有匹配的已学单词</div>}</div>{learnedWords.length > 100 && !wordSearch && <p className="field-help">当前先显示 100 个单词，可通过搜索查找其他单词。</p>}</section>

    {selectedWord && selectedCard && <div className="modal-backdrop"><section className="modal word-detail-modal" role="dialog" aria-modal="true"><button className="icon-button modal-close" onClick={() => setSelectedWord(undefined)} aria-label="关闭单词详情"><X /></button><p className="eyebrow">单词详情</p><h2>{selectedWord.word}</h2><p className="phonetic detail-phonetic">{selectedWord.phonetic || '暂无音标'} · {formatPartOfSpeech(selectedWord.partOfSpeech) || '词性未标注'}</p><p className="meaning compact">{selectedWord.meaning}</p><dl className="word-schedule"><div><dt>当前状态</dt><dd>{classifyCard(selectedCard)}</dd></div><div><dt>下次复习</dt><dd>{new Date(selectedCard.card.due).toLocaleString('zh-CN')}</dd></div><div><dt>难度</dt><dd>{selectedCard.card.difficulty.toFixed(1)}</dd></div><div><dt>稳定性</dt><dd>{selectedCard.card.stability.toFixed(1)} 天</dd></div></dl><h3>最近学习记录</h3><div className="word-history">{selectedHistory.map((session) => { const events = session.events.filter((event) => event.wordId === selectedWord.id); return <div key={session.id}><span>{new Date(session.completedAt!).toLocaleDateString('zh-CN')}</span><strong>{events.length ? events.map((event) => ratingLabel[event.rating]).join(' → ') : session.spellingForgottenWordIds.includes(selectedWord.id) ? '拼写时忘记' : '完成'}</strong></div> })}{!selectedHistory.length && <p className="muted small">暂无历史明细</p>}</div></section></div>}
  </div>
}
