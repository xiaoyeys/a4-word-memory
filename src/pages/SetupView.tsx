import { ArrowDown, ArrowRight, ArrowUp, BookOpen, CheckCircle2, GripVertical, MapPin, RefreshCw, Sparkles, Target } from 'lucide-react'
import { useMemo, useState } from 'react'
import { dailyPlan } from '../lib/study'
import type { AppSettings, PlacementMode, StoredCard, StudyMethod, StudyMode, StudySession, WordEntry, WordLibrary } from '../types'

function localDay(value: Date | string) {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function SetupView(props: {
  purpose: 'plan' | 'start'
  initialMode: StudyMode
  library?: WordLibrary
  words: WordEntry[]
  cards: StoredCard[]
  sessions: StudySession[]
  settings: AppSettings
  onSettings: (settings: AppSettings) => void | Promise<void>
  onChoosePlanLibrary: () => void
  onSaved: () => void
  onStart: (options: { library: WordLibrary; words: WordEntry[]; mode: StudyMode; placementMode: PlacementMode; count: number; allowRecent: boolean; methods: StudyMethod[]; methodGroupSize: number; dictationGroupSize: number; randomSpellCheck: boolean; scatterRepetitions: number; scatterRecallBatchSize: number }) => void
}) {
  const [mode, setMode] = useState<StudyMode>(props.initialMode === 'due' ? 'daily' : props.initialMode)
  const [placementMode, setPlacementMode] = useState<PlacementMode>(props.settings.defaultPlacement)
  const [dailyTarget, setDailyTarget] = useState(props.settings.dailyNewWordTarget)
  const [extraCount, setExtraCount] = useState(12)
  const [allowRecent, setAllowRecent] = useState(props.settings.allowRecentRepeat)
  const [methods, setMethods] = useState<StudyMethod[]>(props.settings.lastStudyMethods ?? ['scatter'])
  const [preset, setPreset] = useState<'custom' | 'complete' | 'quick'>('custom')
  const [methodGroupSize, setMethodGroupSize] = useState(props.settings.lastMethodGroupSize ?? 8)
  const [dictationGroupSize, setDictationGroupSize] = useState(props.settings.lastDictationGroupSize ?? 10)
  const [randomSpellCheck, setRandomSpellCheck] = useState(props.settings.lastRandomSpellCheck ?? true)
  const [scatterRepetitions, setScatterRepetitions] = useState(props.settings.lastScatterRepetitions ?? props.settings.repetitionsPerWord ?? 3)
  const [scatterRecallBatchSize, setScatterRecallBatchSize] = useState(props.settings.lastScatterRecallBatchSize ?? props.settings.recallBatchSize ?? 3)
  const [draggingMethod, setDraggingMethod] = useState<StudyMethod>()
  const libraryWords = useMemo(() => props.words.filter((word) => word.libraryId === props.library?.id), [props.words, props.library?.id])
  const libraryWordIds = useMemo(() => new Set(libraryWords.map((word) => word.id)), [libraryWords])
  const cardMap = useMemo(() => new Map(props.cards.filter((card) => libraryWordIds.has(card.wordId)).map((card) => [card.wordId, card])), [props.cards, libraryWordIds])
  const today = localDay(new Date())
  const learnedNewToday = new Set(props.sessions.filter((session) => session.libraryId === props.library?.id && session.status === 'completed' && session.completedAt && localDay(session.completedAt) === today).flatMap((session) => session.newWordIds ?? [])).size
  const remainingNewTarget = Math.max(0, dailyTarget - learnedNewToday)
  const plan = dailyPlan(libraryWords, cardMap, remainingNewTarget)
  const count = mode === 'daily' ? plan.newCount : extraCount
  const planValid = Boolean(props.library) && methods.length > 0 && Number.isInteger(dailyTarget) && dailyTarget >= 1 && dailyTarget <= 200
  const valid = props.purpose === 'plan' ? planValid : Boolean(props.library) && methods.length > 0 && (mode === 'daily' ? plan.newCount > 0 : Number.isInteger(extraCount) && extraCount >= 1 && extraCount <= 60)

  async function savePlan() {
    await props.onSettings({ ...props.settings, dailyNewWordTarget: dailyTarget, defaultPlacement: placementMode, lastStudyMethods: methods, lastMethodGroupSize: methodGroupSize, lastDictationGroupSize: dictationGroupSize, lastRandomSpellCheck: randomSpellCheck, lastScatterRepetitions: scatterRepetitions, lastScatterRecallBatchSize: scatterRecallBatchSize })
  }

  async function openLibraryPicker() {
    await savePlan()
    props.onChoosePlanLibrary()
  }

  async function start() {
    if (!props.library) return
    await savePlan()
    props.onStart({ library: props.library, words: libraryWords, mode, placementMode, count, allowRecent, methods, methodGroupSize, dictationGroupSize, randomSpellCheck, scatterRepetitions, scatterRecallBatchSize })
  }

  async function saveOnly() {
    if (!planValid) return
    await savePlan()
    props.onSaved()
  }

  function setPresetFlow(value: 'custom' | 'complete' | 'quick') {
    setPreset(value)
    if (value === 'complete') setMethods(['scatter', 'match', 'dictation'])
    else if (value === 'quick') setMethods(['match', 'dictation'])
  }

  function toggleMethod(method: StudyMethod) {
    setPreset('custom')
    setMethods((current) => current.includes(method) ? current.filter((item) => item !== method) : [...current, method])
  }

  function moveMethod(from: number, to: number) {
    setMethods((current) => {
      if (to < 0 || to >= current.length || from === to) return current
      const next = [...current]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
    setPreset('custom')
  }

  const methodLabels: Record<StudyMethod, { title: string; description: string }> = {
    scatter: { title: '随机散点顺序回忆', description: '在纸面建立位置记忆，再按顺序回忆释义' },
    match: { title: '词义连连看', description: '点击英文与释义配对，快速检查词义' },
    dictation: { title: '折叠默写纠错', description: '遮住单词，根据释义默写并整理错词' },
  }

  return <div className="page-content setup-page plan-page">
    <div className="page-heading"><p className="eyebrow">{props.purpose === 'plan' ? '调整计划' : '加量学习'}</p><h1>{props.purpose === 'plan' ? '设置每天默认的学习方式' : '安排这次额外练习'}</h1><p>{props.purpose === 'plan' ? '保存一次后，首页“学习新词”会直接按这些设置开始。' : '临时选择词数和方法，不改变到期复习流程。'}</p></div>
    <div className="setup-layout">
      <section className="setup-form panel">
        <div className="setup-section"><span className="setup-number">01</span><div><h2>计划词书</h2><div className="plan-book-row"><span className="mini-book"><BookOpen /></span><div><strong>{props.library?.name ?? '未选择词书'}</strong><small>{props.library ? `${props.library.wordCount} 词 · 当前计划只学习这一本` : '先选择一本词书，之后可随时调整'}</small></div><button className="secondary" onClick={() => void openLibraryPicker()}><RefreshCw size={16} />{props.library ? '更换计划词书' : '选择计划词书'}</button></div></div></div>
        <div className="setup-section"><span className="setup-number">02</span><div><h2>{props.purpose === 'plan' ? '每日新词目标' : '学习内容'}</h2>{props.purpose === 'start' && <div className="segmented plan-mode"><button className={mode === 'daily' ? 'active' : ''} onClick={() => setMode('daily')}>学习新词</button><button className={mode === 'weak' ? 'active' : ''} onClick={() => setMode('weak')}>薄弱加练</button><button className={mode === 'random' ? 'active' : ''} onClick={() => setMode('random')}>自由学习</button></div>}{(props.purpose === 'plan' || mode === 'daily') && <><div className="daily-target-control"><div className="quick-count-options" role="group" aria-label="快捷选择每日新词数量">{[10, 20, 30, 50].map((value) => <button key={value} className={dailyTarget === value ? 'active' : ''} onClick={() => setDailyTarget(value)}>{value} 词</button>)}</div><label className="number-input"><button onClick={() => setDailyTarget(Math.max(1, dailyTarget - 1))} aria-label="减少一个新词">−</button><input type="number" value={dailyTarget} min={1} max={200} step={1} aria-label="自定义每日新词数量" onChange={(event) => setDailyTarget(Math.max(1, Math.min(200, Math.round(Number(event.target.value) || 1))))} /><button onClick={() => setDailyTarget(Math.min(200, dailyTarget + 1))} aria-label="增加一个新词">＋</button><span>个新词</span></label></div><p className="field-help">今天已学 {learnedNewToday} 个新词，按当前目标还可学习 {plan.newCount} 个。也可以直接输入 1–200 的任意数量。</p></>}{props.purpose === 'start' && mode !== 'daily' && <label className="number-input extra-count"><button onClick={() => setExtraCount(Math.max(1, extraCount - 1))}>−</button><input type="number" value={extraCount} min={1} max={60} step={1} onChange={(event) => setExtraCount(Math.max(1, Math.min(60, Math.round(Number(event.target.value) || 1))))} /><button onClick={() => setExtraCount(Math.min(60, extraCount + 1))}>＋</button><span>个词</span></label>}{props.purpose === 'start' && mode === 'random' && <label className="toggle-row"><span><strong>允许近期重复</strong><small>可抽到最近3天学过的非到期词</small></span><input type="checkbox" checked={allowRecent} onChange={(event) => setAllowRecent(event.target.checked)} /></label>}</div></div>
        <div className="setup-section method-selection-section"><span className="setup-number">03</span><div><h2>选择学习方式</h2><p className="field-help">可以单独使用一种，也可以让同一批词依次练习多种方法。</p>
          <div className="method-presets"><button className={preset === 'complete' ? 'active' : ''} onClick={() => setPresetFlow('complete')}><strong>完整巩固</strong><small>散点 → 连连看 → 默写</small></button><button className={preset === 'quick' ? 'active' : ''} onClick={() => setPresetFlow('quick')}><strong>快速复习</strong><small>连连看 → 默写</small></button><button className={preset === 'custom' ? 'active' : ''} onClick={() => setPreset('custom')}><strong>自定义流程</strong><small>选择并排序</small></button></div>
          <div className="method-choice-grid">{(['scatter', 'match', 'dictation'] as StudyMethod[]).map((method) => <button key={method} className={methods.includes(method) ? 'method-choice active' : 'method-choice'} onClick={() => toggleMethod(method)} aria-pressed={methods.includes(method)}><span className="method-check">{methods.includes(method) ? <CheckCircle2 /> : <span />}</span><strong>{methodLabels[method].title}</strong><small>{methodLabels[method].description}</small></button>)}</div>
          <div className="method-order-list" aria-label="学习方法顺序">{methods.map((method, index) => <div key={method} className="method-order-item" draggable onDragStart={() => setDraggingMethod(method)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggingMethod) moveMethod(methods.indexOf(draggingMethod), index); setDraggingMethod(undefined) }} onDragEnd={() => setDraggingMethod(undefined)}><GripVertical size={16} /><span><b>{index + 1}</b>{methodLabels[method].title}</span><button className="icon-button" disabled={index === 0} onClick={() => moveMethod(index, index - 1)} aria-label={`将${methodLabels[method].title}上移`}><ArrowUp size={15} /></button><button className="icon-button" disabled={index === methods.length - 1} onClick={() => moveMethod(index, index + 1)} aria-label={`将${methodLabels[method].title}下移`}><ArrowDown size={15} /></button></div>)}</div>
          {methods.includes('scatter') && <div className="method-config-group"><h3>随机散点设置</h3><div className="choice-grid"><button className={placementMode === 'manual' ? 'choice active' : 'choice'} onClick={() => setPlacementMode('manual')}><MapPin /><strong>手动选位置</strong><small>自己建立空间记忆</small>{placementMode === 'manual' && <CheckCircle2 />}</button><button className={placementMode === 'auto' ? 'choice active' : 'choice'} onClick={() => setPlacementMode('auto')}><Sparkles /><strong>自动随机</strong><small>系统寻找空白位置</small>{placementMode === 'auto' && <CheckCircle2 />}</button></div><label className="method-setting-row"><span><strong>每词背诵遍数</strong><small>完成后进入拼写或落纸</small></span><select value={scatterRepetitions} onChange={(event) => setScatterRepetitions(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((size) => <option value={size} key={size}>{size} 遍</option>)}</select></label><label className="method-setting-row"><span><strong>累积回忆批次</strong><small>每放置多少词进行一次顺序回忆</small></span><select value={scatterRecallBatchSize} onChange={(event) => setScatterRecallBatchSize(Number(event.target.value))}>{[3, 5, 8, 10].map((size) => <option value={size} key={size}>{size} 词</option>)}</select></label><label className="method-setting-row"><span><strong>拼写检查</strong><small>关闭后完成背诵遍数即可落纸</small></span><input type="checkbox" checked={randomSpellCheck} onChange={(event) => setRandomSpellCheck(event.target.checked)} /></label></div>}
          {methods.includes('match') && <div className="method-config-group"><h3>词义连连看设置</h3><label className="method-setting-row"><span><strong>每组单词</strong><small>不足一组时使用剩余词数</small></span><select value={methodGroupSize} onChange={(event) => setMethodGroupSize(Number(event.target.value))}>{[6, 8, 10, 12].map((size) => <option value={size} key={size}>{size} 词</option>)}</select></label></div>}
          {methods.includes('dictation') && <div className="method-config-group"><h3>折叠默写设置</h3><label className="method-setting-row"><span><strong>每轮词数</strong><small>不足一组时使用剩余词数</small></span><select value={dictationGroupSize} onChange={(event) => setDictationGroupSize(Number(event.target.value))}>{[6, 8, 10, 12].map((size) => <option value={size} key={size}>{size} 词</option>)}</select></label></div>}
        </div></div>
      </section>
      <aside className="start-summary plan-summary"><p className="eyebrow">{props.purpose === 'plan' ? '默认计划' : '本次任务'}</p><h2>{props.library?.name}</h2><dl><div><dt>内容</dt><dd>{props.purpose === 'plan' ? `每天 ${dailyTarget} 个新词` : mode === 'daily' ? '学习新词' : mode === 'weak' ? '薄弱加练' : '自由学习'}</dd></div>{props.purpose === 'start' && <div><dt>本次合计</dt><dd>{count}词</dd></div>}<div><dt>学习流程</dt><dd>{methods.map((method) => method === 'scatter' ? '散点' : method === 'match' ? '连连看' : '默写').join(' → ') || '请选择'}</dd></div>{methods.includes('scatter') && <div><dt>落纸</dt><dd>{placementMode === 'manual' ? '手动选点' : '自动随机'}</dd></div>}</dl><button className="primary wide large" disabled={!valid} onClick={() => void (props.purpose === 'plan' ? saveOnly() : start())}><Target size={18} />{props.purpose === 'plan' ? '保存计划' : '保存并开始'}{props.purpose === 'start' && <ArrowRight />}</button>{!valid && <p className="validation">{props.purpose === 'plan' ? '请至少选择一种学习方法。' : '当前内容没有可学习的单词，或数量设置无效。'}</p>}</aside>
    </div>
  </div>
}
