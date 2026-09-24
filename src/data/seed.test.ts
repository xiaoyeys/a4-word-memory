import { describe, expect, it } from 'vitest'
import type { WordEntry } from '../types'
import { builtinLibraries, convertVocabularyWords } from './seed'

describe('bundled vocabularies', () => {
  it('includes the school-stage libraries', () => {
    expect(builtinLibraries.find((library) => library.id === 'builtin-primary')).toMatchObject({ fileName: 'primary.json', wordCount: 505 })
    expect(builtinLibraries.find((library) => library.id === 'builtin-zhongkao')).toMatchObject({ fileName: 'zhongkao.json', wordCount: 1603 })
    expect(builtinLibraries.find((library) => library.id === 'builtin-gaokao')).toMatchObject({ fileName: 'gaokao.json', wordCount: 3677 })
  })

  it('converts translations and keeps a matching legacy id', () => {
    const base = builtinLibraries[0]
    const library = { ...base, wordCount: 2 }
    const existing: WordEntry = {
      id: 'legacy-abandon',
      libraryId: library.id,
      word: 'abandon',
      normalizedWord: 'abandon',
      meaning: '放弃',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const words = convertVocabularyWords(library, {
      name: library.name,
      description: library.description,
      wordCount: 2,
      words: [
        { word: 'Abandon', phonetic: '/test/', translations: ['vt. 放弃', 'n. 放任'] },
        { word: 'ability', translations: ['n. 能力'] },
      ],
    }, [existing])

    expect(words[0]).toMatchObject({ id: 'legacy-abandon', normalizedWord: 'abandon', partOfSpeech: 'vt./n.', meaning: 'vt. 放弃；n. 放任' })
    expect(words[1].id).toBe(`${library.id}-00002`)
  })

  it('rejects a file whose declared count does not match the catalog', () => {
    const library = { ...builtinLibraries[0], wordCount: 1 }
    expect(() => convertVocabularyWords(library, { name: library.name, description: '', wordCount: 2, words: [] }))
      .toThrow('词条数量与目录不一致')
  })
})
