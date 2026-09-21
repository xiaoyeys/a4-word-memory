import { CalendarDays, Target, TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { classifyCard, summaryFor } from '../lib/study'
import type { StoredCard, StudySession, WordEntry, WordLibrary } from '../types'

export function StatsView({ sessions, cards, words, libraries }: { sessions: StudySession[]; cards: StoredCard[]; words: WordEntry[]; libraries: WordLibrary[] }) {
  const completed = sessions.filter((session) => session.status === 'completed')
  const summaries = completed.map((session) => ({ session, summary: summaryFor(session) }))
  const chartData = summaries.slice(-10).map(({ session, summary }) => ({ date: new Date(session.completedAt!).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }), 首次记忆率: Math.round(summary.firstRecallRate * 100), 最终掌握率: Math.round(summary.finalMasteryRate * 100) }))
  const dueCount = cards.filter((card) => new Date(card.card.due) <= new Date()).length
  const learned = cards.length
  const cardMap = new Map(cards.map((card) => [card.wordId, card]))
  const weakWords = words.filter((word) => ['待复习', '薄弱'].includes(classifyCard(cardMap.get(word.id)))).slice(0, 12)
  return <div className="page-content"><div className="page-heading"><p className="eyebrow">学习统计</p><h1>看见记忆的变化</h1><p>短期回忆和长期排程分开记录，不会因一轮内重复作答而虚高。</p></div>
    <div className="metric-grid"><div className="metric"><Target /><span>已学习词汇</span><strong>{learned}</strong></div><div className="metric"><CalendarDays /><span>今日待复习</span><strong>{dueCount}</strong></div><div className="metric"><TrendingUp /><span>已完成轮次</span><strong>{completed.length}</strong></div></div>
    <div className="stats-grid"><section className="panel chart-panel"><div className="section-heading"><div><h2>记忆率趋势</h2><p>最近10次完成的学习</p></div></div>{chartData.length ? <ResponsiveContainer width="100%" height={280}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e1da" /><XAxis dataKey="date" tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} unit="%" /><Tooltip /><Bar dataKey="首次记忆率" fill="#9da9a2" radius={[3,3,0,0]} /><Bar dataKey="最终掌握率" fill="#d36b45" radius={[3,3,0,0]} /></BarChart></ResponsiveContainer> : <div className="empty-state">完成第一轮学习后，这里会出现趋势图。</div>}</section>
      <section className="panel"><div className="section-heading"><div><h2>词库进度</h2><p>每次只专注一个词库</p></div></div><div className="progress-list">{libraries.map((library) => { const count = words.filter((word) => word.libraryId === library.id && cardMap.has(word.id)).length; const percent = library.wordCount ? count / library.wordCount * 100 : 0; return <div key={library.id}><span><strong>{library.name}</strong><small>{count}/{library.wordCount}</small></span><div className="progress-track"><i style={{width: `${percent}%`}} /></div></div> })}</div></section>
    </div>
    <section className="panel history-panel"><div className="section-heading"><div><h2>历史记录</h2><p>每轮原始表现都会保留</p></div></div>{summaries.length ? <div className="history-list">{summaries.slice().reverse().map(({session, summary}) => <div className="history-row" key={session.id}><span><strong>{session.libraryName}</strong><small>{new Date(session.completedAt!).toLocaleString('zh-CN')}</small></span><span>{summary.totalWords}词</span><span>首次 {Math.round(summary.firstRecallRate*100)}%</span><span>最终 {Math.round(summary.finalMasteryRate*100)}%</span></div>)}</div> : <div className="empty-state compact">暂无完成记录</div>}</section>
    <section className="panel"><div className="section-heading"><div><h2>薄弱词</h2><p>到期或难度偏高的单词</p></div></div><div className="weak-word-grid">{weakWords.map((word) => <div key={word.id}><strong>{word.word}</strong><span>{word.meaning}</span><small>{classifyCard(cardMap.get(word.id))}</small></div>)}{!weakWords.length && <div className="empty-state compact">暂无薄弱词</div>}</div></section>
  </div>
}
