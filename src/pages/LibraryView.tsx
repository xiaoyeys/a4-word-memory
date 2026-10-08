import { PageBack, PageLink } from '../components/PageNavigation'
import { goToPage, usePageRoute } from '../lib/navigation'
import { CheckCircle2, FileUp, LibraryBig, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { enrichImportRecords, findReferenceWord, parseImportFile, parsePastedText, validateImport, type ImportCandidate } from '../lib/importer'
import { normalizeWord } from '../lib/study'
import { formatPartOfSpeech } from '../components/MeaningDisplay'
import type { WordEntry, WordLibrary } from '../types'

interface LibraryViewProps {
  libraries: WordLibrary[]
  words: WordEntry[]
  currentLibraryId?: string
  loadingLibraryId?: string
  onPreview: (libraryId: string) => Promise<void>
  onSelect: (libraryId: string) => Promise<void>
  onChanged: () => Promise<void>
}

const categories = ['全部', '小学', '中考', '高考', '四级', '六级', '考研', 'IELTS', 'TOEFL', '其他', '自定义'] as const

function libraryCategory(library: WordLibrary) {
  if (library.kind === 'custom') return '自定义'
  if (library.name.includes('小学')) return '小学'
  if (library.name.includes('中考')) return '中考'
  if (library.name.includes('高考')) return '高考'
  if (library.name.includes('CET-4')) return '四级'
  if (library.name.includes('CET-6')) return '六级'
  if (library.name.includes('考研')) return '考研'
  if (library.name.includes('IELTS')) return 'IELTS'
  if (library.name.includes('TOEFL')) return 'TOEFL'
  return '其他'
}

export function LibraryView({ libraries, words, currentLibraryId, loadingLibraryId, onPreview, onSelect, onChanged }: LibraryViewProps) {
  const route = usePageRoute()
  const base = route.startsWith('setup/') ? 'setup/books' : 'libraries'
  const section = route.slice(base.length + 1)
  const selectedId = section.startsWith('detail/') ? libraries.find((library) => encodeURIComponent(library.id) === section.split('/')[1])?.id : undefined
  const showImport = section === 'import'
  const detailRoute = `${base}/detail/${encodeURIComponent(selectedId ?? '')}`
  const [wordLimit, setWordLimit] = useState(50)
  const [search, setSearch] = useState('')
  const [bookSearch, setBookSearch] = useState('')
  const [category, setCategory] = useState<(typeof categories)[number]>('全部')
  const [libraryName, setLibraryName] = useState('我的词库')
  const [pasted, setPasted] = useState('')
  const [preview, setPreview] = useState<ImportCandidate[]>([])
  const [rawRecords, setRawRecords] = useState<Record<string, unknown>[]>([])
  const [mapping, setMapping] = useState({ word: '', phonetic: '', partOfSpeech: '', meaning: '' })
  const [editing, setEditing] = useState<WordEntry>()
  const selected = libraries.find((library) => library.id === selectedId)
  useEffect(() => {
    if (selected?.kind === 'builtin' && !words.some((word) => word.libraryId === selected.id)) void onPreview(selected.id)
  }, [selectedId])
  const visibleWords = useMemo(() => words.filter((word) => word.libraryId === selected?.id && (!search || `${word.word} ${word.meaning}`.toLowerCase().includes(search.toLowerCase()))), [words, selected?.id, search])
  const builtinIds = useMemo(() => new Set(libraries.filter((library) => library.kind === 'builtin').map((library) => library.id)), [libraries])
  const referenceWords = useMemo(() => words.filter((word) => builtinIds.has(word.libraryId)), [words, builtinIds])
  const visibleLibraries = libraries.filter((library) => (section === 'custom' ? library.kind === 'custom' : category === '全部' || libraryCategory(library) === category) && (!bookSearch || library.name.toLowerCase().includes(bookSearch.toLowerCase())))

  function buildPreview(records: Record<string, unknown>[]) {
    setRawRecords(records)
    setPreview(validateImport(enrichImportRecords(records, referenceWords), []))
  }

  function applyMapping() {
    if (!mapping.word || !mapping.meaning) return
    const remapped = rawRecords.map((record) => ({
      word: record[mapping.word],
      phonetic: mapping.phonetic ? record[mapping.phonetic] : '',
      partOfSpeech: mapping.partOfSpeech ? record[mapping.partOfSpeech] : '',
      meaning: record[mapping.meaning],
    }))
    setPreview(validateImport(enrichImportRecords(remapped, referenceWords), []))
  }

  async function importFile(file?: File) {
    if (!file) return
    try {
      buildPreview(await parseImportFile(file))
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '无法读取文件')
    }
  }

  async function confirmImport() {
    const valid = preview.filter((row) => row.status === 'valid')
    if (!valid.length) return
    if (valid.length > 20000) {
      window.alert(`当前有 ${valid.length} 个有效词条，单个词库最多支持 20,000 个，请拆分后再导入。`)
      return
    }
    const id = `custom-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const library: WordLibrary = { id, name: libraryName.trim() || '我的词库', description: '用户导入词库', kind: 'custom', version: 1, wordCount: valid.length, createdAt: now, updatedAt: now }
    const entries: WordEntry[] = valid.map((row) => ({ id: `${id}-${crypto.randomUUID()}`, libraryId: id, word: row.word, normalizedWord: row.word.trim().toLowerCase(), phonetic: row.phonetic, partOfSpeech: row.partOfSpeech, meaning: row.meaning, createdAt: now }))
    await db.transaction('rw', db.libraries, db.words, async () => { await db.libraries.add(library); await db.words.bulkAdd(entries) })
    setPreview([]); setPasted('')
    await onChanged()
    goToPage(`${base}/detail/${encodeURIComponent(id)}`, true)
  }

  async function saveWord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || !selected) return
    const data = new FormData(event.currentTarget)
    const word = String(data.get('word') ?? '').trim()
    const reference = findReferenceWord(word, referenceWords)
    const meaning = String(data.get('meaning') ?? '').trim() || reference?.meaning || ''
    if (!word) return
    if (!meaning) {
      window.alert(`内置词库中没有匹配到“${word}”，请手动填写中文释义。`)
      return
    }
    const normalizedWord = normalizeWord(word)
    const duplicate = await db.words.where('[libraryId+normalizedWord]').equals([selected.id, normalizedWord]).first()
    if (duplicate && duplicate.id !== editing.id) {
      window.alert(`“${word}”已经在这个词库中。`)
      return
    }
    const isNew = !editing.id
    const next = { ...editing, id: editing.id || `${selected.id}-${crypto.randomUUID()}`, word, normalizedWord, phonetic: String(data.get('phonetic') ?? '').trim() || reference?.phonetic || '', partOfSpeech: String(data.get('pos') ?? '').trim() || reference?.partOfSpeech || '', meaning }
    await db.words.put(next)
    if (isNew) {
      await db.libraries.update(selected.id, { wordCount: selected.wordCount + 1, updatedAt: new Date().toISOString() })
    }
    setEditing(undefined); await onChanged(); goToPage(detailRoute, true)
  }

  async function deleteWord(word: WordEntry) {
    if (!selected || !window.confirm(`确定删除“${word.word}”吗？`)) return
    const active = await db.sessions.where('status').equals('active').filter((session) => session.wordIds.includes(word.id)).first()
    if (active) {
      window.alert('这个单词正在当前学习轮次中，请先完成或放弃该轮学习。')
      return
    }
    await db.transaction('rw', db.words, db.cards, db.libraries, async () => {
      await db.words.delete(word.id)
      await db.cards.delete(word.id)
      await db.libraries.update(selected.id, { wordCount: Math.max(0, selected.wordCount - 1), updatedAt: new Date().toISOString() })
    })
    await onChanged()
  }

  async function deleteLibrary() {
    if (!selected || selected.kind !== 'custom' || !window.confirm(`确定删除词库“${selected.name}”及其中全部单词吗？`)) return
    await db.transaction('rw', db.libraries, db.words, db.cards, db.sessions, async () => {
      const ids = (await db.words.where('libraryId').equals(selected.id).primaryKeys()) as string[]
      await db.cards.bulkDelete(ids); await db.sessions.where('libraryId').equals(selected.id).delete(); await db.words.where('libraryId').equals(selected.id).delete(); await db.libraries.delete(selected.id)
    })
    await onChanged(); goToPage(`${base}/custom`, true)
  }

  async function renameLibrary() {
    if (!selected || selected.kind !== 'custom') return
    const name = window.prompt('输入新的词库名称', selected.name)?.trim()
    if (!name || name === selected.name) return
    await db.libraries.update(selected.id, { name, updatedAt: new Date().toISOString() })
    await onChanged()
  }

  function chooseCategory(nextCategory: (typeof categories)[number]) {
    setCategory(nextCategory)

  }

  const importColumns = rawRecords[0] ? Object.keys(rawRecords[0]) : []
  const needsMapping = importColumns.length > 0 && !preview.some((row) => row.status === 'valid')


  async function openDetail(library: WordLibrary) {
    goToPage(`${base}/detail/${encodeURIComponent(library.id)}`)
    setSearch('')
    setWordLimit(50)
  }
  function editWord(word: WordEntry) {
    setEditing(word)
    goToPage(`${detailRoute}/edit`)
  }

  return <div className="page-content book-picker-page">
    <PageBack fallback={section === 'import' ? `${base}/custom` : section.endsWith('/edit') ? detailRoute : section ? base : 'setup'} label={section ? '返回词书列表' : '返回调整计划'} />
    <div className="page-heading"><p className="eyebrow">调整计划 · 词书</p><h1>{showImport ? '导入自定义词书' : section.endsWith('/edit') ? '编辑词条' : selected ? selected.name : section === 'custom' ? '自定义词库管理' : '选择计划词书'}</h1><p>{selected ? `${selected.wordCount} 词 · ${selected.description}` : showImport ? '输入英文单词或选择文件，预览后再导入。' : '预览不改变计划，选用后返回计划草稿。'}</p></div>
    {(!section || section === 'custom') && <>
      <div className="page-menu book-management-links">{section === 'custom' ? <PageLink to={`${base}/import`} title="导入新词库" description="TXT、CSV、Excel、JSON 或粘贴英文清单" icon={<FileUp />} /> : <PageLink to={`${base}/custom`} title="自定义词库管理" description="导入、编辑与整理自己的词库" icon={<LibraryBig />} />}</div>
      <section className="book-picker-tools"><label className="search-box"><Search size={17} /><input value={bookSearch} onChange={(event) => setBookSearch(event.target.value)} placeholder="搜索词书" /></label>{section !== 'custom' && <div className="book-categories">{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => chooseCategory(item)}>{item}</button>)}</div>}</section>
      <section className="book-grid">{visibleLibraries.map((library) => {
        const active = library.id === currentLibraryId
        const downloaded = library.kind === 'custom' || words.some((word) => word.libraryId === library.id)
        return <article key={library.id} className={active ? 'book-option active' : 'book-option'}>
          <button className="book-option-preview" disabled={Boolean(loadingLibraryId)} onClick={() => void openDetail(library)} aria-label={`预览${library.name}`}><span className={`book-cover small-cover category-${libraryCategory(library).toLowerCase()}`}><span>{library.name.split(' ')[0]}</span><small>{library.kind === 'custom' ? '自定义词书' : library.name.split(' ').slice(1).join(' ')}</small></span><span className="book-option-copy"><strong>{library.name}</strong><small>{library.wordCount} 词 · {downloaded ? '已保存到本机' : '按需加载'}</small></span></button>
          <button className="book-select-action" disabled={Boolean(loadingLibraryId)} onClick={() => void onSelect(library.id)}>{active ? <><CheckCircle2 size={15} />已选</> : '选用'}</button>
        </article>
      })}{!visibleLibraries.length && <div className="empty-state compact">没有匹配的词书</div>}</section>
    </>}
    {selected && !section.endsWith('/edit') && <section className="library-detail panel">
      <div className="section-heading"><h2>单词预览</h2><button className="primary" disabled={Boolean(loadingLibraryId)} onClick={() => void onSelect(selected.id)}>选用这本词书</button></div>
      {selected.kind === 'custom' && <div className="row-actions library-edit-actions"><button className="tool-button" onClick={renameLibrary}><Pencil size={16} />重命名</button><button className="tool-button" onClick={() => editWord({ id: '', libraryId: selected.id, word: '', normalizedWord: '', meaning: '', createdAt: new Date().toISOString() })}><Plus size={16} />添加词条</button><button className="tool-button danger" onClick={deleteLibrary}><Trash2 size={16} />删除词库</button></div>}
      <label className="search-box list-search"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setWordLimit(50) }} placeholder="搜索单词或释义" /></label>
      <div className="word-table"><div className="word-row table-head"><span>单词</span><span>词性与释义</span><span></span></div>{visibleWords.slice(0, wordLimit).map((word) => <div className="word-row" key={word.id}><span><strong>{word.word}</strong><small>{word.phonetic}</small></span><span><small>{formatPartOfSpeech(word.partOfSpeech)}</small>{word.meaning}</span><span>{selected.kind === 'custom' && <><button className="icon-button" onClick={() => editWord(word)} aria-label={`编辑${word.word}`}><Pencil /></button><button className="icon-button danger" onClick={() => deleteWord(word)} aria-label={`删除${word.word}`}><Trash2 /></button></>}</span></div>)}{!visibleWords.length && <div className="empty-state compact">{loadingLibraryId ? '正在加载单词…' : '没有匹配的单词'}</div>}</div>
      {visibleWords.length > wordLimit && <button className="secondary list-more" onClick={() => setWordLimit((count) => count + 50)}>查看更多单词</button>}
    </section>}
    {showImport && <section className="panel import-page-form"><p className="eyebrow">新建自定义词库</p><h2>导入单词清单</h2>
      <label className="field"><span>词库名称</span><input value={libraryName} onChange={(event) => setLibraryName(event.target.value)} /></label>
      <div className="import-source"><label className="upload-zone"><FileUp /><strong>选择 TXT、CSV、XLSX 或 JSON</strong><input type="file" accept=".txt,.csv,.xlsx,.json" onChange={(event) => importFile(event.target.files?.[0])} /></label><span>或</span><textarea value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder={'每行只写一个英文单词即可自动匹配，例如：\nmaintain\nbenefit\naccurate\n\n也支持：maintain | /meɪnˈteɪn/ | v. | 维持；保养'} /><button className="secondary" onClick={() => buildPreview(parsePastedText(pasted))} disabled={!pasted.trim()}>匹配并预览</button></div>
      {needsMapping && <div className="column-mapping"><p><strong>没有识别出字段，请手动对应列</strong></p><div className="mapping-grid">{([['word', '单词 *'], ['meaning', '释义 *'], ['phonetic', '音标'], ['partOfSpeech', '词性']] as const).map(([field, label]) => <label key={field}><span>{label}</span><select value={mapping[field]} onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}><option value="">不选择</option>{importColumns.map((column) => <option value={column} key={column}>{column}</option>)}</select></label>)}</div><button className="secondary wide" disabled={!mapping.word || !mapping.meaning} onClick={applyMapping}>应用字段对应</button></div>}
      {preview.length > 0 && <div className="import-preview"><div className="preview-summary"><span className="valid">可导入 {preview.filter((r) => r.status === 'valid').length}</span><span>已自动匹配 {preview.filter((r) => r.matchedFromBuiltin).length}</span><span>重复 {preview.filter((r) => r.status === 'duplicate').length}</span><span className="invalid">错误 {preview.filter((r) => r.status === 'invalid').length}</span></div>{preview.slice(0, 8).map((row) => <div key={row.row} className={`preview-row ${row.status}`}><span>{row.row}</span><strong>{row.word || '空白'}</strong><span>{row.meaning || row.issue}{row.matchedFromBuiltin ? ' · 内置词库匹配' : ''}</span></div>)}{preview.filter((row) => row.status === 'valid').length > 20000 && <p className="validation">单个词库最多支持 20,000 个有效词条，请拆分后导入。</p>}<button className="primary wide" onClick={confirmImport} disabled={!preview.some((row) => row.status === 'valid') || preview.filter((row) => row.status === 'valid').length > 20000}>确认导入</button></div>}
    </section>}
    {section.endsWith('/edit') && editing && <form className="panel edit-word-modal" onSubmit={saveWord}><p className="eyebrow">{editing.id ? '编辑词条' : '新增词条'}</p><h2>词条信息</h2><label className="field"><span>单词 *</span><input name="word" defaultValue={editing.word} required /></label><p className="field-help">新增时只填写英文也可以；保存时会自动从内置词库匹配音标、词性和释义。</p><div className="form-grid"><label className="field"><span>音标</span><input name="phonetic" defaultValue={editing.phonetic} /></label><label className="field"><span>词性</span><input name="pos" defaultValue={editing.partOfSpeech} /></label></div><label className="field"><span>中文释义</span><textarea name="meaning" defaultValue={editing.meaning} /></label><button className="primary wide">保存词条</button></form>}
    {section.endsWith('/edit') && !editing && <div className="empty-state compact">请从词条列表打开编辑。</div>}
  </div>
}
