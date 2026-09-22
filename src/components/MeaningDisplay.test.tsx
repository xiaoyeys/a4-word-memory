import { describe, expect, it } from 'vitest'
import { splitMeaning } from './MeaningDisplay'

describe('splitMeaning', () => {
  it('separates multiple parts of speech and improves list punctuation', () => {
    expect(splitMeaning('n. 液体, 分泌液, 流体；a. 流动的, 可改变的')).toEqual([
      { label: 'n.', text: '液体、分泌液、流体' },
      { label: 'adj.', text: '流动的、可改变的' },
    ])
  })

  it('keeps an unstructured meaning and uses the stored part of speech', () => {
    expect(splitMeaning('非常高兴；愉快', 'adj.')).toEqual([{ label: 'adj.', text: '非常高兴；愉快' }])
  })

  it('expands legacy adjective and adverb abbreviations', () => {
    expect(splitMeaning('快速地', 'ad.')).toEqual([{ label: 'adv.', text: '快速地' }])
    expect(splitMeaning('受约束的', 'a.')).toEqual([{ label: 'adj.', text: '受约束的' }])
  })
})
