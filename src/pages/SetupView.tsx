import { ArrowRight, BookOpen, CheckCircle2, MapPin, RefreshCw, Sparkles, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { dailyPlan } from '../lib/study'
import type { AppSettings, PlacementMode, StoredCard, StudyMode, StudySession, WordEntry, WordLibrary } from '../types'

function localDay(value: Date | string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function SetupView(props: {
  initialMode: StudyMode
  library?: WordLibrary
  words: WordEntry[]
  cards: StoredCard[]
  sessions: StudySession[]
  settings: AppSettings
  onSettings: (settings: AppSettings) => void
  onChangeLibrary: () => void
  onStart: (options: { library: WordLibrary; words: WordEntry[]; mode: StudyMode; placementMode: PlacementMode; count: number; allowRecent: boolean }) => void
}) {
  const [mode, setMode] = useState<StudyMode>(props.initialMode)
  const [placementMode, setPlacementMode] = useState<PlacementMode>(props.settings.defaultPlacement)
  const [dailyTarget, setDailyTarget] = useState(props.settings.dailyNewWordTarget)
  const [extraCount, setExtraCount] = useState(12)
  const [allowRecent, setAllowRecent] = useState(props.settings.allowRecentRepeat)
  const libraryWords = useMemo(() => props.words.filter((word) => word.libraryId === props.library?.id), [props.words, props.library?.id])
  const libraryWordIds = useMemo(() => new Set(libraryWords.map((word) => word.id)), [libraryWords])
  const cardMap = useMemo(() => new Map(props.cards.filter((card) => libraryWordIds.has(card.wordId)).map((card) => [card.wordId, card])), [props.cards, libraryWordIds])
  const today = localDay(new Date())
  const learnedNewToday = new Set(props.sessions.filter((session) => session.libraryId === props.library?.id && session.status === 'completed' && session.completedAt && localDay(session.completedAt) === today).flatMap((session) => session.newWordIds ?? [])).size
  const remainingNewTarget = Math.max(0, dailyTarget - learnedNewToday)
  const plan = dailyPlan(libraryWords, cardMap, remainingNewTarget)
  const count = mode === 'daily' ? plan.newCount : mode === 'due' ? plan.dueCount : extraCount
  const valid = Boolean(props.library) && (mode === 'daily' ? plan.totalCount > 0 : mode === 'due' ? plan.dueCount > 0 : extraCount >= 6 && extraCount <= 60 && extraCount % 3 === 0)

  async function savePlan() {
    await props.onSettings({ ...props.settings, dailyNewWordTarget: dailyTarget, defaultPlacement: placementMode })
  }

  function start() {
    if (!props.library) return
    void savePlan()
    props.onStart({ library: props.library, words: libraryWords, mode, placementMode, count, allowRecent })
  }

  return <div className="page-content setup-page plan-page">
    <div className="page-heading"><p className="eyebrow">学习计划</p><h1>安排每天的 A4 记忆任务</h1><p>每日新词目标会保存；到期复习自动加入，不占用新词名额。</p></div>
    <div className="setup-layout">
      <section className="setup-form panel">
        <div className="setup-section"><span className="setup-number">01</span><div><h2>当前词书</h2><div className="plan-book-row"><span className="mini-book"><BookOpen /></span><div><strong>{props.library?.name ?? '尚未选择词书'}</strong><small>{props.library?.wordCount ?? 0} 词</small></div><button className="secondary" onClick={props.onChangeLibrary}><RefreshCw size={16} />更换词书</button></div></div></div>
        <div className="setup-section"><span className="setup-number">02</span><div><h2>每日新词目标</h2><label className="number-input"><button onClick={() => setDailyTarget(Math.max(3, dailyTarget - 3))}>−</button><input type="number" value={dailyTarget} min={3} max={60} step={3} onChange={(event) => setDailyTarget(Math.max(3, Math.min(60, Number(event.target.value))))} /><button onClick={() => setDailyTarget(Math.min(60, dailyTarget + 3))}>＋</button><span>个新词</span></label><p className="field-help">今天已学 {learnedNewToday} 个新词，还需 {plan.newCount} 个；另有 {plan.dueCount} 个到期复习。</p></div></div>
        <div className="setup-section"><span className="setup-number">03</span><div><h2>学习内容</h2><div className="segmented plan-mode"><button className={mode === 'daily' ? 'active' : ''} onClick={() => setMode('daily')}>今日计划</button><button className={mode === 'weak' ? 'active' : ''} onClick={() => setMode('weak')}>薄弱加练</button><button className={mode === 'due' ? 'active' : ''} onClick={() => setMode('due')}>仅复习</button><button className={mode === 'random' ? 'active' : ''} onClick={() => setMode('random')}>自由学习</button></div>{mode !== 'daily' && mode !== 'due' && <label className="number-input extra-count"><button onClick={() => setExtraCount(Math.max(6, extraCount - 3))}>−</button><input type="number" value={extraCount} min={6} max={60} step={3} onChange={(event) => setExtraCount(Number(event.target.value))} /><button onClick={() => setExtraCount(Math.min(60, extraCount + 3))}>＋</button><span>个词</span></label>}{mode === 'random' && <label className="toggle-row"><span><strong>允许近期重复</strong><small>可抽到最近3天学过的非到期词</small></span><input type="checkbox" checked={allowRecent} onChange={(event) => setAllowRecent(event.target.checked)} /></label>}</div></div>
        <div className="setup-section"><span className="setup-number">04</span><div><h2>写入方式</h2><div className="choice-grid"><button className={placementMode === 'manual' ? 'choice active' : 'choice'} onClick={() => setPlacementMode('manual')}><MapPin /><strong>手动选位置</strong><small>自己建立空间记忆</small>{placementMode === 'manual' && <CheckCircle2 />}</button><button className={placementMode === 'auto' ? 'choice active' : 'choice'} onClick={() => setPlacementMode('auto')}><Sparkles /><strong>自动随机</strong><small>系统寻找空白位置</small>{placementMode === 'auto' && <CheckCircle2 />}</button></div></div></div>
      </section>
      <aside className="start-summary plan-summary"><p className="eyebrow">本次任务</p><h2>{props.library?.name}</h2><dl><div><dt>模式</dt><dd>{mode === 'daily' ? '今日计划' : mode === 'weak' ? '薄弱加练' : mode === 'due' ? '到期复习' : '自由学习'}</dd></div>{mode === 'daily' && <><div><dt>新词</dt><dd>{plan.newCount}词</dd></div><div><dt>复习</dt><dd>{plan.dueCount}词</dd></div></>}<div><dt>本次合计</dt><dd>{mode === 'daily' ? plan.totalCount : count}词</dd></div><div><dt>放置</dt><dd>{placementMode === 'manual' ? '手动选点' : '自动随机'}</dd></div></dl><button className="primary wide large" disabled={!valid} onClick={start}><Target size={18} />保存并开始<ArrowRight /></button>{!valid && <p className="validation">当前模式下没有可学习的单词，或数量设置无效。</p>}</aside>
    </div>
  </div>
}
