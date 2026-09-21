import { ChevronLeft, ChevronRight, LocateFixed, Minus, Plus, Volume2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { PlacedWord } from '../types'
import { isValidPlacement, PAGE_HEIGHT, PAGE_WIDTH } from '../lib/study'

interface PaperCanvasProps {
  placed: PlacedWord[]
  words: Map<string, { word: string }>
  currentPage: number
  onPageChange: (page: number) => void
  onWordClick: (item: PlacedWord) => void
  onPreview: (preview: Omit<PlacedWord, 'wordId' | 'order'>) => void
  preview?: Omit<PlacedWord, 'wordId' | 'order'>
  placing?: { word: string; width: number; height: number; fontSize: number }
  showSequence: boolean
  highlightedId?: string
  onSpeak: (word: string) => void
  canHint?: boolean
  onHint?: () => void
}

export function PaperCanvas(props: PaperCanvasProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const pages = Math.max(1, ...props.placed.map((item) => item.page + 1), props.preview ? props.preview.page + 1 : 1)
  const pageWords = useMemo(() => props.placed.filter((item) => item.page === props.currentPage), [props.placed, props.currentPage])

  function selectPoint(event: React.MouseEvent<HTMLDivElement>) {
    if (!props.placing || !ref.current || (event.target as HTMLElement).closest('.paper-word')) return
    const bounds = ref.current.getBoundingClientRect()
    const scale = bounds.width / PAGE_WIDTH
    const x = (event.clientX - bounds.left) / scale - props.placing.width / 2
    const y = (event.clientY - bounds.top) / scale - props.placing.height / 2
    const candidate = { page: props.currentPage, x, y, width: props.placing.width, height: props.placing.height, fontSize: props.placing.fontSize }
    if (isValidPlacement(candidate, props.placed)) props.onPreview(candidate)
  }

  return (
    <section className="paper-workspace" aria-label="A4单词纸">
      <div className="paper-toolbar">
        <div className="pager">
          <button className="icon-button" disabled={props.currentPage === 0} onClick={() => props.onPageChange(props.currentPage - 1)} aria-label="上一页"><ChevronLeft /></button>
          <span>{props.currentPage + 1} / {pages}</span>
          <button className="icon-button" disabled={props.currentPage >= pages - 1} onClick={() => props.onPageChange(props.currentPage + 1)} aria-label="下一页"><ChevronRight /></button>
        </div>
        <div className="paper-actions">
          {props.canHint && <button className="tool-button" onClick={props.onHint}><LocateFixed size={17} />提示位置</button>}
          <button className="icon-button" onClick={() => setZoom(Math.max(.72, zoom - .12))} aria-label="缩小纸张"><Minus /></button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="icon-button" onClick={() => setZoom(Math.min(1.7, zoom + .12))} aria-label="放大纸张"><Plus /></button>
        </div>
      </div>
      <div className="paper-scroll">
        <div className="paper-zoom" style={{ width: `${zoom * 100}%` }}>
          <div ref={ref} className={props.placing ? 'a4-paper placing' : 'a4-paper'} onClick={selectPoint}>
            {pageWords.map((item) => {
              const word = props.words.get(item.wordId)?.word ?? ''
              return (
                <button
                  className={props.highlightedId === item.wordId ? 'paper-word highlighted' : 'paper-word'}
                  key={item.wordId}
                  style={{ left: `${item.x / PAGE_WIDTH * 100}%`, top: `${item.y / PAGE_HEIGHT * 100}%`, width: `${item.width / PAGE_WIDTH * 100}%`, minHeight: `${item.height / PAGE_HEIGHT * 100}%`, fontSize: `${item.fontSize / PAGE_WIDTH * 100}cqw` }}
                  onClick={(event) => { event.stopPropagation(); props.onWordClick(item) }}
                  title="点击选择单词"
                >
                  {props.showSequence && <small>{item.order}.</small>}{word}
                  <span className="word-speak" onClick={(event) => { event.stopPropagation(); props.onSpeak(word) }}><Volume2 size={13} /></span>
                </button>
              )
            })}
            {props.preview && props.preview.page === props.currentPage && props.placing && (
              <div className="paper-preview" style={{ left: `${props.preview.x / PAGE_WIDTH * 100}%`, top: `${props.preview.y / PAGE_HEIGHT * 100}%`, width: `${props.preview.width / PAGE_WIDTH * 100}%`, minHeight: `${props.preview.height / PAGE_HEIGHT * 100}%` }}>
                {props.placing.word}
              </div>
            )}
            {!pageWords.length && !props.preview && <div className="empty-paper">{props.placing ? '点击纸面空白处选择位置' : '这页还是空白的'}</div>}
          </div>
        </div>
      </div>
    </section>
  )
}
