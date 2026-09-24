import { Archive, BookOpen, CalendarDays, Download, FileText, Folder, FolderInput, FolderPlus, Heart, Pencil, Printer, Search, Trash2, Volume2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { MeaningDisplay } from '../components/MeaningDisplay'
import { PaperCanvas } from '../components/PaperCanvas'
import { db } from '../db'
import { defaultFolderId } from '../lib/memoryArchive'
import { playOnlinePronunciation, stopPronunciationAudio } from '../lib/pronunciation'
import { PAGE_HEIGHT, PAGE_WIDTH } from '../lib/study'
import type { AppSettings, MemoryFolder, MemoryPaper, MemoryWordSnapshot, PlacedWord } from '../types'

interface ArchiveViewProps {
  folders: MemoryFolder[]
  papers: MemoryPaper[]
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

export function ArchiveView({ folders, papers, settings, onChanged }: ArchiveViewProps) {
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all')
  const [openPaper, setOpenPaper] = useState<MemoryPaper>()
  const [currentPage, setCurrentPage] = useState(0)
  const [selectedWord, setSelectedWord] = useState<MemoryWordSnapshot>()
  const [paperSearch, setPaperSearch] = useState('')
  const visiblePapers = useMemo(() => papers.filter((paper) => !paper.removed), [papers])
  const sortedFolders = useMemo(() => [...folders].sort((a, b) => a.kind.localeCompare(b.kind) || a.order - b.order || a.name.localeCompare(b.name, 'zh-CN')), [folders])
  const shownPapers = useMemo(() => visiblePapers.filter((paper) => {
    if (folderFilter === 'all') return true
    if (folderFilter === 'favorites') return paper.favorite
    return paper.folderId === folderFilter
  }).filter((paper) => !paperSearch || `${paper.title} ${paper.libraryName} ${formatDay(paper.completedAt)}`.toLowerCase().includes(paperSearch.toLowerCase())).sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.completedAt.localeCompare(a.completedAt)), [folderFilter, paperSearch, visiblePapers])
  const wordsById = useMemo(() => new Map((openPaper?.words ?? []).map((word) => [word.id, word])), [openPaper])

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
    setOpenPaper(paper)
    setCurrentPage(0)
    setSelectedWord(undefined)
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

  return <div className="page-content archive-page">
    <div className="page-heading split-heading archive-heading">
      <div><p className="eyebrow">学习留下的纸</p><h1>记忆纸档案</h1><p>翻看过去的 A4 纸，按当时的位置重新唤起单词记忆。</p></div>
      <button className="primary" onClick={createFolder}><FolderPlus size={18} />新建文件夹</button>
    </div>
    <div className="archive-layout">
      <aside className="archive-folders" aria-label="记忆纸文件夹">
        <button className={folderFilter === 'all' ? 'archive-folder active' : 'archive-folder'} onClick={() => setFolderFilter('all')}><Archive /><span><strong>全部记忆纸</strong><small>{visiblePapers.length} 张</small></span></button>
        <button className={folderFilter === 'favorites' ? 'archive-folder active' : 'archive-folder'} onClick={() => setFolderFilter('favorites')}><Heart /><span><strong>我的收藏</strong><small>{visiblePapers.filter((paper) => paper.favorite).length} 张</small></span></button>
        <p className="archive-folder-label">文件夹</p>
        {sortedFolders.map((folder) => <div className={folderFilter === folder.id ? 'archive-folder-row active' : 'archive-folder-row'} key={folder.id}>
          <button className="archive-folder" onClick={() => setFolderFilter(folder.id)}>{folder.kind === 'library' ? <BookOpen /> : <Folder />}<span><strong>{folder.name}</strong><small>{visiblePapers.filter((paper) => paper.folderId === folder.id).length} 张</small></span></button>
          <button className="folder-action" onClick={() => renameFolder(folder)} title="重命名文件夹" aria-label={`重命名${folder.name}`}><Pencil /></button>
          {folder.kind === 'custom' && folder.id !== defaultFolderId && <button className="folder-action danger" onClick={() => deleteFolder(folder)} title="删除文件夹" aria-label={`删除${folder.name}`}><Trash2 /></button>}
        </div>)}
      </aside>
      <section className="archive-content">
        <div className="archive-section-heading"><div><h2>{selectedFolderName}</h2><p>{shownPapers.length ? `共 ${shownPapers.length} 张，收藏的纸会排在前面` : '这里还没有记忆纸'}</p></div><label className="search-box archive-search"><Search size={16} /><input value={paperSearch} onChange={(event) => setPaperSearch(event.target.value)} placeholder="搜索词书、日期或名称" /></label></div>
        {shownPapers.length ? <div className="memory-paper-grid">{shownPapers.map((paper) => {
          const firstPageWords = paper.placed.filter((item) => item.page === 0)
          const paperWords = new Map(paper.words.map((word) => [word.id, word]))
          const pages = Math.max(1, ...paper.placed.map((item) => item.page + 1))
          return <article className="memory-paper-card" key={paper.id}>
            <button className="memory-paper-preview" onClick={() => viewPaper(paper)} aria-label={`打开${paper.title}`}>
              <div className="memory-paper-sheet">{firstPageWords.map((item) => <span key={item.wordId} style={{ left: `${item.x / PAGE_WIDTH * 100}%`, top: `${item.y / PAGE_HEIGHT * 100}%`, fontSize: `${Math.max(3.2, item.fontSize / PAGE_WIDTH * 100)}cqw` }}>{paperWords.get(item.wordId)?.word}</span>)}</div>
              <span className="paper-page-count">{pages} 页</span>
            </button>
            <div className="memory-paper-meta"><div><strong>{paper.title}</strong><span><CalendarDays />{formatDay(paper.completedAt)} · {paper.words.length} 词</span></div><button className={paper.favorite ? 'paper-favorite active' : 'paper-favorite'} onClick={() => toggleFavorite(paper)} aria-label={paper.favorite ? '取消收藏' : '收藏'} title={paper.favorite ? '取消收藏' : '收藏'}><Heart /></button></div>
            <div className="memory-paper-rates"><span>首轮 {Math.round(paper.firstRecallRate * 100)}%</span><span>掌握 {Math.round(paper.finalMasteryRate * 100)}%</span></div>
            <div className="memory-paper-actions">
              <button onClick={() => renamePaper(paper)} title="重命名"><Pencil /></button>
              <label title="移动到文件夹"><FolderInput /><select value={paper.folderId} onChange={(event) => movePaper(paper, event.target.value)} aria-label={`移动${paper.title}`}>
                {sortedFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select></label>
              <button className="danger" onClick={() => removePaper(paper)} title="从档案移除"><Trash2 /></button>
            </div>
          </article>
        })}</div> : <div className="archive-empty"><FileText /><h3>还没有记忆纸</h3><p>{folderFilter === 'all' ? '完成一轮 A4 单词学习后，记忆纸会自动保存在这里。' : '可以把已有记忆纸移动或收藏到这里。'}</p></div>}
      </section>
    </div>
    {openPaper && <div className="modal-backdrop archive-viewer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpenPaper(undefined) }}><section className="archive-viewer" role="dialog" aria-modal="true" aria-label={openPaper.title}>
       <header className="archive-viewer-header"><div><small>{openPaper.libraryName}</small><h2>{openPaper.title}</h2></div><div className="archive-viewer-actions"><button className="tool-button" onClick={() => exportPaper(openPaper)}><Download size={16} />导出图片</button><button className="tool-button" onClick={() => window.print()}><Printer size={16} />打印</button><button className="icon-button" onClick={() => setOpenPaper(undefined)} aria-label="关闭记忆纸"><X /></button></div></header>
      <div className={selectedWord ? 'archive-viewer-body has-word-card' : 'archive-viewer-body'}>
        <PaperCanvas placed={openPaper.placed} words={new Map(openPaper.words.map((word) => [word.id, { word: word.word }]))} currentPage={currentPage} onPageChange={(page) => { setCurrentPage(page); setSelectedWord(undefined) }} onWordClick={inspectWord} onPreview={() => undefined} showSequence highlightedId={selectedWord?.id} onSpeak={speak} mobileExpanded onMobileToggle={() => undefined} showMobileToggle={false} />
        {selectedWord && <aside className="archive-word-card"><button className="icon-button" onClick={() => setSelectedWord(undefined)} aria-label="关闭单词卡片"><X /></button><button className="archive-word-title" onClick={() => speak(selectedWord.word)}><span>{selectedWord.word}</span><Volume2 /></button><p className="phonetic">{selectedWord.phonetic || '暂无音标'}</p><MeaningDisplay meaning={selectedWord.meaning} partOfSpeech={selectedWord.partOfSpeech} /></aside>}
      </div>
    </section></div>}
  </div>
}
