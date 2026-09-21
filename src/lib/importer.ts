import type { WordEntry } from '../types'
import { normalizeWord } from './study'

export interface ImportCandidate {
  row: number
  word: string
  phonetic: string
  partOfSpeech: string
  meaning: string
  status: 'valid' | 'duplicate' | 'invalid'
  issue?: string
  matchedFromBuiltin?: boolean
}

const aliases = {
  word: ['word', '英文', '单词', '词汇', 'english'],
  phonetic: ['phonetic', '音标', 'pronunciation'],
  partOfSpeech: ['partofspeech', 'part_of_speech', 'pos', '词性'],
  meaning: ['meaning', '释义', '中文', 'translation', 'definition'],
}

function cleanKey(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase().replace(/[\s_-]/g, '')
}

function findField(record: Record<string, unknown>, names: string[]) {
  const target = Object.keys(record).find((key) => names.map(cleanKey).includes(cleanKey(key)))
  return target ? String(record[target] ?? '').trim() : ''
}

export function findReferenceWord(value: string, references: WordEntry[]) {
  const normalized = normalizeWord(value)
  if (!normalized) return undefined
  return references.find((word) => word.normalizedWord === normalized)
}

export function enrichImportRecords(records: Record<string, unknown>[], references: WordEntry[]) {
  const lookup = new Map<string, WordEntry>()
  for (const word of references) {
    const current = lookup.get(word.normalizedWord)
    const score = Number(Boolean(word.phonetic)) + Number(Boolean(word.partOfSpeech))
    const currentScore = current ? Number(Boolean(current.phonetic)) + Number(Boolean(current.partOfSpeech)) : -1
    if (!current || score > currentScore) lookup.set(word.normalizedWord, word)
  }
  return records.map((record) => {
    const word = findField(record, aliases.word)
    const reference = lookup.get(normalizeWord(word))
    if (!reference) return record
    return {
      ...record,
      word,
      phonetic: findField(record, aliases.phonetic) || reference.phonetic || '',
      partOfSpeech: findField(record, aliases.partOfSpeech) || reference.partOfSpeech || '',
      meaning: findField(record, aliases.meaning) || reference.meaning,
      __matchedFromBuiltin: true,
    }
  })
}

function recordsFromText(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  return lines.map((line) => {
    const parts = line.split(/\t|\s*\|\s*|,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map((part) => part.replace(/^\"|\"$/g, '').trim())
    if (parts.length >= 4) return { word: parts[0], phonetic: parts[1], partOfSpeech: parts[2], meaning: parts.slice(3).join('；') }
    if (parts.length === 3) return { word: parts[0], partOfSpeech: parts[1], meaning: parts[2] }
    return { word: parts[0], meaning: parts.slice(1).join('；') }
  })
}

function parseCsvLine(line: string) {
  const cells: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"' && quoted && line[index + 1] === '"') { value += '"'; index += 1 }
    else if (character === '"') quoted = !quoted
    else if (character === ',' && !quoted) { cells.push(value.trim()); value = '' }
    else value += character
  }
  cells.push(value.trim())
  return cells
}

function recordsFromCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return []
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, parseCsvLine(line)[index] ?? ''])))
}

export async function parseImportFile(file: File): Promise<Record<string, unknown>[]> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'json') {
    const parsed = JSON.parse(await file.text())
    const data = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? parsed.words ?? parsed.data : undefined
    if (!Array.isArray(data)) throw new Error('JSON 中未找到词条数组')
    if (!data.every((item) => item && typeof item === 'object' && !Array.isArray(item))) throw new Error('JSON 词条必须是对象')
    return data as Record<string, unknown>[]
  }
  if (extension === 'xlsx' || extension === 'xls' || extension === 'csv') {
    if (extension === 'csv') return recordsFromCsv(await file.text())
    if (extension === 'xls') throw new Error('旧版 .xls 暂不支持，请另存为 .xlsx 或 CSV 后导入')
    const readXlsxFile = (await import('read-excel-file')).default
    const rows = await readXlsxFile(file)
    if (!rows.length) throw new Error('Excel 文件中没有数据')
    const headers = rows[0].map((value) => String(value ?? '').trim())
    return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? '').trim()])))
  }
  return recordsFromText(await file.text())
}

export function parsePastedText(text: string) {
  return recordsFromText(text)
}

export function validateImport(records: Record<string, unknown>[], existing: WordEntry[] = []): ImportCandidate[] {
  const seen = new Set(existing.map((word) => word.normalizedWord))
  return records.map((record, index) => {
    const word = findField(record, aliases.word)
    const meaning = findField(record, aliases.meaning)
    const normalized = normalizeWord(word)
    if (!word || !meaning) {
      return { row: index + 1, word, phonetic: '', partOfSpeech: '', meaning, status: 'invalid', issue: word ? '未在内置词库中匹配到释义，请补充释义' : '缺少单词' }
    }
    if (seen.has(normalized)) {
      return { row: index + 1, word, phonetic: '', partOfSpeech: '', meaning, status: 'duplicate', issue: '重复单词' }
    }
    seen.add(normalized)
    return {
      row: index + 1,
      word,
      phonetic: findField(record, aliases.phonetic),
      partOfSpeech: findField(record, aliases.partOfSpeech),
      meaning,
      status: 'valid',
      matchedFromBuiltin: record.__matchedFromBuiltin === true,
    }
  })
}
