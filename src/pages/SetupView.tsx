import { PageBack, PageLink } from '../components/PageNavigation'
import { goToParentPage, usePageRoute } from '../lib/navigation'
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
  onStart: (options: { library: WordLibrary; words: WordEntry[]; mode: StudyMode; placementMode: PlacementMode; count: number; allowRecent: boolean; methods: StudyMethod[]; methodGroupSize: number; dictationGroupSize: number; randomSpellCheck: boolean; scatterRepetitions: number; scatterRecallBatchSize: number }) => void | Promise<void>
}) {
  const route = usePageRoute()
  const base = props.purpose === 'plan' ? 'setup' : props.initialMode === 'weak' ? 'setup/weak' : 'setup/extra'
  const section = route.slice(base.length + 1)
  const [saveAsDefault, setSaveAsDefault] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
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
    props.onChoosePlanLibrary()
  }

  async function start() {
    if (!props.library) return
    if (saveAsDefault) await savePlan()
    await props.onStart({ library: props.library, words: libraryWords, mode, placementMode, count, allowRecent, methods, methodGroupSize, dictationGroupSize, randomSpellCheck, scatterRepetitions, scatterRecallBatchSize })
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


  async function submit() {
    if (!valid || saving) return
    setSaving(true)
    setError('')
    try { await (props.purpose === 'plan' ? saveOnly() : start()) }
    catch (error) { setError(error instanceof Error ? error.message : '保存失败，请重试。') }
    finally { setSaving(false) }
  }

  const titles: Record<string, string> = { methods: '学习流程', 'methods/scatter': '随机散点设置', 'methods/match': '词义连连看设置', 'methods/dictation': '折叠默写设置' }
  return <div className="page-content setup-page plan-page">
    <PageBack fallback={section ? section.startsWith('methods/') ? `${base}/methods` : base : 'home'} label={section ? '返回上一页' : '返回学习'} />
    <div className="page-heading"><p className="eyebrow">{props.purpose === 'plan' ? '调整计划' : '本次加练'}</p><h1>{titles[section] ?? (props.purpose === 'plan' ? '安排你的每日学习' : '安排这次额外练习')}</h1><p>{section ? '调整完成后返回，最后统一保存。' : props.purpose === 'plan' ? '词书、数量和学习流程，按自己的节奏安排。' : '本次设置只用于加练，不改变默认计划。'}</p></div>
    <div className="setup-layout">
      <section className="setup-form panel">
        {!section && <>
          <div className="setup-section"><span className="setup-number">01</span><div><h2>计划词书</h2><div className="plan-book-row"><span className="mini-book"><BookOpen /></span><div><strong>{props.library?.name ?? '未选择词书'}</strong><small>{props.library ? `${props.library.wordCount} 词` : '先选择一本词书'}</small></div>{props.purpose === 'plan' && <button className="secondary" onClick={() => void openLibraryPicker()}><RefreshCw size={16} />{props.library ? '更换词书' : '选择词书'}</button>}</div></div></div>
          <div className="setup-section"><span className="setup-number">02</span><div><h2>{props.purpose === 'plan' ? '每日新词目标' : '学习内容'}</h2>
            {props.purpose === 'start' && <div className="segmented plan-mode"><button className={mode === 'daily' ? 'active' : ''} onClick={() => setMode('daily')}>剩余新词</button><button className={mode === 'weak' ? 'active' : ''} onClick={() => setMode('weak')}>薄弱加练</button><button className={mode === 'random' ? 'active' : ''} onClick={() => setMode('random')}>自由学习</button></div>}
            {props.purpose === 'plan' ? <><div className="daily-target-control"><div className="quick-count-options" role="group" aria-label="快捷选择每日新词数量">{[10, 20, 30, 50].map((value) => <button key={value} className={dailyTarget === value ? 'active' : ''} onClick={() => setDailyTarget(value)}>{value} 词</button>)}</div><label className="number-input"><button onClick={() => setDailyTarget(Math.max(1, dailyTarget - 1))} aria-label="减少一个新词">−</button><input type="number" value={dailyTarget} min={1} max={200} step={1} aria-label="自定义每日新词数量" onChange={(event) => setDailyTarget(Math.max(1, Math.min(200, Math.round(Number(event.target.value) || 1))))} /><button onClick={() => setDailyTarget(Math.min(200, dailyTarget + 1))} aria-label="增加一个新词">＋</button><span>个新词</span></label></div><p className="field-help">今天已学 {learnedNewToday} 个新词，目标可以设置为 1–200 个。</p></> : mode === 'daily' ? <p className="field-help">按已保存的每日目标，本次还有 {plan.newCount} 个新词。</p> : <label className="number-input extra-count"><button onClick={() => setExtraCount(Math.max(1, extraCount - 1))} aria-label="减少加练数量">−</button><input type="number" value={extraCount} min={1} max={60} step={1} aria-label="加练词数" onChange={(event) => setExtraCount(Math.max(1, Math.min(60, Math.round(Number(event.target.value) || 1))))} /><button onClick={() => setExtraCount(Math.min(60, extraCount + 1))} aria-label="增加加练数量">＋</button><span>个词</span></label>}
            {props.purpose === 'start' && mode === 'random' && <label className="toggle-row"><span><strong>允许近期重复</strong><small>可抽到最近 3 天学过的非到期词</small></span><input type="checkbox" checked={allowRecent} onChange={(event) => setAllowRecent(event.target.checked)} /></label>}
          </div></div>
          <div className="setup-section"><span className="setup-number">03</span><div><h2>学习流程</h2><PageLink to={`${base}/methods`} title={methods.map((method) => methodLabels[method].title.replace('顺序回忆', '')).join(' → ') || '选择学习方法'} description="选择方法、调整顺序及每种方法的参数" /></div></div>
          {props.purpose === 'start' && <label className="toggle-row extra-default-option"><span><strong>同时设为默认学习流程</strong><small>仅勾选时更新后续学习的方法与参数</small></span><input type="checkbox" checked={saveAsDefault} onChange={(event) => setSaveAsDefault(event.target.checked)} /></label>}
        </>}
        {section === 'methods' && <div className="method-editor">
          <div className="method-presets"><button className={preset === 'complete' ? 'active' : ''} onClick={() => setPresetFlow('complete')}><strong>完整巩固</strong><small>散点 → 连连看 → 默写</small></button><button className={preset === 'quick' ? 'active' : ''} onClick={() => setPresetFlow('quick')}><strong>快速巩固</strong><small>连连看 → 默写</small></button><button className={preset === 'custom' ? 'active' : ''} onClick={() => setPreset('custom')}><strong>自定义流程</strong><small>选择并排序</small></button></div>
          <div className="method-choice-grid">{(['scatter', 'match', 'dictation'] as StudyMethod[]).map((method) => <button key={method} className={methods.includes(method) ? 'method-choice active' : 'method-choice'} onClick={() => toggleMethod(method)} aria-pressed={methods.includes(method)}><span className="method-check">{methods.includes(method) ? <CheckCircle2 /> : <span />}</span><strong>{methodLabels[method].title}</strong><small>{methodLabels[method].description}</small></button>)}</div>
          <h3 className="method-order-title">本轮顺序</h3>
          <div className="method-order-list" aria-label="学习方法顺序">{methods.map((method, index) => <div key={method} className="method-order-item" draggable onDragStart={() => setDraggingMethod(method)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggingMethod) moveMethod(methods.indexOf(draggingMethod), index); setDraggingMethod(undefined) }} onDragEnd={() => setDraggingMethod(undefined)}><GripVertical size={16} /><span><b>{index + 1}</b>{methodLabels[method].title}</span><button className="icon-button" disabled={index === 0} onClick={() => moveMethod(index, index - 1)} aria-label={`将${methodLabels[method].title}上移`}><ArrowUp size={15} /></button><button className="icon-button" disabled={index === methods.length - 1} onClick={() => moveMethod(index, index + 1)} aria-label={`将${methodLabels[method].title}下移`}><ArrowDown size={15} /></button></div>)}</div>
          <div className="page-menu method-parameter-links">{methods.map((method) => <PageLink key={method} to={`${base}/methods/${method}`} title={methodLabels[method].title + '设置'} description={method === 'scatter' ? `${scatterRepetitions} 遍 · 每 ${scatterRecallBatchSize} 词回忆 · ${placementMode === 'manual' ? '手动选点' : '自动随机'}` : `每组 ${method === 'match' ? methodGroupSize : dictationGroupSize} 词`} />)}</div>
          {!methods.length && <p className="validation">请至少选择一种学习方法。</p>}
        </div>}
        {section === 'methods/scatter' && <div className="method-editor"><div className="choice-grid"><button className={placementMode === 'manual' ? 'choice active' : 'choice'} onClick={() => setPlacementMode('manual')}><MapPin /><strong>手动选位置</strong><small>自己建立空间记忆</small></button><button className={placementMode === 'auto' ? 'choice active' : 'choice'} onClick={() => setPlacementMode('auto')}><Sparkles /><strong>自动随机</strong><small>系统寻找空白位置</small></button></div><label className="method-setting-row"><span><strong>每词背诵遍数</strong><small>完成后进入拼写或落纸</small></span><select value={scatterRepetitions} onChange={(event) => setScatterRepetitions(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((size) => <option value={size} key={size}>{size} 遍</option>)}</select></label><label className="method-setting-row"><span><strong>累积回忆批次</strong><small>每放置多少词进行一次回忆</small></span><select value={scatterRecallBatchSize} onChange={(event) => setScatterRecallBatchSize(Number(event.target.value))}>{[3, 5, 8, 10].map((size) => <option value={size} key={size}>{size} 词</option>)}</select></label><label className="method-setting-row"><span><strong>拼写检查</strong><small>关闭后完成背诵遍数即可落纸</small></span><input type="checkbox" checked={randomSpellCheck} onChange={(event) => setRandomSpellCheck(event.target.checked)} /></label></div>}
        {(section === 'methods/match' || section === 'methods/dictation') && <div className="method-editor"><label className="method-setting-row"><span><strong>每组单词</strong><small>不足一组时使用剩余词数</small></span><select value={section === 'methods/match' ? methodGroupSize : dictationGroupSize} onChange={(event) => (section === 'methods/match' ? setMethodGroupSize : setDictationGroupSize)(Number(event.target.value))}>{[6, 8, 10, 12].map((size) => <option value={size} key={size}>{size} 词</option>)}</select></label></div>}
      </section>
      <aside className="start-summary plan-summary"><p className="eyebrow">{props.purpose === 'plan' ? '计划草稿' : '本次任务'}</p><h2>{props.library?.name ?? '未选择词书'}</h2><dl><div><dt>内容</dt><dd>{props.purpose === 'plan' ? `每天 ${dailyTarget} 个新词` : `本次 ${count} 词`}</dd></div><div><dt>学习流程</dt><dd>{methods.map((method) => method === 'scatter' ? '散点' : method === 'match' ? '连连看' : '默写').join(' → ') || '请选择'}</dd></div></dl>{!section && <button className="primary wide large" disabled={!valid || saving} onClick={() => void submit()}><Target size={18} />{saving ? '正在保存…' : props.purpose === 'plan' ? '保存计划' : '开始加练'}{props.purpose === 'start' && <ArrowRight />}</button>}{section && <button className="primary wide large" onClick={() => goToParentPage(section.startsWith('methods/') ? `${base}/methods` : base)}><CheckCircle2 size={18} />完成调整</button>}{!valid && !section && <p className="validation">{!props.library ? '请选择计划词书。' : !methods.length ? '请至少选择一种学习方法。' : '当前没有可学习的单词。'}</p>}{error && <p className="validation" role="alert">{error}</p>}</aside>
    </div>
  </div>
}
