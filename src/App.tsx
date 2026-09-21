import { ArrowRight, BookOpen, CalendarClock, CheckCircle2, ChevronRight, Download, FileUp, Info, MapPin, Play, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Upload, Wifi, WifiOff } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { db, getSettings, initializeDatabase, saveSettings } from './db'
import { exportBackup, inspectBackup, restoreBackup } from './lib/backup'
import { createStudySession } from './lib/session'
import { Shell, type ViewName } from './components/Shell'
import { Onboarding } from './components/Onboarding'
import { StudyView } from './pages/StudyView'
import type { AppSettings, PlacementMode, StoredCard, StudyMode, StudySession, WordEntry, WordLibrary } from './types'
import { defaultSettings } from './types'
import { applyAppUpdate, subscribeToAppUpdate } from './lib/pwa'

const LibraryView = lazy(() => import('./pages/LibraryView').then((module) => ({ default: module.LibraryView })))
const StatsView = lazy(() => import('./pages/StatsView').then((module) => ({ default: module.StatsView })))

function App() {
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<ViewName>('home')
  const [libraries, setLibraries] = useState<WordLibrary[]>([])
  const [words, setWords] = useState<WordEntry[]>([])
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [cards, setCards] = useState<StoredCard[]>([])
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [activeSession, setActiveSession] = useState<StudySession>()
  const [setupInitialMode, setSetupInitialMode] = useState<StudyMode>('random')
  const [initError, setInitError] = useState('')
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [backupReminder, setBackupReminder] = useState(false)

  async function refresh() {
    const [nextLibraries, nextWords, nextSessions, nextCards, nextSettings] = await Promise.all([
      db.libraries.toArray(), db.words.toArray(), db.sessions.orderBy('startedAt').toArray(), db.cards.toArray(), getSettings(),
    ])
    setLibraries(nextLibraries); setWords(nextWords); setSessions(nextSessions); setCards(nextCards); setSettings(nextSettings)
    const active = [...nextSessions].reverse().find((session: StudySession) => session.status === 'active')
    setActiveSession(active)
  }

  async function initialize() {
    setInitError('')
    try {
      await initializeDatabase()
      await refresh()
      setReady(true)
    } catch (error) {
      setInitError(error instanceof Error ? error.message : '无法初始化本地数据')
    }
  }

  useEffect(() => {
    initialize()
    return subscribeToAppUpdate(setUpdateAvailable)
  }, [])

  async function changeSettings(next: AppSettings) {
    setSettings(next); await saveSettings(next)
  }

  function navigate(next: ViewName) {
    if (next === 'study' && !activeSession) return
    if (next === 'setup') setSetupInitialMode('random')
    setView(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (initError) return <div className="loading-screen loading-error"><span className="brand-mark">A4</span><h1>词库没有准备好</h1><p>{initError}</p><button className="primary" onClick={initialize}><RefreshCw size={17} />重新加载</button><small>如果正在离线，请先联网完成首次加载。已有本地数据不会被清除。</small></div>
  if (!ready) return <div className="loading-screen"><span className="brand-mark">A4</span><p>正在铺开你的单词纸…</p></div>

  return <><Shell view={view} onNavigate={navigate} studyActive={activeSession?.status === 'active'} updateAvailable={updateAvailable} onUpdate={applyAppUpdate}>
    {view === 'home' && <HomeView libraries={libraries} words={words} cards={cards} sessions={sessions} activeSession={activeSession} onNavigate={navigate} onReview={() => { setSetupInitialMode('due'); setView('setup') }} onAbandon={async () => { if (!activeSession || !window.confirm('放弃后不会推进复习日期，确定继续吗？')) return; await db.sessions.update(activeSession.id, { status: 'abandoned', updatedAt: new Date().toISOString() }); await refresh() }} />}
    {view === 'setup' && <SetupView initialMode={setupInitialMode} libraries={libraries} words={words} cards={cards} settings={settings} onStart={async (options) => { const session = await createStudySession(options); setActiveSession(session); setSessions([...sessions, session]); setView('study') }} />}
    {view === 'study' && activeSession && <StudyView initial={activeSession} words={words.filter((word) => word.libraryId === activeSession.libraryId)} settings={settings} onSettings={changeSettings} onFinish={async (session) => { await refresh(); setActiveSession(session); if (!settings.backupReminderShown) setBackupReminder(true) }} onExit={async () => { await refresh(); setView('home') }} />}
    {view === 'libraries' && <Suspense fallback={<div className="loading-section">正在打开词库…</div>}><LibraryView libraries={libraries} words={words} onChanged={refresh} /></Suspense>}
    {view === 'stats' && <Suspense fallback={<div className="loading-section">正在整理统计…</div>}><StatsView sessions={sessions} cards={cards} words={words} libraries={libraries} /></Suspense>}
    {view === 'settings' && <SettingsView settings={settings} onSettings={changeSettings} onRestored={refresh} />}
    {!settings.onboardingDone && <Onboarding onDone={() => changeSettings({ ...settings, onboardingDone: true })} />}
  </Shell>{backupReminder && <div className="modal-backdrop"><section className="modal backup-reminder" role="dialog" aria-modal="true"><p className="eyebrow">保护学习记录</p><h2>第一轮已经完成</h2><p>学习记录只保存在当前浏览器。清理浏览器数据或更换手机会导致记录丢失，建议现在导出一份备份。</p><div className="modal-actions"><button className="text-button" onClick={async () => { await changeSettings({ ...settings, backupReminderShown: true }); setBackupReminder(false) }}>稍后</button><button className="primary" onClick={async () => { const lastBackupAt = await exportBackup(); await changeSettings({ ...settings, backupReminderShown: true, lastBackupAt }); setBackupReminder(false) }}><Download size={17} />立即备份</button></div></section></div>}</>
}

function HomeView(props: { libraries: WordLibrary[]; words: WordEntry[]; cards: StoredCard[]; sessions: StudySession[]; activeSession?: StudySession; onNavigate: (view: ViewName) => void; onReview: () => void; onAbandon: () => void }) {
  const cardMap = new Map(props.cards.map((card) => [card.wordId, card]))
  const now = Date.now()
  const due = props.words.filter((word) => { const card = cardMap.get(word.id); return card && new Date(card.card.due).getTime() <= now }).length
  const weak = props.words.filter((word) => { const card = cardMap.get(word.id); return card && new Date(card.card.due).getTime() > now && card.card.difficulty >= 7 }).length
  const unseen = props.words.filter((word) => !cardMap.has(word.id)).length
  const completed = props.sessions.filter((session) => session.status === 'completed')
  const today = new Date().toDateString()
  const todayWords = completed.filter((session) => new Date(session.completedAt!).toDateString() === today).reduce((sum, session) => sum + session.wordIds.length, 0)
  return <div className="page-content home-page">
    {props.activeSession && <section className="resume-banner"><div><span className="resume-icon"><Play /></span><div><strong>上次学习还没有结束</strong><p>{props.activeSession.libraryName} · 已放置 {props.activeSession.placed.length}/{props.activeSession.wordIds.length} 词</p></div></div><div><button className="text-button" onClick={props.onAbandon}>放弃</button><button className="primary" onClick={() => props.onNavigate('study')}>继续学习<ArrowRight size={17} /></button></div></section>}
    <section className="home-intro"><div><p className="eyebrow">今天也从一张白纸开始</p><h1>写下位置，<br />按顺序想起来。</h1><p className="lead">背三遍、正确拼写、随机落纸。每写三个词，从第一个开始累积回忆。</p><button className="primary large" onClick={() => props.onNavigate('setup')}>开始一轮学习<ArrowRight /></button></div><div className="paper-motif" aria-hidden="true"><span>maintain</span><span>accurate</span><span>benefit</span><span>occur</span><i>1 · 2 · 3 · 回忆</i></div></section>
    <section className="today-band"><div className="today-plan"><CalendarClock /><span><small>今日待复习</small><strong>{due}</strong></span><span><small>薄弱词</small><strong>{weak}</strong></span><span><small>可学新词</small><strong>{unseen}</strong></span></div><button className="secondary" onClick={props.onReview}>安排复习<ChevronRight size={17} /></button></section>
    <div className="home-grid"><section className="panel overview-panel"><div className="section-heading"><div><h2>今日概览</h2><p>记录真实的学习动作</p></div></div><div className="overview-numbers"><div><strong>{todayWords}</strong><span>今日学习</span></div><div><strong>{completed.length}</strong><span>完成轮次</span></div><div><strong>{props.cards.length}</strong><span>已学词汇</span></div></div></section><section className="panel method-panel"><div className="section-heading"><div><h2>本轮节奏</h2><p>不看答案，先让大脑检索</p></div></div><ol><li><BookOpen /><span><strong>记3遍</strong><small>看词形、音标与释义</small></span></li><li><MapPin /><span><strong>拼写并落纸</strong><small>用随机位置建立空间线索</small></span></li><li><RotateCcw /><span><strong>累积回忆</strong><small>每3词回到开头重新检索</small></span></li></ol></section></div>
    <section className="library-strip"><div className="section-heading"><div><h2>你的词库</h2><p>一次只专注一个词库</p></div><button className="text-button" onClick={() => props.onNavigate('libraries')}>管理词库<ChevronRight size={16} /></button></div><div className="library-cards">{props.libraries.map((library) => <button key={library.id} onClick={() => props.onNavigate('setup')}><span className="library-letter">{library.name.slice(0, 1)}</span><strong>{library.name}</strong><small>{library.wordCount}词 · {library.kind === 'builtin' ? '内置词库' : '自定义词库'}</small></button>)}</div></section>
  </div>
}

function SetupView(props: { initialMode: StudyMode; libraries: WordLibrary[]; words: WordEntry[]; cards: StoredCard[]; settings: AppSettings; onStart: (options: { library: WordLibrary; words: WordEntry[]; mode: StudyMode; placementMode: PlacementMode; count: number; allowRecent: boolean }) => void }) {
  const [libraryId, setLibraryId] = useState(props.libraries[0]?.id ?? '')
  const [mode, setMode] = useState<StudyMode>(props.initialMode)
  const [placementMode, setPlacementMode] = useState<PlacementMode>(props.settings.defaultPlacement)
  const [count, setCount] = useState(6)
  const [allowRecent, setAllowRecent] = useState(props.settings.allowRecentRepeat)
  const library = props.libraries.find((item) => item.id === libraryId)
  const libraryWords = props.words.filter((word) => word.libraryId === libraryId)
  const cardMap = useMemo(() => new Map(props.cards.map((card) => [card.wordId, card])), [props.cards])
  const dueCount = libraryWords.filter((word) => { const card = cardMap.get(word.id); return card && new Date(card.card.due) <= new Date() }).length
  const dueException = mode === 'due' && dueCount > 0 && dueCount < 3
  const actualCount = dueException ? dueCount : Math.min(count, libraryWords.length)
  const valid = Boolean(library) && (dueException || (count >= 6 && count <= 60 && count % 3 === 0))
  return <div className="page-content setup-page"><div className="page-heading"><p className="eyebrow">新一轮学习</p><h1>安排这张A4纸</h1><p>选一个词库和学习方式，其余过程会严格按记忆节奏推进。</p></div><div className="setup-layout"><section className="setup-form panel"><div className="setup-section"><span className="setup-number">01</span><div><h2>选择词库</h2><label className="mobile-library-picker"><span>当前词库</span><select value={libraryId} onChange={(event) => setLibraryId(event.target.value)}>{props.libraries.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.wordCount}词</option>)}</select></label><div className="choice-grid libraries-choice">{props.libraries.map((item) => <button className={item.id === libraryId ? 'choice active' : 'choice'} onClick={() => setLibraryId(item.id)} key={item.id}><strong>{item.name}</strong><small>{item.wordCount}词</small>{item.id === libraryId && <CheckCircle2 />}</button>)}</div></div></div><div className="setup-section"><span className="setup-number">02</span><div><h2>抽词方式</h2><div className="segmented"><button className={mode === 'random' ? 'active' : ''} onClick={() => setMode('random')}>完全随机</button><button className={mode === 'weak' ? 'active' : ''} onClick={() => setMode('weak')}>薄弱词优先</button><button className={mode === 'due' ? 'active' : ''} onClick={() => setMode('due')}>今日复习</button></div><p className="field-help">{mode === 'random' ? '到期复习和薄弱词优先，其余再安排新词。' : mode === 'weak' ? '到期、高难度和稳定性较低的词排在前面。' : dueException ? `当前词库只有 ${dueCount} 个到期词，将直接以不足3词开始。` : `当前词库有 ${dueCount} 个到期词，不足时按薄弱词、未学词补足。`}</p>{mode === 'random' && <label className="toggle-row"><span><strong>允许近期重复</strong><small>开启后可抽到最近3天学过的非到期词</small></span><input type="checkbox" checked={allowRecent} onChange={(event) => setAllowRecent(event.target.checked)} /></label>}</div></div><div className="setup-section"><span className="setup-number">03</span><div><h2>学习数量</h2><label className="number-input"><button onClick={() => setCount(Math.max(6, count - 3))}>−</button><input type="number" value={count} min={6} max={60} step={3} onChange={(event) => setCount(Number(event.target.value))} disabled={dueException} /><button onClick={() => setCount(Math.min(60, count + 3))} disabled={dueException}>＋</button><span>个词</span></label><p className="field-help">{dueException ? `今日按实际到期数量学习：${dueCount}词。` : `6～60之间的3倍数，当前词库最多可选${Math.min(60, libraryWords.length)}词。`}</p></div></div><div className="setup-section"><span className="setup-number">04</span><div><h2>写入方式</h2><div className="choice-grid"><button className={placementMode === 'manual' ? 'choice active' : 'choice'} onClick={() => setPlacementMode('manual')}><MapPin /><strong>手动选位置</strong><small>自己建立空间记忆</small></button><button className={placementMode === 'auto' ? 'choice active' : 'choice'} onClick={() => setPlacementMode('auto')}><Sparkles /><strong>自动随机</strong><small>系统寻找空白位置</small></button></div></div></div></section><aside className="start-summary"><p className="eyebrow">本轮计划</p><h2>{library?.name}</h2><dl><div><dt>抽词</dt><dd>{mode === 'random' ? '复习优先' : mode === 'weak' ? '薄弱词优先' : '今日复习'}</dd></div><div><dt>数量</dt><dd>{actualCount}词</dd></div><div><dt>放置</dt><dd>{placementMode === 'manual' ? '手动选点' : '自动随机'}</dd></div><div><dt>回忆轮数</dt><dd>{Math.ceil(actualCount / 3)}轮</dd></div></dl><button className="primary wide large" disabled={!valid || !libraryWords.length || actualCount === 0 || (mode === 'due' && dueCount === 0)} onClick={() => library && props.onStart({ library, words: libraryWords, mode, placementMode, count: actualCount, allowRecent })}>开始学习<ArrowRight /></button>{!valid && <p className="validation">数量必须是6～60之间的3倍数</p>}{mode === 'due' && dueCount === 0 && <p className="validation">当前词库没有到期单词，可切换其他模式</p>}</aside></div></div>
}

function SettingsView({ settings, onSettings, onRestored }: { settings: AppSettings; onSettings: (settings: AppSettings) => void; onRestored: () => Promise<void> }) {
  const restoreRef = useRef<HTMLInputElement>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [offlineReady, setOfflineReady] = useState(Boolean(navigator.serviceWorker?.controller))

  useEffect(() => {
    const check = () => { setOnline(navigator.onLine); setOfflineReady(Boolean(navigator.serviceWorker?.controller)) }
    window.addEventListener('online', check)
    window.addEventListener('offline', check)
    navigator.serviceWorker?.addEventListener('controllerchange', check)
    return () => {
      window.removeEventListener('online', check)
      window.removeEventListener('offline', check)
      navigator.serviceWorker?.removeEventListener('controllerchange', check)
    }
  }, [])

  async function backupNow() {
    const lastBackupAt = await exportBackup()
    await onSettings({ ...settings, backupReminderShown: true, lastBackupAt })
  }

  async function restore(file?: File) {
    if (!file) return
    try {
      const data = await inspectBackup(file)
      const summary = `备份时间：${new Date(data.exportedAt).toLocaleString('zh-CN')}\n词库：${data.libraries.length} 个\n单词：${data.words.length} 个\n学习记录：${data.sessions.length} 轮\n\n恢复会覆盖当前数据，并先自动下载一份当前数据恢复点。确定继续吗？`
      if (!window.confirm(summary)) return
      await restoreBackup(data)
      await onRestored()
      window.alert('数据已恢复，恢复前的数据也已下载到本机。')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '恢复失败，当前数据未改变')
    }
  }

  return <div className="page-content"><div className="page-heading"><p className="eyebrow">偏好与数据</p><h1>设置</h1><p>所有学习数据只保存在当前浏览器，请定期备份。</p></div><div className="settings-grid"><section className="panel settings-panel"><h2>学习偏好</h2><label className="setting-row"><span><strong>朗读口音</strong><small>优先播放在线发音；美式和英式分别使用对应音频，失败时回退到浏览器朗读</small></span><select value={settings.accent} onChange={(event) => onSettings({ ...settings, accent: event.target.value as AppSettings['accent'] })}><option value="en-US">美式英语</option><option value="en-GB">英式英语</option></select></label><label className="setting-row"><span><strong>默认放置方式</strong><small>开始学习时仍可以临时修改</small></span><select value={settings.defaultPlacement} onChange={(event) => onSettings({ ...settings, defaultPlacement: event.target.value as PlacementMode })}><option value="manual">手动选位置</option><option value="auto">自动随机</option></select></label><label className="setting-row"><span><strong>纸面字号</strong><small>调整新放置单词的整体大小</small></span><input type="range" min="0.8" max="1.25" step="0.05" value={settings.fontScale} onChange={(event) => onSettings({ ...settings, fontScale: Number(event.target.value) })} /></label><button className="secondary" onClick={() => onSettings({ ...settings, onboardingDone: false })}><Info size={17} />重新查看新手引导</button></section><section className="panel settings-panel"><h2>本地数据</h2><div className="privacy-note"><ShieldCheck /><span><strong>本地优先</strong><small>词库、拼写和学习历史不会上传到服务器。</small></span></div><div className="data-actions"><button className="secondary" onClick={backupNow}><Download size={18} />导出完整备份</button><button className="secondary" onClick={() => restoreRef.current?.click()}><Upload size={18} />从备份恢复</button><input ref={restoreRef} hidden type="file" accept="application/json,.json" onChange={(event) => { restore(event.target.files?.[0]); event.target.value = '' }} /></div><p className="field-help">{settings.lastBackupAt ? `上次备份：${new Date(settings.lastBackupAt).toLocaleString('zh-CN')}` : '尚未导出过备份。恢复前会自动下载当前数据恢复点。'}</p></section><section className="panel settings-panel"><h2>离线状态</h2><div className={online ? 'connectivity-note online' : 'connectivity-note offline'}>{online ? <Wifi /> : <WifiOff />}<span><strong>{online ? '当前已联网' : '当前处于离线状态'}</strong><small>{offlineReady ? '应用外壳已缓存，可在断网时打开并学习；在线发音仍需要网络。' : '离线缓存尚未接管此页面，请联网刷新一次后再检查。'}</small></span></div><button className="secondary" onClick={() => { setOnline(navigator.onLine); setOfflineReady(Boolean(navigator.serviceWorker?.controller)) }}><RefreshCw size={17} />重新检测</button></section><section className="panel settings-panel"><h2>版本信息</h2><div className="info-line"><Info /><p><strong>A4词忆 0.2.0</strong><br />发现新版本时会在页面顶部提示；学习过程中不会强制刷新。</p></div></section><section className="panel settings-panel full"><h2>关于词库</h2><div className="info-line"><FileUp /><p>内置 14 套正式词库，共 56,678 个词条，覆盖四级、六级、考研、IELTS、TOEFL、GRE、GMAT 和 SAT。词库数据基于 ECDICT，采用 MIT License。</p></div></section></div></div>
}

export default App
