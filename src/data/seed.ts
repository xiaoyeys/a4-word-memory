import type { WordEntry, WordLibrary } from '../types'

const createdAt = '2026-07-27T00:00:00.000Z'

export interface BundledLibrary extends WordLibrary {
  fileName: string
}

export interface VocabularyLoadProgress {
  phase: 'downloading' | 'processing'
  percent?: number
}

interface VocabularyFile {
  name: string
  description: string
  wordCount: number
  words: Array<{
    word: string
    phonetic?: string
    translations: string[]
  }>
}

const catalog: Array<Omit<BundledLibrary, 'kind' | 'version' | 'createdAt' | 'updatedAt'>> = [
  { id: 'builtin-primary', fileName: 'primary.json', name: '小学课标词汇', description: '义务教育英语课程标准（2022年版）小学二级词汇', wordCount: 505 },
  { id: 'builtin-zhongkao', fileName: 'zhongkao.json', name: '中考核心词汇', description: '初中英语及中考常用词汇', wordCount: 1603 },
  { id: 'builtin-gaokao', fileName: 'gaokao.json', name: '高考核心词汇', description: '高中英语及高考常用词汇', wordCount: 3677 },
  { id: 'builtin-cet4', fileName: 'cet4.json', name: 'CET-4 核心词汇', description: '大学英语四级考试大纲词汇', wordCount: 3815 },
  { id: 'builtin-cet4-high-frequency', fileName: 'cet4_high_freq.json', name: 'CET-4 高频词汇', description: '四级大纲中的高频词汇', wordCount: 2480 },
  { id: 'builtin-cet6', fileName: 'cet6.json', name: 'CET-6 核心词汇', description: '大学英语六级考试大纲词汇', wordCount: 5371 },
  { id: 'builtin-cet6-high-frequency', fileName: 'cet6_high_freq.json', name: 'CET-6 高频词汇', description: '六级大纲中的高频词汇', wordCount: 2482 },
  { id: 'builtin-postgraduate', fileName: 'kaoyan.json', name: '考研核心词汇', description: '研究生入学考试英语大纲词汇', wordCount: 4787 },
  { id: 'builtin-postgraduate-high-frequency', fileName: 'kaoyan_high_freq.json', name: '考研高频词汇', description: '考研大纲中的高频词汇', wordCount: 2291 },
  { id: 'builtin-ielts-basic', fileName: 'ielts_basic.json', name: 'IELTS 基础词汇', description: '雅思基础阶段常用词汇', wordCount: 1857 },
  { id: 'builtin-ielts-core', fileName: 'ielts_core.json', name: 'IELTS 核心词汇', description: '雅思考试核心词汇', wordCount: 4974 },
  { id: 'builtin-ielts-advanced', fileName: 'ielts_advanced.json', name: 'IELTS 高级词汇', description: '雅思进阶阶段词汇', wordCount: 3117 },
  { id: 'builtin-toefl', fileName: 'toefl.json', name: 'TOEFL 核心词汇', description: '托福考试核心词汇', wordCount: 6959 },
  { id: 'builtin-toefl-high-frequency', fileName: 'toefl_high_freq.json', name: 'TOEFL 高频词汇', description: '托福核心词汇中的高频词', wordCount: 3593 },
  { id: 'builtin-gre', fileName: 'gre.json', name: 'GRE 核心词汇', description: 'GRE 考试核心词汇', wordCount: 7485 },
  { id: 'builtin-gmat', fileName: 'gmat.json', name: 'GMAT 核心词汇', description: 'GMAT 备考参考词汇', wordCount: 2996 },
  { id: 'builtin-sat', fileName: 'sat.json', name: 'SAT 核心词汇', description: 'SAT 备考参考词汇', wordCount: 4471 },
]

export const builtinLibraries: BundledLibrary[] = catalog.map((library) => ({
  ...library,
  kind: 'builtin',
  version: 2,
  createdAt,
  updatedAt: createdAt,
}))

const partOfSpeechPattern = /^(?:\[[^\]]+\]\s*)*((?:n|v|vt|vi|adj|a|adv|ad|prep|conj|pron|num|art|int|interj|aux)\.)\s*/i

function partOfSpeechFor(translations: string[]) {
  const values = translations
    .map((translation) => translation.match(partOfSpeechPattern)?.[1]?.toLowerCase())
    .filter((value): value is string => Boolean(value))
  return [...new Set(values)].join('/') || undefined
}

export function convertVocabularyWords(library: BundledLibrary, source: VocabularyFile, existingWords: WordEntry[] = []): WordEntry[] {
  if (!Array.isArray(source.words) || source.words.length !== library.wordCount || source.wordCount !== library.wordCount) {
    throw new Error(`${library.name}的词条数量与目录不一致`)
  }

  const reusableIds = new Map<string, string[]>()
  for (const entry of existingWords) {
    const ids = reusableIds.get(entry.normalizedWord) ?? []
    ids.push(entry.id)
    reusableIds.set(entry.normalizedWord, ids)
  }

  return source.words.map((entry, index) => {
    const word = typeof entry.word === 'string' ? entry.word.trim() : ''
    const translations = Array.isArray(entry.translations)
      ? entry.translations.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map((value) => value.trim())
      : []
    if (!word || translations.length === 0) throw new Error(`${library.name}第${index + 1}条数据缺少单词或释义`)

    const normalizedWord = word.toLocaleLowerCase('en-US')
    const reusableId = reusableIds.get(normalizedWord)?.shift()
    return {
      id: reusableId ?? `${library.id}-${String(index + 1).padStart(5, '0')}`,
      libraryId: library.id,
      word,
      normalizedWord,
      phonetic: typeof entry.phonetic === 'string' ? entry.phonetic.trim() || undefined : undefined,
      partOfSpeech: partOfSpeechFor(translations),
      meaning: translations.join('；'),
      createdAt,
    }
  })
}

async function readVocabularyResponse(response: Response, onProgress?: (progress: VocabularyLoadProgress) => void) {
  const total = Number(response.headers.get('content-length')) || undefined
  if (!response.body) {
    onProgress?.({ phase: 'downloading' })
    return response.json() as Promise<VocabularyFile>
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    onProgress?.({ phase: 'downloading', percent: total ? Math.min(100, Math.round(received / total * 100)) : undefined })
  }

  const bytes = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as VocabularyFile
}

export async function loadBuiltinWords(library: BundledLibrary, existingWords: WordEntry[] = [], onProgress?: (progress: VocabularyLoadProgress) => void) {
  onProgress?.({ phase: 'downloading', percent: 0 })
  const response = await fetch(`${import.meta.env.BASE_URL}vocabularies/${library.fileName}`)
  if (!response.ok) throw new Error(`无法读取词库 ${library.name}（${response.status}）`)
  const source = await readVocabularyResponse(response, onProgress)
  onProgress?.({ phase: 'processing', percent: 100 })
  return convertVocabularyWords(library, source, existingWords)
}
