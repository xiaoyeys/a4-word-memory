import { Bell, Download, FileUp, Info, RefreshCw, ShieldCheck, Upload, Wifi, WifiOff, Volume2, VolumeX } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Onboarding } from './components/Onboarding'
import { Shell, type ViewName } from './components/Shell'
import { db, getSettings, initializeDatabase, saveSettings } from './db'
import { exportBackup, inspectBackup, restoreBackup } from './lib/backup'
import { applyAppUpdate, subscribeToAppUpdate } from './lib/pwa'
import { unlockPronunciationAudio } from './lib/pronunciation'
import { createStudySession } from './lib/session'
import { dailyPlan } from './lib/study'
import { syncMemoryArchive } from './lib/memoryArchive'
import { HomeView } from './pages/HomeView'
import { SetupView } from './pages/SetupView'
import { StudyView } from './pages/StudyView'
import type { AppSettings, MemoryFolder, MemoryPaper, PlacementMode, StoredCard, StudyMode, StudySession, WordEntry, WordLibrary } from './types'
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
  const [initError, setInitError] = useState('')
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [backupReminder, setBackupReminder] = useState(false)

  async function refresh() {
    const [nextLibraries, nextWords, nextSessions, nextCards, storedSettings] = await Promise.all([
      db.libraries.toArray(), db.words.toArray(), db.sessions.orderBy('startedAt').toArray(), db.cards.toArray(), getSettings(),
    ])
    await syncMemoryArchive(nextLibraries, nextWords, nextSessions)
    const [nextMemoryFolders, nextMemoryPapers] = await Promise.all([db.memoryFolders.toArray(), db.memoryPapers.toArray()])
    const currentLibraryId = nextLibraries.some((library) => library.id === storedSettings.currentLibraryId) ? storedSettings.currentLibraryId : nextLibraries[0]?.id
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

  function navigate(next: ViewName) {
    if (next === 'study' && !activeSession) return
    if (next === 'setup') setSetupInitialMode('daily')
    setView(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function startSession(options: { library: WordLibrary; words: WordEntry[]; mode: StudyMode; placementMode: PlacementMode; count: number; allowRecent: boolean }) {
    unlockPronunciationAudio()
    const session = await createStudySession(options)
    setActiveSession(session)
    setSessions((current) => [...current, session])
    setView('study')
  }

  const currentLibrary = libraries.find((library) => library.id === settings.currentLibraryId) ?? libraries[0]

  useEffect(() => {
    if (!ready || !settings.reminderEnabled || !currentLibrary || !('Notification' in window) || Notification.permission !== 'granted') return
    const libraryWords = words.filter((word) => word.libraryId === currentLibrary.id)
    const libraryIds = new Set(libraryWords.map((word) => word.id))
    const plan = dailyPlan(libraryWords, new Map(cards.filter((card) => libraryIds.has(card.wordId)).map((card) => [card.wordId, card])), settings.dailyNewWordTarget)
    const reminderKey = `a4-plan-reminder-${new Date().toISOString().slice(0, 10)}`
    if (plan.totalCount > 0 && !localStorage.getItem(reminderKey)) {
      new Notification('A4词忆：今天还有学习计划', { body: `还有 ${plan.totalCount} 个词，完成后即可打卡。` })
      localStorage.setItem(reminderKey, 'sent')
    }
  }, [ready, settings.reminderEnabled, settings.dailyNewWordTarget, currentLibrary?.id, words, cards])

  if (initError) return <div className="loading-screen loading-error"><span className="brand-mark">A4</span><h1>词书没有准备好</h1><p>{initError}</p><button className="primary" onClick={initialize}><RefreshCw size={17} />重新加载</button><small>如果正在离线，请先联网完成首次加载。已有本地数据不会被清除。</small></div>
  if (!ready) return <div className="loading-screen"><span className="brand-mark">A4</span><p>正在铺开你的单词纸…</p></div>

  return <>
    <Shell view={view} onNavigate={navigate} studyActive={activeSession?.status === 'active'} updateAvailable={updateAvailable} onUpdate={applyAppUpdate} currentLibraryName={currentLibrary?.name}>
      {view === 'home' && <HomeView library={currentLibrary} words={words} cards={cards} sessions={sessions} settings={settings} activeSession={activeSession} onChangeLibrary={() => setView('libraries')} onEditPlan={() => { setSetupInitialMode('daily'); setView('setup') }} onExtraStudy={() => { setSetupInitialMode('random'); setView('setup') }} onStartDaily={(newWordCount) => currentLibrary && void startSession({ library: currentLibrary, words: words.filter((word) => word.libraryId === currentLibrary.id), mode: 'daily', placementMode: settings.defaultPlacement, count: newWordCount, allowRecent: false })} onContinue={() => { unlockPronunciationAudio(); setView('study') }} onAbandon={async () => { if (!activeSession || !window.confirm('放弃后不会推进复习日期，确定继续吗？')) return; await db.sessions.update(activeSession.id, { status: 'abandoned', updatedAt: new Date().toISOString() }); await refresh() }} />}
      {view === 'setup' && <SetupView initialMode={setupInitialMode} library={currentLibrary} words={words} cards={cards} sessions={sessions} settings={settings} onSettings={changeSettings} onChangeLibrary={() => setView('libraries')} onStart={startSession} />}
      {view === 'study' && activeSession && <StudyView initial={activeSession} words={words.filter((word) => word.libraryId === activeSession.libraryId)} settings={settings} onSettings={changeSettings} onFinish={async (session) => { await refresh(); setActiveSession(session); if (!settings.backupReminderShown) setBackupReminder(true) }} onExit={async () => { await refresh(); setView('home') }} />}
      {view === 'libraries' && <Suspense fallback={<div className="loading-section">正在打开词书…</div>}><LibraryView libraries={libraries} words={words} currentLibraryId={currentLibrary?.id} onSelect={async (libraryId) => { await changeSettings({ ...settings, currentLibraryId: libraryId }); setView('home') }} onChanged={refresh} /></Suspense>}
      {view === 'archive' && <Suspense fallback={<div className="loading-section">正在整理记忆纸…</div>}><ArchiveView folders={memoryFolders} papers={memoryPapers} settings={settings} onChanged={refresh} /></Suspense>}
      {view === 'stats' && <Suspense fallback={<div className="loading-section">正在整理统计…</div>}><StatsView sessions={sessions} cards={cards} words={words} library={currentLibrary} onChangeLibrary={() => setView('libraries')} onStartWeak={() => { setSetupInitialMode('weak'); setView('setup') }} onChanged={refresh} /></Suspense>}
      {view === 'settings' && <><SettingsView settings={settings} onSettings={changeSettings} onRestored={refresh} /><PersonalizationPanel settings={settings} onSettings={changeSettings} /></>}
      {!settings.onboardingDone && <Onboarding onDone={() => changeSettings({ ...settings, onboardingDone: true })} />}
    </Shell>
    {backupReminder && <div className="modal-backdrop"><section className="modal backup-reminder" role="dialog" aria-modal="true"><p className="eyebrow">保护学习记录</p><h2>第一轮已经完成</h2><p>学习记录只保存在当前浏览器。清理浏览器数据或更换手机会导致记录丢失，建议现在导出一份备份。</p><div className="modal-actions"><button className="text-button" onClick={async () => { await changeSettings({ ...settings, backupReminderShown: true }); setBackupReminder(false) }}>稍后</button><button className="primary" onClick={async () => { const lastBackupAt = await exportBackup(); await changeSettings({ ...settings, backupReminderShown: true, lastBackupAt }); setBackupReminder(false) }}><Download size={17} />立即备份</button></div></section></div>}
  </>
}

function PersonalizationPanel({ settings, onSettings }: { settings: AppSettings; onSettings: (settings: AppSettings) => void }) {
  async function toggleReminder() {
    if (!settings.reminderEnabled && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission()
    onSettings({ ...settings, reminderEnabled: !settings.reminderEnabled })
  }
  return <section className="page-content personalization-panel"><div className="panel settings-panel"><div className="section-heading"><div><p className="eyebrow">个性化学习</p><h2>把 A4 方法调成你的节奏</h2></div></div><div className="settings-grid"><label className="setting-row"><span><strong>每词背诵遍数</strong><small>完成这些遍数后进入拼写</small></span><select value={settings.repetitionsPerWord} onChange={(event) => onSettings({ ...settings, repetitionsPerWord: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((count) => <option value={count} key={count}>{count} 遍</option>)}</select></label><label className="setting-row"><span><strong>回忆批次</strong><small>每放置多少词进入一次顺序回忆</small></span><select value={settings.recallBatchSize} onChange={(event) => onSettings({ ...settings, recallBatchSize: Number(event.target.value) })}>{[3, 5, 8, 10].map((count) => <option value={count} key={count}>{count} 词</option>)}</select></label><label className="setting-row"><span><strong>自动朗读</strong><small>进入新单词时自动播放一次</small></span><button className={settings.autoSpeak ? 'sound-toggle active' : 'sound-toggle'} onClick={() => onSettings({ ...settings, autoSpeak: !settings.autoSpeak })} aria-pressed={settings.autoSpeak}>{settings.autoSpeak ? <Volume2 /> : <VolumeX />}{settings.autoSpeak ? '已开启' : '已关闭'}</button></label><label className="setting-row"><span><strong>朗读速度</strong><small>浏览器朗读回退时使用</small></span><input type="range" min="0.6" max="1.3" step="0.05" value={settings.speechRate} onChange={(event) => onSettings({ ...settings, speechRate: Number(event.target.value) })} /></label><label className="setting-row"><span><strong>显示信息</strong><small>学习卡片上显示哪些辅助信息</small></span><span className="setting-checks"><label><input type="checkbox" checked={settings.showPhonetic} onChange={(event) => onSettings({ ...settings, showPhonetic: event.target.checked })} />音标</label><label><input type="checkbox" checked={settings.showPartOfSpeech} onChange={(event) => onSettings({ ...settings, showPartOfSpeech: event.target.checked })} />词性</label><label><input type="checkbox" checked={settings.showMeaning} onChange={(event) => onSettings({ ...settings, showMeaning: event.target.checked })} />释义</label></span></label><label className="setting-row"><span><strong>纸面样式</strong><small>应用到纸面背景</small></span><select value={settings.paperTheme} onChange={(event) => onSettings({ ...settings, paperTheme: event.target.value as AppSettings['paperTheme'] })}><option value="plain">素纸</option><option value="grid">方格</option><option value="ruled">横线</option></select></label><label className="setting-row"><span><strong>未完成计划提醒</strong><small>浏览器支持时请求通知权限；页面打开时显示提醒</small></span><button className={settings.reminderEnabled ? 'sound-toggle active' : 'sound-toggle'} onClick={() => void toggleReminder()}><Bell />{settings.reminderEnabled ? '已开启' : '已关闭'}</button></label><label className="setting-row"><span><strong>提醒时间</strong><small>仅保存为本地偏好，系统通知需浏览器支持</small></span><input type="time" value={settings.reminderTime} onChange={(event) => onSettings({ ...settings, reminderTime: event.target.value })} /></label></div></div></section>
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
      const summary = `备份时间：${new Date(data.exportedAt).toLocaleString('zh-CN')}\n词书：${data.libraries.length} 个\n单词：${data.words.length} 个\n学习记录：${data.sessions.length} 轮\n记忆纸：${data.memoryPapers.filter((paper) => !paper.removed).length} 张\n\n恢复会覆盖当前数据，并先自动下载一份当前数据恢复点。确定继续吗？`
      if (!window.confirm(summary)) return
      await restoreBackup(data)
      await onRestored()
      window.alert('数据已恢复，恢复前的数据也已下载到本机。')
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '恢复失败，当前数据未改变')
    }
  }

  return <div className="page-content"><div className="page-heading"><p className="eyebrow">偏好与数据</p><h1>设置</h1><p>每日计划、学习反馈和本地数据都在这里管理。</p></div><div className="settings-grid"><section className="panel settings-panel"><h2>学习偏好</h2><label className="setting-row"><span><strong>每日新词</strong><small>复习词会自动加入，不占用新词名额</small></span><select value={settings.dailyNewWordTarget} onChange={(event) => onSettings({ ...settings, dailyNewWordTarget: Number(event.target.value) })}>{[6, 12, 15, 18, 21, 30, 45, 60].map((count) => <option value={count} key={count}>{count} 词</option>)}</select></label><label className="setting-row"><span><strong>反馈音效</strong><small>完成记忆、拼写和放置时播放短音效</small></span><button className={settings.soundEffects ? 'sound-toggle active' : 'sound-toggle'} onClick={() => onSettings({ ...settings, soundEffects: !settings.soundEffects })} aria-pressed={settings.soundEffects}>{settings.soundEffects ? <Volume2 /> : <VolumeX />}{settings.soundEffects ? '已开启' : '已关闭'}</button></label><label className="setting-row"><span><strong>朗读口音</strong><small>在线发音失败时回退到浏览器朗读</small></span><select value={settings.accent} onChange={(event) => onSettings({ ...settings, accent: event.target.value as AppSettings['accent'] })}><option value="en-US">美式英语</option><option value="en-GB">英式英语</option></select></label><label className="setting-row"><span><strong>默认放置方式</strong><small>开始学习时仍可以临时修改</small></span><select value={settings.defaultPlacement} onChange={(event) => onSettings({ ...settings, defaultPlacement: event.target.value as PlacementMode })}><option value="manual">手动选位置</option><option value="auto">自动随机</option></select></label><label className="setting-row"><span><strong>纸面字号</strong><small>调整新放置单词的整体大小</small></span><input type="range" min="0.8" max="1.25" step="0.05" value={settings.fontScale} onChange={(event) => onSettings({ ...settings, fontScale: Number(event.target.value) })} /></label><button className="secondary" onClick={() => onSettings({ ...settings, onboardingDone: false })}><Info size={17} />重新查看新手引导</button></section><section className="panel settings-panel"><h2>本地数据</h2><div className="privacy-note"><ShieldCheck /><span><strong>本地优先</strong><small>词书、拼写和学习历史不会上传到服务器。</small></span></div><div className="data-actions"><button className="secondary" onClick={backupNow}><Download size={18} />导出完整备份</button><button className="secondary" onClick={() => restoreRef.current?.click()}><Upload size={18} />从备份恢复</button><input ref={restoreRef} hidden type="file" accept="application/json,.json" onChange={(event) => { void restore(event.target.files?.[0]); event.target.value = '' }} /></div><p className="field-help">{settings.lastBackupAt ? `上次备份：${new Date(settings.lastBackupAt).toLocaleString('zh-CN')}` : '尚未导出过备份。恢复前会自动下载当前数据恢复点。'}</p></section><section className="panel settings-panel"><h2>离线状态</h2><div className={online ? 'connectivity-note online' : 'connectivity-note offline'}>{online ? <Wifi /> : <WifiOff />}<span><strong>{online ? '当前已联网' : '当前处于离线状态'}</strong><small>{offlineReady ? '应用外壳已缓存，可在断网时打开并学习；在线发音仍需要网络。' : '离线缓存尚未接管此页面，请联网刷新一次后再检查。'}</small></span></div><button className="secondary" onClick={() => { setOnline(navigator.onLine); setOfflineReady(Boolean(navigator.serviceWorker?.controller)) }}><RefreshCw size={17} />重新检测</button></section><section className="panel settings-panel"><h2>版本信息</h2><div className="info-line"><Info /><p><strong>A4词忆 0.3.0 本地预览</strong><br />确认界面后再提交和部署。</p></div></section><section className="panel settings-panel full"><h2>关于词书</h2><div className="info-line"><FileUp /><p>内置 14 套正式词书，共 56,678 个词条，覆盖四级、六级、考研、IELTS、TOEFL、GRE、GMAT 和 SAT。词书数据基于 ECDICT，采用 MIT License。</p></div></section></div></div>
}

export default App
