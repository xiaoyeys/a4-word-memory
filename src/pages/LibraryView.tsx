import { CheckCircle2, FileUp, LibraryBig, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { db } from '../db'
import { enrichImportRecords, findReferenceWord, parseImportFile, parsePastedText, validateImport, type ImportCandidate } from '../lib/importer'
import { normalizeWord } from '../lib/study'
import { formatPartOfSpeech } from '../components/MeaningDisplay'
import type { WordEntry, WordLibrary } from '../types'

interface LibraryViewProps {
  libraries: WordLibrary[]
  words: WordEntry[]
  currentLibraryId?: string
  onSelect: (libraryId: string) => Promise<void>
  onChanged: () => Promise<void>
}

const categories = ['全部', '四级', '六级', '考研', 'IELTS', 'TOEFL', '其他', '自定义'] as const

function libraryCategory(library: WordLibrary) {
  if (library.kind === 'custom') return '自定义'
  if (library.name.includes('CET-4')) return '四级'
  if (library.name.includes('CET-6')) return '六级'
  if (library.name.includes('考研')) return '考研'
  if (library.name.includes('IELTS')) return 'IELTS'
  if (library.name.includes('TOEFL')) return 'TOEFL'
  return '其他'
}

export function LibraryView({ libraries, words, currentLibraryId, onSelect, onChanged }: LibraryViewProps) {
  const [selectedId, setSelectedId] = useState(currentLibraryId ?? libraries[0]?.id)
  const [search, setSearch] = useState('')
  const [bookSearch, setBookSearch] = useState('')
  const [category, setCategory] = useState<(typeof categories)[number]>('全部')
  const [showImport, setShowImport] = useState(false)
  const [libraryName, setLibraryName] = useState('我的词库')
  const [pasted, setPasted] = useState('')
  const [preview, setPreview] = useState<ImportCandidate[]>([])
  const [rawRecords, setRawRecords] = useState<Record<string, unknown>[]>([])
  const [mapping, setMapping] = useState({ word: '', phonetic: '', partOfSpeech: '', meaning: '' })
  const [editing, setEditing] = useState<WordEntry>()
  const selected = libraries.find((library) => library.id === selectedId) ?? libraries[0]
  const visibleWords = useMemo(() => words.filter((word) => word.libraryId === selected?.id && (!search || `${word.word} ${word.meaning}`.toLowerCase().includes(search.toLowerCase()))), [words, selected?.id, search])
  const builtinIds = useMemo(() => new Set(libraries.filter((library) => library.kind === 'builtin').map((library) => library.id)), [libraries])
  const referenceWords = useMemo(() => words.filter((word) => builtinIds.has(word.libraryId)), [words, builtinIds])
  const visibleLibraries = libraries.filter((library) => (category === '全部' || libraryCategory(library) === category) && (!bookSearch || library.name.toLowerCase().includes(bookSearch.toLowerCase())))

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
    setShowImport(false); setPreview([]); setPasted(''); setSelectedId(id)
    await onChanged()
    await onSelect(id)
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
    setEditing(undefined); await onChanged()
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
    setSelectedId(libraries.find((item) => item.id !== selected.id)?.id ?? ''); await onChanged()
  }

  async function renameLibrary() {
    if (!selected || selected.kind !== 'custom') return
    const name = window.prompt('输入新的词库名称', selected.name)?.trim()
    if (!name || name === selected.name) return
    await db.libraries.update(selected.id, { name, updatedAt: new Date().toISOString() })
    await onChanged()
  }

  const importColumns = rawRecords[0] ? Object.keys(rawRecords[0]) : []
  const needsMapping = importColumns.length > 0 && !preview.some((row) => row.status === 'valid')

  return <div className="page-content book-picker-page">
    <div className="page-heading split-heading">
      <div><p className="eyebrow">当前只专注一本</p><h1>更换词书</h1><p>选择后，首页计划和统计都会切换到这本词书。</p></div>
      <button className="secondary" onClick={() => setShowImport(true)}><FileUp size={18} />导入自定义词书</button>
    </div>
    <section className="book-picker-tools"><label className="search-box"><Search size={17} /><input value={bookSearch} onChange={(event) => setBookSearch(event.target.value)} placeholder="搜索词书" /></label><div className="book-categories">{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}</button>)}</div></section>
    <section className="book-grid">{visibleLibraries.map((library) => {
      const active = library.id === currentLibraryId
      return <button key={library.id} className={active ? 'book-option active' : 'book-option'} onClick={() => void onSelect(library.id)}><span className={`book-cover small-cover category-${libraryCategory(library).toLowerCase()}`}><span>{library.name.split(' ')[0]}</span><small>{library.kind === 'custom' ? '我的词书' : library.name.split(' ').slice(1).join(' ')}</small></span><span className="book-option-copy"><strong>{library.name}</strong><small>{library.wordCount} 词 · {library.kind === 'builtin' ? '内置词书' : '自定义词书'}</small></span>{active && <CheckCircle2 />}</button>
    })}{!visibleLibraries.length && <div className="empty-state compact">没有匹配的词书</div>}</section>
    <div className="library-manage-heading"><div><span className="section-kicker"><LibraryBig size={16} />词条预览与管理</span><h2>{selected?.name}</h2></div>{currentLibraryId !== selected?.id && selected && <button className="secondary" onClick={() => void onSelect(selected.id)}>设为当前词书</button>}</div>
    <div className="library-layout">
      <aside className="library-list">
        {libraries.map((library) => <button key={library.id} className={selected?.id === library.id ? 'library-tab active' : 'library-tab'} onClick={() => setSelectedId(library.id)}>
          <span>{library.name}</span><small>{library.wordCount}词 · {library.kind === 'builtin' ? '内置' : '自定义'}</small>
        </button>)}
      </aside>
      {selected && <section className="library-detail">
        <div className="section-heading">
          <div><h2>{selected.name}</h2><p>{selected.description}</p></div>
          {selected.kind === 'custom' && <div className="row-actions"><button className="tool-button" onClick={renameLibrary}><Pencil size={16} />重命名</button><button className="tool-button" onClick={() => setEditing({ id: '', libraryId: selected.id, word: '', normalizedWord: '', meaning: '', createdAt: new Date().toISOString() })}><Plus size={16} />添加</button><button className="icon-button danger" onClick={deleteLibrary} aria-label="删除词库"><Trash2 /></button></div>}
        </div>
        <label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索单词或释义" /></label>
        <div className="word-table">
          <div className="word-row table-head"><span>单词</span><span>词性与释义</span><span></span></div>
          {visibleWords.slice(0, 300).map((word) => <div className="word-row" key={word.id}><span><strong>{word.word}</strong><small>{word.phonetic}</small></span><span><small>{formatPartOfSpeech(word.partOfSpeech)}</small>{word.meaning}</span><span>{selected.kind === 'custom' && <><button className="icon-button" onClick={() => setEditing(word)} aria-label="编辑"><Pencil /></button><button className="icon-button danger" onClick={() => deleteWord(word)} aria-label="删除"><Trash2 /></button></>}</span></div>)}
          {!visibleWords.length && <div className="empty-state compact">没有匹配的单词</div>}
        </div>
      </section>}
    </div>

    {showImport && <div className="modal-backdrop"><section className="modal import-modal" role="dialog" aria-modal="true"><button className="icon-button modal-close" onClick={() => setShowImport(false)} aria-label="关闭导入词库"><X /></button><p className="eyebrow">新建自定义词库</p><h2>导入单词清单</h2>
      <label className="field"><span>词库名称</span><input value={libraryName} onChange={(event) => setLibraryName(event.target.value)} /></label>
      <div className="import-source"><label className="upload-zone"><FileUp /><strong>选择 TXT、CSV、XLSX 或 JSON</strong><input type="file" accept=".txt,.csv,.xlsx,.json" onChange={(event) => importFile(event.target.files?.[0])} /></label><span>或</span><textarea value={pasted} onChange={(event) => setPasted(event.target.value)} placeholder={'每行只写一个英文单词即可自动匹配，例如：\nmaintain\nbenefit\naccurate\n\n也支持：maintain | /meɪnˈteɪn/ | v. | 维持；保养'} /><button className="secondary" onClick={() => buildPreview(parsePastedText(pasted))} disabled={!pasted.trim()}>匹配并预览</button></div>
      {needsMapping && <div className="column-mapping"><p><strong>没有识别出字段，请手动对应列</strong></p><div className="mapping-grid">{([['word', '单词 *'], ['meaning', '释义 *'], ['phonetic', '音标'], ['partOfSpeech', '词性']] as const).map(([field, label]) => <label key={field}><span>{label}</span><select value={mapping[field]} onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}><option value="">不选择</option>{importColumns.map((column) => <option value={column} key={column}>{column}</option>)}</select></label>)}</div><button className="secondary wide" disabled={!mapping.word || !mapping.meaning} onClick={applyMapping}>应用字段对应</button></div>}
      {preview.length > 0 && <div className="import-preview"><div className="preview-summary"><span className="valid">可导入 {preview.filter((r) => r.status === 'valid').length}</span><span>已自动匹配 {preview.filter((r) => r.matchedFromBuiltin).length}</span><span>重复 {preview.filter((r) => r.status === 'duplicate').length}</span><span className="invalid">错误 {preview.filter((r) => r.status === 'invalid').length}</span></div>{preview.slice(0, 8).map((row) => <div key={row.row} className={`preview-row ${row.status}`}><span>{row.row}</span><strong>{row.word || '空白'}</strong><span>{row.meaning || row.issue}{row.matchedFromBuiltin ? ' · 内置词库匹配' : ''}</span></div>)}{preview.filter((row) => row.status === 'valid').length > 20000 && <p className="validation">单个词库最多支持 20,000 个有效词条，请拆分后导入。</p>}<button className="primary wide" onClick={confirmImport} disabled={!preview.some((row) => row.status === 'valid') || preview.filter((row) => row.status === 'valid').length > 20000}>确认导入</button></div>}
    </section></div>}

    {editing && <div className="modal-backdrop"><form className="modal edit-word-modal" onSubmit={saveWord}><button type="button" className="icon-button modal-close" onClick={() => setEditing(undefined)} aria-label="关闭词条编辑"><X /></button><p className="eyebrow">{editing.id ? '编辑词条' : '新增词条'}</p><h2>词条信息</h2><label className="field"><span>单词 *</span><input name="word" defaultValue={editing.word} required /></label><p className="field-help">新增时只填写英文也可以；保存时会自动从内置词库匹配音标、词性和释义。</p><div className="form-grid"><label className="field"><span>音标</span><input name="phonetic" defaultValue={editing.phonetic} /></label><label className="field"><span>词性</span><input name="pos" defaultValue={editing.partOfSpeech} /></label></div><label className="field"><span>中文释义</span><textarea name="meaning" defaultValue={editing.meaning} /></label><button className="primary wide">保存词条</button></form></div>}
  </div>
}
