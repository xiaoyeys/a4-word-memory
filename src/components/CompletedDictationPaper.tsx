import type { MethodProgress } from '../types'
import { MeaningDisplay } from './MeaningDisplay'

interface PaperWord {
  id: string
  word: string
  meaning: string
  partOfSpeech?: string
}

interface Props {
  wordIds: string[]
  wordsById: Map<string, PaperWord>
  progress?: MethodProgress
}

export function CompletedDictationPaper({ wordIds, wordsById, progress }: Props) {
  const answers = progress?.dictationCompletedAnswers ?? {}
  return <div className="dictation-paper-workspace completed-dictation-workspace">
    <div className="dictation-paper completed-dictation-paper" role="table" aria-label="完整折叠默写纸">
      <div className="dictation-column-head" role="row">
        <span role="columnheader">1 · 单词提示</span>
        <span role="columnheader">2 · 词性与释义</span>
        <span role="columnheader">3 · 第一次默写单词</span>
        <span role="columnheader">4 · 第一次默写释义</span>
        <span role="columnheader">5 · 第二次默写单词</span>
        <span role="columnheader">6 · 第二次默写释义</span>
      </div>
      <div className="dictation-list">{wordIds.map((id) => {
        const word = wordsById.get(id)
        if (!word) return null
        const row = answers[id]
        return <article className="dictation-row" role="row" key={id}>
          <div className="dictation-paper-cell dictation-word-cell" role="cell"><div className="dictation-word">{word.word}</div></div>
          <div className="dictation-paper-cell dictation-meaning" role="cell"><MeaningDisplay meaning={word.meaning} partOfSpeech={word.partOfSpeech} compact maxMeaningsPerPart={2} /></div>
          <div className="dictation-paper-cell completed-answer" role="cell">{row?.firstWord || '—'}</div>
          <div className="dictation-paper-cell completed-answer" role="cell">{row?.firstMeaning || '—'}</div>
          <div className="dictation-paper-cell completed-answer" role="cell">{row?.secondWord || '—'}</div>
          <div className="dictation-paper-cell completed-answer" role="cell">{row?.secondMeaning || '—'}</div>
        </article>
      })}</div>
    </div>
  </div>
}
