import { Bell, CircleHelp, Download, HardDrive, Headphones, Info, Palette, RefreshCw, ShieldCheck, Upload, Volume2, VolumeX } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Onboarding } from './components/Onboarding'
import { Shell, type ViewName } from './components/Shell'
import { db, ensureBuiltinLibraryLoaded, getSettings, initializeDatabase, saveSettings, type LibraryLoadProgress } from './db'
import { exportBackup, inspectBackup, restoreBackup } from './lib/backup'
import { applyAppUpdate, subscribeToAppUpdate } from './lib/pwa'
import { playOnlinePronunciation, unlockPronunciationAudio } from './lib/pronunciation'
import { createQuickReviewRetry, createStudySession } from './lib/session'
import { playFeedbackSound } from './lib/sound'
import { dailyPlan } from './lib/study'
import { syncMemoryArchive } from './lib/memoryArchive'
import { HomeView } from './pages/HomeView'
import { SetupView } from './pages/SetupView'
import { StudyView } from './pages/StudyView'
import { MethodPracticeView } from './pages/MethodPracticeView'
import { QuickReviewView } from './pages/QuickReviewView'
import type { AppSettings, MemoryFolder, MemoryPaper, PlacementMode, StoredCard, StudyMethod, StudyMode, StudySession, WordEntry, WordLibrary } from './types'
import { defaultSettings } from './types'

const LibraryView = lazy(() => import('./pages/LibraryView').then((module) => ({ default: module.LibraryView })))
const StatsView = lazy(() => import('./pages/StatsView').then((module) => ({ default: module.StatsView })))
const ArchiveView = lazy(() => import('./pages/ArchiveView').then((module) => ({ default: module.ArchiveView })))

function App() {
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<ViewName>('home')
  const [libraries, setLibraries] = useState<WordLibrary[]>([])
  const [words, setWords] = useState<WordEntry[]>([])
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [cards, setCards] = useState<StoredCard[]>([])
  const [memoryFolders, setMemoryFolders] = useState<MemoryFolder[]>([])
  const [memoryPapers, setMemoryPapers] = useState<MemoryPaper[]>([])
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [activeSession, setActiveSession] = useState<StudySession>()
  const [setupInitialMode, setSetupInitialMode] = useState<StudyMode>('daily')
  const [setupPurpose, setSetupPurpose] = useState<'plan' | 'start'>('plan')
  const [initError, setInitError] = useState('')
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [backupReminder, setBackupReminder] = useState(false)
  const [libraryLoad, setLibraryLoad] = useState<(LibraryLoadProgress & { error?: string })>()
  const selectingLibraryRef = useRef(false)

  async function refresh() {
    const [nextLibraries, nextWords, nextSessions, nextCards, storedSettings] = await Promise.all([
      db.libraries.toArray(), db.words.toArray(), db.sessions.orderBy('startedAt').toArray(), db.cards.toArray(), getSettings(),
    ])
    await syncMemoryArchive(nextLibraries, nextWords, nextSessions)
    const [nextMemoryFolders, nextMemoryPapers] = await Promise.all([db.memoryFolders.toArray(), db.memoryPapers.toArray()])
    const currentLibraryId = nextLibraries.some((library) => library.id === storedSettings.currentLibraryId) ? storedSettings.currentLibraryId : undefined
    const nextSettings = currentLibraryId === storedSettings.currentLibraryId ? storedSettings : { ...storedSettings, currentLibraryId }
    if (nextSettings !== storedSettings) await saveSettings(nextSettings)
    setLibraries(nextLibraries)
    setWords(nextWords)
    setSessions(nextSessions)
    setCards(nextCards)
    setMemoryFolders(nextMemoryFolders)
    setMemoryPapers(nextMemoryPapers)
    setSettings(nextSettings)
    setActiveSession([...nextSessions].reverse().find((session) => session.status === 'active'))
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
    void initialize()
    return subscribeToAppUpdate(setUpdateAvailable)
  }, [])

  async function changeSettings(next: AppSettings) {
    setSettings(next)
    await saveSettings(next)
  }

  async function selectPlanLibrary(libraryId: string) {
    if (selectingLibraryRef.current) return
    const library = libraries.find((item) => item.id === libraryId) ?? await db.libraries.get(libraryId)
    if (!library) return
    selectingLibraryRef.current = true
    setLibraryLoad({ phase: 'checking', libraryId, libraryName: library.name, percent: 4 })
    try {
      await ensureBuiltinLibraryLoaded(libraryId, setLibraryLoad)
      await saveSettings({ ...settings, currentLibraryId: libraryId })
      await refresh()
      setView('setup')
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setLibraryLoad(undefined)
    } catch (error) {
      setLibraryLoad((current) => ({
        phase: current?.phase ?? 'checking',
        libraryId,
        libraryName: library.name,
        percent: current?.percent,
        error: error instanceof Error ? error.message : '词书加载失败，请稍后重试',
      }))
    } finally {
      selectingLibraryRef.current = false
    }
  }

  function navigate(next: ViewName) {
    if (next === 'study' && !activeSession) return
    if (next === 'setup') {
      setSetupPurpose('plan')
      setSetupInitialMode('daily')
    }
    setView(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function startSession(options: { library: WordLibrary; words: WordEntry[]; mode: StudyMode; placementMode: PlacementMode; count: number; allowRecent: boolean; methods?: StudyMethod[]; methodGroupSize?: number; dictationGroupSize?: number; randomSpellCheck?: boolean; scatterRepetitions?: number; scatterRecallBatchSize?: number }) {
    unlockPronunciationAudio()
    const session = await createStudySession(options)
    setActiveSession(session)
    setSessions((current) => [...current, session])
    setView('study')
  }

  const currentLibrary = libraries.find((library) => library.id === settings.currentLibraryId)

  async function startDueReview() {
    if (!currentLibrary || activeSession?.status === 'active') return
    const libraryWords = words.filter((word) => word.libraryId === currentLibrary.id)
    const libraryIds = new Set(libraryWords.map((word) => word.id))
    const plan = dailyPlan(libraryWords, new Map(cards.filter((card) => libraryIds.has(card.wordId)).map((card) => [card.wordId, card])), 0)
    if (!plan.dueCount) return
    await startSession({ library: currentLibrary, words: libraryWords, mode: 'due', placementMode: 'auto', count: plan.dueCount, allowRecent: false, methods: [] })
  }

  async function startNewWords() {
    if (!currentLibrary || activeSession?.status === 'active') return
    const libraryWords = words.filter((word) => word.libraryId === currentLibrary.id)
    const libraryIds = new Set(libraryWords.map((word) => word.id))
    const today = new Date()
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
    const learnedNewToday = new Set(sessions.filter((session) => {
      if (session.libraryId !== currentLibrary.id || session.status !== 'completed' || !session.completedAt) return false
      const completed = new Date(session.completedAt)
      return `${completed.getFullYear()}-${completed.getMonth()}-${completed.getDate()}` === todayKey
    }).flatMap((session) => session.newWordIds ?? [])).size
    const remainingTarget = Math.max(0, settings.dailyNewWordTarget - learnedNewToday)
    const plan = dailyPlan(libraryWords, new Map(cards.filter((card) => libraryIds.has(card.wordId)).map((card) => [card.wordId, card])), remainingTarget)
    if (!plan.newCount) return
    await startSession({
      library: currentLibrary,
      words: libraryWords,
      mode: 'daily',
      placementMode: settings.defaultPlacement,
      count: plan.newCount,
      allowRecent: false,
      methods: settings.lastStudyMethods?.length ? settings.lastStudyMethods : ['scatter'],
      methodGroupSize: settings.lastMethodGroupSize ?? 8,
      dictationGroupSize: settings.lastDictationGroupSize ?? 10,
      randomSpellCheck: settings.lastRandomSpellCheck ?? true,
      scatterRepetitions: settings.lastScatterRepetitions ?? settings.repetitionsPerWord ?? 3,
      scatterRecallBatchSize: settings.lastScatterRecallBatchSize ?? settings.recallBatchSize ?? 3,
    })
  }

  useEffect(() => {
    if (!ready || !settings.reminderEnabled || !currentLibrary || !('Notification' in window) || Notification.permission !== 'granted') return
    let timer: number | undefined
    const [hours, minutes] = settings.reminderTime.split(':').map(Number)
    const localDayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    const notifyIfNeeded = () => {
      const now = new Date()
      const todayKey = localDayKey(now)
      const libraryWords = words.filter((word) => word.libraryId === currentLibrary.id)
      const libraryIds = new Set(libraryWords.map((word) => word.id))
      const learnedNewToday = new Set(sessions.filter((session) => session.libraryId === currentLibrary.id && session.status === 'completed' && session.completedAt && localDayKey(new Date(session.completedAt)) === todayKey).flatMap((session) => session.newWordIds ?? [])).size
      const remainingTarget = Math.max(0, settings.dailyNewWordTarget - learnedNewToday)
      const plan = dailyPlan(libraryWords, new Map(cards.filter((card) => libraryIds.has(card.wordId)).map((card) => [card.wordId, card])), remainingTarget)
      const reminderKey = `a4-plan-reminder-${todayKey}`
      if (plan.totalCount > 0 && !localStorage.getItem(reminderKey)) {
        new Notification('A4词忆：今天还有学习计划', { body: `还有 ${plan.totalCount} 个词，完成后即可打卡。` })
        localStorage.setItem(reminderKey, 'sent')
      }
    }
    const scheduleNext = () => {
      const now = new Date()
      const target = new Date(now)
      target.setHours(Number.isFinite(hours) ? hours : 20, Number.isFinite(minutes) ? minutes : 0, 0, 0)
      if (target <= now) target.setDate(target.getDate() + 1)
      timer = window.setTimeout(() => {
        notifyIfNeeded()
        scheduleNext()
      }, target.getTime() - now.getTime())
    }
    const todayTarget = new Date()
    todayTarget.setHours(Number.isFinite(hours) ? hours : 20, Number.isFinite(minutes) ? minutes : 0, 0, 0)
    if (new Date() >= todayTarget) notifyIfNeeded()
    scheduleNext()
    return () => { if (timer !== undefined) window.clearTimeout(timer) }
  }, [ready, settings.reminderEnabled, settings.reminderTime, settings.dailyNewWordTarget, currentLibrary?.id, words, cards, sessions])

  if (initError) return <div className="loading-screen loading-error"><span className="brand-mark">A4</span><h1>词书没有准备好</h1><p>{initError}</p><button className="primary" onClick={initialize}><RefreshCw size={17} />重新加载</button><small>如果正在离线，请先联网完成首次加载。已有本地数据不会被清除。</small></div>
  if (!ready) return <div className="loading-screen"><span className="brand-mark">A4</span><p>正在铺开你的单词纸…</p></div>

  return <>
    <Shell view={view} onNavigate={navigate} studyActive={activeSession?.status === 'active'} updateAvailable={updateAvailable} onUpdate={applyAppUpdate}>
      {view === 'home' && <HomeView library={currentLibrary} words={words} cards={cards} sessions={sessions} settings={settings} activeSession={activeSession} onEditPlan={() => { setSetupPurpose('plan'); setSetupInitialMode('daily'); setView('setup') }} onExtraStudy={() => { setSetupPurpose('start'); setSetupInitialMode('random'); setView('setup') }} onStartWeak={() => { setSetupPurpose('start'); setSetupInitialMode('weak'); setView('setup') }} onStudyNew={() => void startNewWords()} onReviewDue={() => void startDueReview()} onContinue={() => { unlockPronunciationAudio(); setView('study') }} onAbandon={async () => { if (!activeSession || !window.confirm('放弃后不会推进复习日期，确定继续吗？')) return; await db.sessions.update(activeSession.id, { status: 'abandoned', updatedAt: new Date().toISOString() }); await refresh() }} />}
      {view === 'setup' && <SetupView purpose={setupPurpose} initialMode={setupInitialMode} library={currentLibrary} words={words} cards={cards} sessions={sessions} settings={settings} onSettings={changeSettings} onChoosePlanLibrary={() => setView('libraries')} onSaved={() => setView('home')} onStart={startSession} />}
      {view === 'study' && activeSession && activeSession.mode === 'due' && <QuickReviewView key={activeSession.id} initial={activeSession} words={words.filter((word) => word.libraryId === activeSession.libraryId)} settings={settings} onFinish={async (session) => { await refresh(); setActiveSession(session) }} onRetry={async (session, wordIds) => { const retry = await createQuickReviewRetry(session, wordIds); await refresh(); setActiveSession(retry) }} onExit={async () => { await refresh(); setView('home') }} />}
      {view === 'study' && activeSession && activeSession.mode !== 'due' && (activeSession.stage === 'match' || activeSession.stage === 'dictation') && <MethodPracticeView key={`${activeSession.id}-${activeSession.stage}`} initial={activeSession} words={words.filter((word) => word.libraryId === activeSession.libraryId)} settings={settings} onFinish={async (session) => { await refresh(); setActiveSession(session); if (session.status === 'completed' && !settings.backupReminderShown) setBackupReminder(true) }} onExit={async () => { await refresh(); setView('home') }} />}
      {view === 'study' && activeSession && activeSession.mode !== 'due' && activeSession.stage !== 'match' && activeSession.stage !== 'dictation' && <StudyView initial={activeSession} words={words.filter((word) => word.libraryId === activeSession.libraryId)} settings={settings} onSettings={changeSettings} onFinish={async (session) => { await refresh(); setActiveSession(session); if (session.status === 'completed' && !settings.backupReminderShown) setBackupReminder(true) }} onExit={async () => { await refresh(); setView('home') }} />}
      {view === 'libraries' && <Suspense fallback={<div className="loading-section">正在打开词书…</div>}><LibraryView libraries={libraries} words={words} currentLibraryId={currentLibrary?.id} loadingLibraryId={libraryLoad?.libraryId} onSelect={selectPlanLibrary} onChanged={refresh} /></Suspense>}
      {view === 'archive' && <Suspense fallback={<div className="loading-section">正在整理学习档案…</div>}><ArchiveView folders={memoryFolders} papers={memoryPapers} libraries={libraries} words={words} cards={cards} settings={settings} onChanged={refresh} /></Suspense>}
      {view === 'stats' && <Suspense fallback={<div className="loading-section">正在整理统计…</div>}><StatsView sessions={sessions} cards={cards} words={words} library={currentLibrary} onEditPlan={() => { setSetupPurpose('plan'); setSetupInitialMode('daily'); setView('setup') }} /></Suspense>}
      {view === 'settings' && <SettingsView settings={settings} onSettings={changeSettings} onRestored={refresh} />}
      {!settings.onboardingDone && <Onboarding onDone={() => changeSettings({ ...settings, onboardingDone: true })} />}
    </Shell>
    {libraryLoad && <LibraryLoadingOverlay progress={libraryLoad} onRetry={() => void selectPlanLibrary(libraryLoad.libraryId)} onClose={() => setLibraryLoad(undefined)} />}
    {backupReminder && <div className="modal-backdrop"><section className="modal backup-reminder" role="dialog" aria-modal="true"><p className="eyebrow">保护学习记录</p><h2>第一轮已经完成</h2><p>学习记录只保存在当前浏览器。清理浏览器数据或更换手机会导致记录丢失，建议现在导出一份备份。</p><div className="modal-actions"><button className="text-button" onClick={async () => { await changeSettings({ ...settings, backupReminderShown: true }); setBackupReminder(false) }}>稍后</button><button className="primary" onClick={async () => { const lastBackupAt = await exportBackup(); await changeSettings({ ...settings, backupReminderShown: true, lastBackupAt }); setBackupReminder(false) }}><Download size={17} />立即备份</button></div></section></div>}
  </>
}

const libraryLoadLabels: Record<LibraryLoadProgress['phase'], string> = {
  checking: '正在检查本机词书',
  downloading: '正在下载词书',
  processing: '正在整理词条',
  saving: '正在保存到本机',
  complete: '词书准备完成',
}

function LibraryLoadingOverlay({ progress, onRetry, onClose }: { progress: LibraryLoadProgress & { error?: string }; onRetry: () => void; onClose: () => void }) {
  return <div className="modal-backdrop library-loading-backdrop">
    <section className="library-loading-card" role="dialog" aria-modal="true" aria-live="polite" aria-busy={!progress.error}>
      <div className="loading-paper-art" aria-hidden="true"><span>A</span><i /><i /><i /></div>
      <p className="eyebrow">准备计划词书</p>
      <h2>{progress.libraryName}</h2>
      {progress.error ? <>
        <p className="library-load-error">{progress.error}</p>
        <small>请检查网络后重试。原有词书和学习记录没有被修改。</small>
        <div className="modal-actions"><button className="text-button" onClick={onClose}>暂不加载</button><button className="primary" onClick={onRetry}><RefreshCw size={17} />重新加载</button></div>
      </> : <>
        <p>{libraryLoadLabels[progress.phase]}</p>
        <div className={`library-load-track ${progress.percent === undefined ? 'indeterminate' : ''}`}><i style={progress.percent === undefined ? undefined : { width: `${progress.percent}%` }} /></div>
        <small>{progress.phase === 'downloading' ? '首次使用这本词书需要联网，之后可直接从本机打开。' : '只处理当前选择的词书，其他词书不会在后台加载。'}</small>
      </>}
    </section>
  </div>
}

function SettingsView({ settings, onSettings, onRestored }: { settings: AppSettings; onSettings: (settings: AppSettings) => void; onRestored: () => Promise<void> }) {
  const restoreRef = useRef<HTMLInputElement>(null)

  async function backupNow() {
    const lastBackupAt = await exportBackup()
    await onSettings({ ...settings, backupReminderShown: true, lastBackupAt })
  }

  async function toggleReminder() {
    if (settings.reminderEnabled) {
      await onSettings({ ...settings, reminderEnabled: false })
      return
    }
    if (typeof Notification === 'undefined') {
      alert('当前浏览器不支持系统通知，无法开启打卡提醒。')
      return
    }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    if (permission !== 'granted') {
      window.alert('浏览器没有获得通知权限，请在浏览器网站设置中允许通知后重试。')
      return
    }
    await onSettings({ ...settings, reminderEnabled: true })
  }

  function testPronunciation() {
    unlockPronunciationAudio()
    playOnlinePronunciation('memory', settings.accent, () => {
      if (typeof window.speechSynthesis === 'undefined') {
        alert('在线发音和当前浏览器的系统朗读都不可用。')
        return
      }
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance('memory')
      utterance.lang = settings.accent
      utterance.rate = settings.speechRate
      window.speechSynthesis.speak(utterance)
    })
  }

  async function restore(file?: File) {
    if (!file) return
    try {
      const data = await inspectBackup(file)
      const summary = `备份时间：${new Date(data.exportedAt).toLocaleString('zh-CN')}\n词书：${data.libraries.length} 个\n单词：${data.words.length} 个\n学习记录：${data.sessions.length} 轮\n记忆纸：${data.memoryPapers.filter((paper) => !paper.removed).length} 张\n\n恢复会覆盖当前数据，并先自动下载一份当前数据恢复点。确定继续吗？`
      if (!window.confirm(summary)) return
      await restoreBackup(data)
      await onRestored()
      window.alert('数据已恢复，恢复前的数据也已下载到本机。')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '恢复失败，当前数据未改变')
    }
  }

  const notificationStatus = typeof Notification === 'undefined' ? '当前浏览器不支持系统通知' : Notification.permission === 'granted' ? '通知权限已允许' : Notification.permission === 'denied' ? '通知权限已被浏览器拒绝' : '开启时会请求通知权限'

  return <div className="page-content settings-page">
    <div className="page-heading settings-heading"><p className="eyebrow">偏好与数据</p><h1>设置</h1><p>管理所有学习方法共用的体验、提醒和本地数据。</p></div>

    <section className="settings-section">
      <div className="settings-section-heading"><span><Headphones /></span><div><h2>声音与朗读</h2><p>控制单词发音和操作反馈。</p></div></div>
      <div className="panel settings-list">
        <div className="setting-row"><span><strong>自动朗读</strong><small>进入单词卡片或词序回忆时自动播放一次</small></span><button className={settings.autoSpeak ? 'sound-toggle active' : 'sound-toggle'} onClick={() => onSettings({ ...settings, autoSpeak: !settings.autoSpeak })} aria-pressed={settings.autoSpeak}>{settings.autoSpeak ? <Volume2 /> : <VolumeX />}{settings.autoSpeak ? '已开启' : '已关闭'}</button></div>
        <div className="setting-row"><span><strong>朗读口音</strong><small>在线音频和浏览器朗读均按此口音播放</small></span><div className="setting-control-line"><select value={settings.accent} onChange={(event) => onSettings({ ...settings, accent: event.target.value as AppSettings['accent'] })}><option value="en-US">美式英语</option><option value="en-GB">英式英语</option></select><button className="secondary compact-button" onClick={testPronunciation}><Volume2 size={16} />试听</button></div></div>
        <div className="setting-row"><span><strong>浏览器朗读速度</strong><small>仅在在线音频不可用、回退到系统语音时生效</small></span><div className="range-control"><input aria-label="浏览器朗读速度" type="range" min="0.6" max="1.3" step="0.05" value={settings.speechRate} onChange={(event) => onSettings({ ...settings, speechRate: Number(event.target.value) })} /><output>{settings.speechRate.toFixed(2).replace(/0$/, '')}x</output></div></div>
        <div className="setting-row"><span><strong>反馈音效</strong><small>完成、答对、答错和放置时播放短音效</small></span><div className="setting-control-line"><button className={settings.soundEffects ? 'sound-toggle active' : 'sound-toggle'} onClick={() => onSettings({ ...settings, soundEffects: !settings.soundEffects })} aria-pressed={settings.soundEffects}>{settings.soundEffects ? <Volume2 /> : <VolumeX />}{settings.soundEffects ? '已开启' : '已关闭'}</button><button className="secondary compact-button" onClick={() => playFeedbackSound('correct', true)}><Volume2 size={16} />试听</button></div></div>
      </div>
    </section>

    <section className="settings-section">
      <div className="settings-section-heading"><span><Palette /></span><div><h2>卡片与纸面</h2><p>调整学习时看到的信息和 A4 纸外观。</p></div></div>
      <div className="panel settings-list">
        <div className="setting-row"><span><strong>单词卡片信息</strong><small>选择学习卡片默认展示的辅助内容</small></span><div className="setting-checks"><label><input type="checkbox" checked={settings.showPhonetic} onChange={(event) => onSettings({ ...settings, showPhonetic: event.target.checked })} />音标</label><label><input type="checkbox" checked={settings.showPartOfSpeech} onChange={(event) => onSettings({ ...settings, showPartOfSpeech: event.target.checked })} />词性</label><label><input type="checkbox" checked={settings.showMeaning} onChange={(event) => onSettings({ ...settings, showMeaning: event.target.checked })} />释义</label></div></div>
        <div className="setting-row"><span><strong>A4 纸单词字号</strong><small>适用于随机散点和历史记忆纸</small></span><div className="range-control"><input aria-label="A4纸单词字号" type="range" min="0.8" max="1.25" step="0.05" value={settings.fontScale} onChange={(event) => onSettings({ ...settings, fontScale: Number(event.target.value) })} /><output>{Math.round(settings.fontScale * 100)}%</output></div></div>
        <div className="setting-row paper-theme-setting"><span><strong>A4 纸样式</strong><small>所有学习纸使用同一套长期外观偏好</small></span><div className="paper-theme-options" role="group" aria-label="选择A4纸样式">{([['plain', '素纸'], ['grid', '方格'], ['ruled', '横线']] as const).map(([key, label]) => <button key={key} className={settings.paperTheme === key ? 'active' : ''} onClick={() => onSettings({ ...settings, paperTheme: key })} aria-pressed={settings.paperTheme === key}><i className={`paper-theme-swatch paper-theme-${key}`} />{label}</button>)}</div></div>
        <div className="setting-row"><span><strong>操作提示</strong><small>显示学习过程中的可选引导；必要错误仍会保留</small></span><button className={settings.showStudyHints ? 'sound-toggle active' : 'sound-toggle'} onClick={() => onSettings({ ...settings, showStudyHints: !settings.showStudyHints })} aria-pressed={settings.showStudyHints}>{settings.showStudyHints ? '显示提示' : '精简提示'}</button></div>
      </div>
    </section>

    <section className="settings-section">
      <div className="settings-section-heading"><span><Bell /></span><div><h2>学习提醒</h2><p>仅在浏览器支持且页面可运行时生效。</p></div></div>
      <div className="panel settings-list">
        <div className="setting-row"><span><strong>未完成计划提醒</strong><small>{notificationStatus}</small></span><button className={settings.reminderEnabled ? 'sound-toggle active' : 'sound-toggle'} onClick={() => void toggleReminder()} aria-pressed={settings.reminderEnabled}><Bell />{settings.reminderEnabled ? '已开启' : '已关闭'}</button></div>
        <div className="setting-row"><span><strong>提醒时间</strong><small>应用打开时，在设定时间检查当天未完成计划</small></span><input type="time" value={settings.reminderTime} disabled={!settings.reminderEnabled} onChange={(event) => onSettings({ ...settings, reminderTime: event.target.value })} /></div>
      </div>
    </section>

    <section className="settings-section">
      <div className="settings-section-heading"><span><HardDrive /></span><div><h2>本地数据</h2><p>导出备份，避免清理浏览器数据或更换设备后丢失记录。</p></div></div>
      <div className="panel settings-data-panel"><div className="privacy-note"><ShieldCheck /><span><strong>数据仅保存在此浏览器</strong><small>词书、拼写和学习历史不会上传到服务器。</small></span></div><div className="data-actions"><button className="secondary" onClick={backupNow}><Download size={18} />导出完整备份</button><button className="secondary" onClick={() => restoreRef.current?.click()}><Upload size={18} />从备份恢复</button><input ref={restoreRef} hidden type="file" accept="application/json,.json" onChange={(event) => { void restore(event.target.files?.[0]); event.target.value = '' }} /></div><p className="field-help">{settings.lastBackupAt ? `上次备份：${new Date(settings.lastBackupAt).toLocaleString('zh-CN')}` : '尚未导出过备份。恢复前会自动下载当前数据恢复点。'}</p></div>
    </section>

    <section className="settings-section settings-help-section">
      <div className="settings-section-heading"><span><CircleHelp /></span><div><h2>使用帮助</h2><p>需要时重新查看完整操作流程。</p></div></div>
      <div className="panel settings-list"><div className="setting-row"><span><strong>新手引导</strong><small>重新查看从记忆、放置到回忆的分步示例</small></span><button className="secondary" onClick={() => onSettings({ ...settings, onboardingDone: false })}><Info size={17} />重新查看</button></div></div>
    </section>
  </div>
}

export default App
