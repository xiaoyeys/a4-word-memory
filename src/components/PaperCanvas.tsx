import { ChevronLeft, ChevronRight, FilePlus2, LocateFixed, Maximize2, Minimize2, Minus, Plus, Volume2 } from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { PlacedWord, AppSettings } from '../types'
import { isValidPlacement, PAGE_HEIGHT, PAGE_WIDTH } from '../lib/study'

interface PaperCanvasProps {
  placed: PlacedWord[]
  words: Map<string, { word: string }>
  currentPage: number
  onPageChange: (page: number) => void
  onWordClick: (item: PlacedWord) => void
  onPreview: (preview: Omit<PlacedWord, 'wordId' | 'order'>) => void
  onInvalidPlacement?: () => void
  preview?: Omit<PlacedWord, 'wordId' | 'order'>
  placing?: { word: string; width: number; height: number; fontSize: number }
  showSequence: boolean
  highlightedId?: string
  onSpeak: (word: string) => void
  canHint?: boolean
  onHint?: () => void
  mobileExpanded: boolean
  onMobileToggle: () => void
  showMobileToggle?: boolean
  mobileGuide?: ReactNode
  paperTheme?: AppSettings['paperTheme']
}

export function PaperCanvas(props: PaperCanvasProps) {
  const ref = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ distance: number; zoom: number; centerX: number; centerY: number; scrollLeft: number; scrollTop: number } | undefined>(undefined)
  const [zoom, setZoom] = useState(1)
  const pages = Math.max(1, props.currentPage + 1, ...props.placed.map((item) => item.page + 1), props.preview ? props.preview.page + 1 : 1)
  const pageWords = useMemo(() => props.placed.filter((item) => item.page === props.currentPage), [props.placed, props.currentPage])

  function selectPoint(event: React.MouseEvent<HTMLDivElement>) {
    if (!props.placing || !ref.current || (event.target as HTMLElement).closest('.paper-word')) return
    const bounds = ref.current.getBoundingClientRect()
    const scale = bounds.width / PAGE_WIDTH
    const x = (event.clientX - bounds.left) / scale - props.placing.width / 2
    const y = (event.clientY - bounds.top) / scale - props.placing.height / 2
    const candidate = { page: props.currentPage, x, y, width: props.placing.width, height: props.placing.height, fontSize: props.placing.fontSize }
    if (isValidPlacement(candidate, props.placed)) props.onPreview(candidate)
    else props.onInvalidPlacement?.()
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!props.mobileExpanded || event.pointerType !== 'touch') return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture(event.pointerId)
    if (pointers.current.size === 2 && scrollRef.current) {
      const [a, b] = [...pointers.current.values()]
      const bounds = scrollRef.current.getBoundingClientRect()
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom,
        centerX: (a.x + b.x) / 2 - bounds.left,
        centerY: (a.y + b.y) / 2 - bounds.top,
        scrollLeft: scrollRef.current.scrollLeft,
        scrollTop: scrollRef.current.scrollTop,
      }
    }
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size !== 2 || !pinch.current || !scrollRef.current) return
    event.preventDefault()
    const [a, b] = [...pointers.current.values()]
    const distance = Math.hypot(a.x - b.x, a.y - b.y)
    const gesture = pinch.current
    const nextZoom = Math.max(.72, Math.min(1.7, gesture.zoom * distance / Math.max(1, gesture.distance)))
    const ratio = nextZoom / gesture.zoom
    setZoom(nextZoom)
    const scroll = scrollRef.current
    requestAnimationFrame(() => {
      scroll.scrollLeft = (gesture.scrollLeft + gesture.centerX) * ratio - gesture.centerX
      scroll.scrollTop = (gesture.scrollTop + gesture.centerY) * ratio - gesture.centerY
    })
  }

  function pointerUp(event: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) pinch.current = undefined
  }

  return (
    <section className={`paper-workspace${props.mobileExpanded ? ' mobile-paper-expanded' : ''}${props.mobileGuide ? ' has-mobile-guide' : ''}`} aria-label="A4单词纸">
      <div className="paper-toolbar">
        <div className="pager">
          <button className="icon-button" disabled={props.currentPage === 0} onClick={() => props.onPageChange(props.currentPage - 1)} aria-label="上一页"><ChevronLeft /></button>
          <span>{props.currentPage + 1} / {pages}</span>
          <button className="icon-button" disabled={props.currentPage >= pages - 1} onClick={() => props.onPageChange(props.currentPage + 1)} aria-label="下一页"><ChevronRight /></button>
        </div>
        <div className="paper-actions">
          {props.canHint && <button className="tool-button" onClick={props.onHint}><LocateFixed size={17} />提示位置</button>}
          {props.placing && <button className="tool-button new-paper-button" onClick={() => props.onPageChange(pages)}><FilePlus2 size={17} /><span>新建一页</span></button>}
          {props.showMobileToggle !== false && <button className="tool-button mobile-paper-toggle" onClick={props.onMobileToggle} aria-label={props.mobileExpanded ? '返回单词卡片' : '放大A4纸'}>{props.mobileExpanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}<span>{props.mobileExpanded ? '返回卡片' : '放大纸张'}</span></button>}
          <button className="icon-button" onClick={() => setZoom(Math.max(.72, zoom - .12))} aria-label="缩小纸张"><Minus /></button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="icon-button" onClick={() => setZoom(Math.min(1.7, zoom + .12))} aria-label="放大纸张"><Plus /></button>
        </div>
      </div>
      {props.mobileGuide && <div className="mobile-paper-guide">{props.mobileGuide}</div>}
      <div ref={scrollRef} className="paper-scroll" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onClick={() => { if (props.showMobileToggle !== false && !props.mobileExpanded && !props.placing) props.onMobileToggle() }}>
        <div className="paper-zoom" style={{ width: `${zoom * 100}%` }}>
          <div ref={ref} className={`${props.placing ? 'a4-paper placing' : 'a4-paper'} paper-theme-${props.paperTheme ?? 'plain'}`} onClick={selectPoint}>
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
