import { describe, expect, it } from 'vitest'
import { parseImportFile, parsePastedText, validateImport } from './importer'

describe('word import', () => {
  it('parses pipe and tab separated text', () => {
    const records = parsePastedText('maintain | /meɪnˈteɪn/ | v. | 维持；保养\nbenefit\tn.\t益处')
    const rows = validateImport(records)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ word: 'maintain', phonetic: '/meɪnˈteɪn/', partOfSpeech: 'v.', status: 'valid' })
    expect(rows[1]).toMatchObject({ word: 'benefit', partOfSpeech: 'n.', meaning: '益处', status: 'valid' })
  })

  it('marks duplicates and missing meanings before import', () => {
    const rows = validateImport([{ word: 'Alpha', meaning: '一' }, { word: 'alpha', meaning: '二' }, { word: 'empty' }])
    expect(rows.map((row) => row.status)).toEqual(['valid', 'duplicate', 'invalid'])
  })

  it('uses the first CSV row as field names', async () => {
    const file = { name: 'words.csv', text: async () => 'word,phonetic,pos,meaning\nmaintain,/meɪnˈteɪn/,v.,维持' } as File
    const rows = validateImport(await parseImportFile(file))
    expect(rows[0]).toMatchObject({ word: 'maintain', phonetic: '/meɪnˈteɪn/', partOfSpeech: 'v.', meaning: '维持', status: 'valid' })
  })
})
