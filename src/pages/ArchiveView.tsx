import { PageBack } from '../components/PageNavigation'
import { goBackPage, goToPage, usePageRoute } from '../lib/navigation'
import { Archive, BookOpen, CalendarDays, Download, FileText, Folder, FolderInput, FolderPlus, Heart, Pencil, Printer, Search, Trash2, Volume2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatPartOfSpeech, MeaningDisplay } from '../components/MeaningDisplay'
import { CompletedDictationPaper } from '../components/CompletedDictationPaper'
import { PaperCanvas } from '../components/PaperCanvas'
import { db } from '../db'
import { defaultFolderId } from '../lib/memoryArchive'
import { playOnlinePronunciation, stopPronunciationAudio } from '../lib/pronunciation'
import { PAGE_HEIGHT, PAGE_WIDTH } from '../lib/study'
import type { AppSettings, MemoryFolder, MemoryPaper, MemoryWordSnapshot, PlacedWord, StoredCard, WordEntry, WordLibrary } from '../types'

interface ArchiveViewProps {
  folders: MemoryFolder[]
  papers: MemoryPaper[]
  libraries: WordLibrary[]
  words: WordEntry[]
  cards: StoredCard[]
  settings: AppSettings
  onChanged: () => Promise<void>
}

type FolderFilter = 'all' | 'favorites' | string

function formatDay(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fallbackSpeak(text: string, accent: AppSettings['accent']) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = accent
  utterance.rate = .82
  const voices = window.speechSynthesis.getVoices()
  utterance.voice = voices.find((voice) => voice.lang === accent) ?? voices.find((voice) => voice.lang.startsWith('en')) ?? null
  window.speechSynthesis.speak(utterance)
}

export function ArchiveView({ folders, papers, libraries, words, cards, settings, onChanged }: ArchiveViewProps) {
  const route = usePageRoute()
  const archiveSection = route.startsWith('archive/words') ? 'words' : 'papers'
  const folderPage = route === 'archive/folders'
  const openPaper = papers.find((paper) => !paper.removed && (route === `archive/paper/${encodeURIComponent(paper.id)}` || route.startsWith(`archive/paper/${encodeURIComponent(paper.id)}/`)))
  const paperRoute = openPaper ? `archive/paper/${encodeURIComponent(openPaper.id)}` : 'archive'
  const selectedWord = openPaper?.words.find((word) => route === `${paperRoute}/word/${encodeURIComponent(word.id)}`)
  const favoriteDetail = words.find((word) => route === `archive/words/${encodeURIComponent(word.id)}`)
  const [listLimit, setListLimit] = useState(40)
  function setSelectedWord(word?: MemoryWordSnapshot) { goToPage(word ? `${paperRoute}/word/${encodeURIComponent(word.id)}` : paperRoute, !word) }

  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all')
  const [currentPage, setCurrentPage] = useState(0)
  const [selectedPaperMethod, setSelectedPaperMethod] = useState<'overview' | 'scatter' | 'match' | 'dictation'>('overview')
  const [paperSearch, setPaperSearch] = useState('')
  const [favoriteWordSearch, setFavoriteWordSearch] = useState('')
  const visiblePapers = useMemo(() => papers.filter((paper) => !paper.removed), [papers])
  const sortedFolders = useMemo(() => [...folders].sort((a, b) => a.kind.localeCompare(b.kind) || a.order - b.order || a.name.localeCompare(b.name, 'zh-CN')), [folders])
  const shownPapers = useMemo(() => visiblePapers.filter((paper) => {
    if (folderFilter === 'all') return true
    if (folderFilter === 'favorites') return paper.favorite
    return paper.folderId === folderFilter
  }).filter((paper) => !paperSearch || `${paper.title} ${paper.libraryName} ${formatDay(paper.completedAt)}`.toLowerCase().includes(paperSearch.toLowerCase())).sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.completedAt.localeCompare(a.completedAt)), [folderFilter, paperSearch, visiblePapers])
  const wordsById = useMemo(() => new Map((openPaper?.words ?? []).map((word) => [word.id, word])), [openPaper])
  const showDictationPaper = Boolean(openPaper?.methodProgress?.dictationCompletedAnswers && (selectedPaperMethod === 'dictation' || (selectedPaperMethod === 'overview' && openPaper.methods?.length === 1 && openPaper.methods[0] === 'dictation')))
  const favoriteWordIds = useMemo(() => new Set(cards.filter((card) => card.favorite).map((card) => card.wordId)), [cards])
  const libraryNames = useMemo(() => new Map(libraries.map((library) => [library.id, library.name])), [libraries])
  const favoriteWords = useMemo(() => {
    const query = favoriteWordSearch.trim().toLowerCase()
    return words.filter((word) => favoriteWordIds.has(word.id) && (!query || `${word.word} ${word.phonetic ?? ''} ${word.partOfSpeech ?? ''} ${word.meaning} ${libraryNames.get(word.libraryId) ?? ''}`.toLowerCase().includes(query))).sort((a, b) => a.word.localeCompare(b.word, 'en'))
  }, [favoriteWordIds, favoriteWordSearch, libraryNames, words])

  useEffect(() => () => {
    stopPronunciationAudio()
    window.speechSynthesis?.cancel()
  }, [])

  useEffect(() => {
    if (folderFilter !== 'all' && folderFilter !== 'favorites' && !folders.some((folder) => folder.id === folderFilter)) setFolderFilter('all')
  }, [folderFilter, folders])

  function speak(word: string) {
    playOnlinePronunciation(word, settings.accent, () => fallbackSpeak(word, settings.accent))
  }

  function inspectWord(item: PlacedWord) {
    const word = wordsById.get(item.wordId)
    if (!word) return
    setSelectedWord(word)
    speak(word.word)
  }

  function viewPaper(paper: MemoryPaper) {
    goToPage(`archive/paper/${encodeURIComponent(paper.id)}`)
    setCurrentPage(0)
    setSelectedPaperMethod('overview')
  }

  async function createFolder() {
    const name = window.prompt('给新文件夹起个名字')?.trim()
    if (!name) return
    if (folders.some((folder) => folder.name === name)) {
      window.alert('已经有同名文件夹了')
      return
    }
    const now = new Date().toISOString()
    await db.memoryFolders.add({ id: crypto.randomUUID(), name, kind: 'custom', order: Date.now(), createdAt: now, updatedAt: now })
    await onChanged()
  }

  async function renameFolder(folder: MemoryFolder) {
    const name = window.prompt('文件夹新名称', folder.name)?.trim()
    if (!name || name === folder.name) return
    if (folders.some((item) => item.id !== folder.id && item.name === name)) {
      window.alert('已经有同名文件夹了')
      return
    }
    await db.memoryFolders.update(folder.id, { name, updatedAt: new Date().toISOString() })
    await onChanged()
  }

  async function deleteFolder(folder: MemoryFolder) {
    if (folder.id === defaultFolderId || folder.kind !== 'custom' || !window.confirm(`删除“${folder.name}”？里面的记忆纸会回到默认文件夹。`)) return
    const affected = visiblePapers.filter((paper) => paper.folderId === folder.id)
    const now = new Date().toISOString()
    await db.transaction('rw', db.memoryFolders, db.memoryPapers, async () => {
      for (const paper of affected) {
        const targetId = defaultFolderId
        if (!(await db.memoryFolders.get(targetId))) {
          await db.memoryFolders.add({ id: targetId, name: '默认文件夹', kind: 'custom', order: 0, createdAt: now, updatedAt: now })
        }
        await db.memoryPapers.update(paper.id, { folderId: targetId, updatedAt: now })
      }
      await db.memoryFolders.delete(folder.id)
    })
    setFolderFilter('all')
    await onChanged()
  }

  async function renamePaper(paper: MemoryPaper) {
    const title = window.prompt('记忆纸新名称', paper.title)?.trim()
    if (!title || title === paper.title) return
    await db.memoryPapers.update(paper.id, { title, updatedAt: new Date().toISOString() })
    await onChanged()
  }

  async function movePaper(paper: MemoryPaper, folderId: string) {
    if (!folderId || folderId === paper.folderId) return
    await db.memoryPapers.update(paper.id, { folderId, updatedAt: new Date().toISOString() })
    await onChanged()
  }

  async function removePaper(paper: MemoryPaper) {
    if (!window.confirm(`从档案中移除“${paper.title}”？学习统计和复习计划不会受影响。`)) return
    await db.memoryPapers.update(paper.id, { removed: true, updatedAt: new Date().toISOString() })
    await onChanged()
  }

  async function toggleFavorite(paper: MemoryPaper) {
    await db.memoryPapers.update(paper.id, { favorite: !paper.favorite, updatedAt: new Date().toISOString() })
    await onChanged()
  }

  async function removeFavoriteWord(wordId: string) {
    await db.cards.update(wordId, { favorite: false })
    await onChanged()
  }

  function exportPaper(paper: MemoryPaper) {
    const words = paper.words.map((word) => {
      const placed = paper.placed.find((item) => item.wordId === word.id)
      if (!placed) return ''
      return `<text x="${placed.x}" y="${placed.y + placed.fontSize}" font-size="${placed.fontSize}" fill="#24342e">${word.word.replace(/[&<>"']/g, (value) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[value] ?? value))}</text>`
    }).join('')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1414" viewBox="0 0 1000 1414"><rect width="100%" height="100%" fill="#fffef9"/>${words}</svg>`
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    link.download = `${paper.title || 'A4记忆纸'}.svg`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 0)
  }

  const selectedFolderName = folderFilter === 'all' ? '全部记忆纸' : folderFilter === 'favorites' ? '我的收藏' : folders.find((folder) => folder.id === folderFilter)?.name ?? '记忆纸'

  return <div className={openPaper ? 'page-content archive-page paper-detail-page' : 'page-content archive-page'}>
    {folderPage && <PageBack fallback="archive" label="返回学习档案" />}
    {favoriteDetail && <PageBack fallback="archive/words" label="返回收藏单词" />}
    {!openPaper && <>
    <div className="page-heading split-heading archive-heading">
      <div><p className="eyebrow">你的本地学习记录</p><h1>{folderPage ? '管理文件夹' : favoriteDetail ? favoriteDetail.word : '学习档案'}</h1><p>集中查看收藏单词和 A4 学习纸，随时重新唤起记忆。</p></div>
      {folderPage && <button className="primary" onClick={createFolder}><FolderPlus size={18} />新建文件夹</button>}
    </div>
    {!folderPage && !favoriteDetail && <div className="archive-tabs" role="group" aria-label="档案分类"><button className={archiveSection === 'papers' ? 'active' : ''} onClick={() => goToPage('archive')}>记忆纸 <small>{visiblePapers.length}</small></button><button className={archiveSection === 'words' ? 'active' : ''} onClick={() => goToPage('archive/words')}>收藏单词 <small>{favoriteWordIds.size}</small></button></div>}
    {favoriteDetail && <section className="panel favorite-detail"><button className="archive-word-title" onClick={() => speak(favoriteDetail.word)}>{favoriteDetail.word}<Volume2 /></button><p className="phonetic">{favoriteDetail.phonetic || '暂无音标'}</p><MeaningDisplay meaning={favoriteDetail.meaning} partOfSpeech={favoriteDetail.partOfSpeech} /><small>{libraryNames.get(favoriteDetail.libraryId)}</small><button className="secondary list-more" onClick={async () => { await removeFavoriteWord(favoriteDetail.id); goToPage('archive/words', true) }}><Heart size={17} />取消收藏</button></section>}
    {!favoriteDetail && <div className={folderPage ? 'folder-management-layout' : archiveSection === 'words' ? 'archive-words-layout' : 'archive-layout'}>
      {archiveSection === 'papers' && <div className="mobile-folder-picker"><label>文件夹<select value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)}><option value="all">全部记忆纸</option><option value="favorites">收藏记忆纸</option>{sortedFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><button className="tool-button" onClick={() => goToPage('archive/folders')}>管理</button></div>}
      {(archiveSection === 'papers' || folderPage) && <>
      <aside className={folderPage ? 'archive-folders folder-management' : 'archive-folders desktop-folders'} aria-label="记忆纸文件夹">
        <p className="archive-folder-label">学习纸</p>
        <button className={archiveSection === 'papers' && folderFilter === 'all' ? 'archive-folder active' : 'archive-folder'} onClick={() => { setFolderFilter('all'); if (folderPage) goToPage('archive') }}><Archive /><span><strong>全部记忆纸</strong><small>{visiblePapers.length} 张</small></span></button>
        <button className={archiveSection === 'papers' && folderFilter === 'favorites' ? 'archive-folder active' : 'archive-folder'} onClick={() => { setFolderFilter('favorites'); if (folderPage) goToPage('archive') }}><Heart /><span><strong>收藏记忆纸</strong><small>{visiblePapers.filter((paper) => paper.favorite).length} 张</small></span></button>
        <p className="archive-folder-label">记忆纸文件夹</p>
        {sortedFolders.map((folder) => <div className={archiveSection === 'papers' && folderFilter === folder.id ? 'archive-folder-row active' : 'archive-folder-row'} key={folder.id}>
          <button className="archive-folder" onClick={() => { setFolderFilter(folder.id); if (folderPage) goToPage('archive') }}>{folder.kind === 'library' ? <BookOpen /> : <Folder />}<span><strong>{folder.name}</strong><small>{visiblePapers.filter((paper) => paper.folderId === folder.id).length} 张</small></span></button>
          <button className="folder-action" onClick={() => renameFolder(folder)} title="重命名文件夹" aria-label={`重命名${folder.name}`}><Pencil /></button>
          {folder.kind === 'custom' && folder.id !== defaultFolderId && <button className="folder-action danger" onClick={() => deleteFolder(folder)} title="删除文件夹" aria-label={`删除${folder.name}`}><Trash2 /></button>}
        </div>)}
        {!folderPage && <button className="tool-button" onClick={() => goToPage('archive/folders')}>管理文件夹</button>}
      </aside></>}
      {!folderPage && (archiveSection === 'papers' ? <section className="archive-content">
        <div className="archive-section-heading"><div><h2>{selectedFolderName}</h2><p>{shownPapers.length ? `共 ${shownPapers.length} 张，收藏的纸会排在前面` : '这里还没有记忆纸'}</p></div><label className="search-box archive-search"><Search size={16} /><input value={paperSearch} onChange={(event) => setPaperSearch(event.target.value)} placeholder="搜索词书、日期或名称" /></label></div>
        {shownPapers.length ? <div className="memory-paper-grid">{shownPapers.slice(0, listLimit).map((paper) => {
          const firstPageWords = paper.placed.filter((item) => item.page === 0)
          const paperWords = new Map(paper.words.map((word) => [word.id, word]))
          const pages = Math.max(1, ...paper.placed.map((item) => item.page + 1))
          return <article className="memory-paper-card" key={paper.id}>
            <button className="memory-paper-preview" onClick={() => viewPaper(paper)} aria-label={`打开${paper.title}`}>
              <div className={`memory-paper-sheet${paper.placed.length ? '' : ' method-paper-preview'}`}>{paper.placed.length ? firstPageWords.map((item) => <span key={item.wordId} style={{ left: `${item.x / PAGE_WIDTH * 100}%`, top: `${item.y / PAGE_HEIGHT * 100}%`, fontSize: `${Math.max(3.2, item.fontSize / PAGE_WIDTH * 100)}cqw` }}>{paperWords.get(item.wordId)?.word}</span>) : <><strong>{(paper.methods ?? ['scatter']).map((method) => method === 'scatter' ? '散点' : method === 'match' ? '连连看' : '折叠默写').join(' → ')}</strong><small>{paper.words.slice(0, 4).map((word) => word.word).join(' · ')}</small></>}</div>
              <span className="paper-page-count">{pages} 页</span>
            </button>
            <div className="memory-paper-meta"><div><strong>{paper.title}</strong><span><CalendarDays />{formatDay(paper.completedAt)} · {paper.words.length} 词</span></div><button className={paper.favorite ? 'paper-favorite active' : 'paper-favorite'} onClick={() => toggleFavorite(paper)} aria-label={paper.favorite ? '取消收藏' : '收藏'} title={paper.favorite ? '取消收藏' : '收藏'}><Heart /></button></div>
            <div className="memory-paper-rates"><span>{paper.mode === 'due' ? '快速复习 · 错词纸' : `${(paper.methods ?? ['scatter']).length > 1 ? '混合流程' : '单方法'} · ${(paper.methods ?? ['scatter']).map((method) => method === 'scatter' ? '散点' : method === 'match' ? '连连看' : '默写').join(' → ')}`}</span><span>待复习 {paper.unmasteredWordIds?.length ?? 0}</span></div>
            <details className="paper-options"><summary aria-label="记忆纸操作">更多操作 ···</summary><div className="memory-paper-actions">
              <button onClick={() => renamePaper(paper)} title="重命名"><Pencil /></button>
              <label title="移动到文件夹"><FolderInput /><select value={paper.folderId} onChange={(event) => movePaper(paper, event.target.value)} aria-label={`移动${paper.title}`}>
                {sortedFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select></label>
              <button className="danger" onClick={() => removePaper(paper)} title="从档案移除"><Trash2 /></button>
            </div></details>
          </article>
        })}</div> : <div className="archive-empty"><FileText /><h3>还没有记忆纸</h3><p>{folderFilter === 'all' ? '完成一轮 A4 单词学习后，记忆纸会自动保存在这里。' : '可以把已有记忆纸移动或收藏到这里。'}</p></div>}
      </section> : <section className="archive-content favorite-words-archive">
        <div className="archive-section-heading"><div><h2>收藏单词</h2><p>{favoriteWordIds.size ? `共收藏 ${favoriteWordIds.size} 个单词，按字母顺序排列` : '学习时点击爱心收藏的单词会出现在这里'}</p></div><label className="search-box archive-search"><Search size={16} /><input value={favoriteWordSearch} onChange={(event) => setFavoriteWordSearch(event.target.value)} placeholder="搜索单词、释义或词书" /></label></div>
        {favoriteWords.length ? <div className="favorite-word-list">{favoriteWords.slice(0, listLimit).map((word) => <article className="favorite-word-row" key={word.id}><button className="favorite-word-title" onClick={() => goToPage(`archive/words/${encodeURIComponent(word.id)}`)} title="查看单词详情"><strong>{word.word}</strong><span>{word.phonetic || '暂无音标'}<Volume2 size={14} /></span></button><div className="favorite-word-meaning"><small>{formatPartOfSpeech(word.partOfSpeech) || '未标注词性'} · {libraryNames.get(word.libraryId) ?? '未知词书'}</small><p>{word.meaning}</p></div><button className="favorite-word-remove" onClick={() => void removeFavoriteWord(word.id)} aria-label={`取消收藏${word.word}`} title="取消收藏"><Heart /></button></article>)}</div> : <div className="archive-empty"><Heart /><h3>{favoriteWordSearch ? '没有匹配的收藏单词' : '还没有收藏单词'}</h3><p>{favoriteWordSearch ? '换一个关键词试试。' : '背单词时点击单词卡片旁的爱心，就能在这里集中查看。'}</p></div>}
      </section>)}
      {!folderPage && (archiveSection === 'papers' ? shownPapers.length : favoriteWords.length) > listLimit && <button className="secondary list-more" onClick={() => setListLimit((count) => count + 40)}>查看更多</button>}
    </div>}</>}
    {openPaper && <div className="archive-detail"><PageBack fallback={selectedWord ? paperRoute : 'archive'} label={selectedWord ? '返回记忆纸' : '返回学习档案'} /><section className="archive-viewer" aria-label={openPaper.title}>
       <header className="archive-viewer-header"><div><small>{openPaper.libraryName}</small><h2>{openPaper.title}</h2></div><div className="archive-viewer-actions"><button className="tool-button" onClick={() => exportPaper(openPaper)}><Download size={16} />导出图片</button><button className="tool-button" onClick={() => window.print()}><Printer size={16} />打印</button></div></header>
      <div className={selectedWord ? 'archive-viewer-body has-word-card' : 'archive-viewer-body'}>
        <div className="archive-method-view">
          {(openPaper.methods?.length ?? 0) > 1 && <nav className="archive-method-tabs" aria-label="学习方法档案">{(['overview', ...openPaper.methods!] as const).map((method) => <button key={method} className={selectedPaperMethod === method ? 'active' : ''} onClick={() => setSelectedPaperMethod(method === 'overview' ? 'overview' : method)}>{method === 'overview' ? '流程总览' : method === 'scatter' ? '随机散点' : method === 'match' ? '词义连连看' : '折叠默写'}</button>)}</nav>}
          {showDictationPaper ? <section className="archive-completed-dictation"><CompletedDictationPaper wordIds={openPaper.words.map((word) => word.id)} wordsById={wordsById} progress={openPaper.methodProgress} /></section> : openPaper.placed.length && ((openPaper.methods?.length ?? 0) < 2 || selectedPaperMethod === 'scatter') ? <PaperCanvas placed={openPaper.placed} words={new Map(openPaper.words.map((word) => [word.id, { word: word.word }]))} currentPage={currentPage} onPageChange={(page) => { setCurrentPage(page); setSelectedWord(undefined) }} onWordClick={inspectWord} onPreview={() => undefined} showSequence highlightedId={selectedWord?.id} onSpeak={speak} mobileExpanded onMobileToggle={() => undefined} showMobileToggle={false} /> : <section className="archive-method-summary"><p className="eyebrow">{selectedPaperMethod === 'overview' ? (openPaper.methods ?? []).map((method) => method === 'scatter' ? '随机散点' : method === 'match' ? '词义连连看' : '折叠默写').join(' → ') : selectedPaperMethod === 'scatter' ? '随机散点' : selectedPaperMethod === 'match' ? '词义连连看' : '折叠默写'}</p><h2>{selectedPaperMethod === 'overview' ? openPaper.words.length : selectedPaperMethod === 'scatter' ? openPaper.placed.length : openPaper.words.length} 个目标词</h2><p>掌握率 {Math.round(openPaper.finalMasteryRate * 100)}% · 待复习 {openPaper.unmasteredWordIds?.length ?? 0} 个</p><div className="archive-method-word-list">{openPaper.words.map((word) => { const unresolved = openPaper.unmasteredWordIds?.includes(word.id); const events = openPaper.methodEvents?.filter((event) => event.wordId === word.id && (selectedPaperMethod === 'overview' || selectedPaperMethod === 'scatter' || event.method === selectedPaperMethod)) ?? []; return <article key={word.id}><strong>{word.word}</strong><span>{word.partOfSpeech ?? ''} {word.meaning}</span><small className={unresolved ? 'unresolved' : ''}>{unresolved ? '待复习' : events.map((event) => event.method === 'match' ? '配对' : event.method === 'dictation' ? '默写' : '回忆').join(' · ') || (selectedPaperMethod === 'scatter' && openPaper.placed.some((item) => item.wordId === word.id) ? '已落纸' : '练习完成')}</small></article> })}</div></section>}
        </div>
        {selectedWord && <aside className="archive-word-card"><button className="icon-button" onClick={() => goBackPage(paperRoute)} aria-label="关闭单词卡片"><X /></button><button className="archive-word-title" onClick={() => speak(selectedWord.word)}><span>{selectedWord.word}</span><Volume2 /></button><p className="phonetic">{selectedWord.phonetic || '暂无音标'}</p><MeaningDisplay meaning={selectedWord.meaning} partOfSpeech={selectedWord.partOfSpeech} /></aside>}
      </div>
    </section></div>}
  </div>
}
