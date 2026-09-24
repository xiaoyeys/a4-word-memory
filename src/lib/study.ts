import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs'
import type { PlacedWord, RecallEvent, RecallRating, SessionSummary, StoredCard, StudySession, WordEntry } from '../types'

export const PAGE_WIDTH = 1000
export const PAGE_HEIGHT = Math.round((PAGE_WIDTH * 297) / 210)
const MARGIN = 42
const GAP = 18

export function normalizeWord(value: string) {
  return value.trim().toLocaleLowerCase('en-US')
}

export function isLearnedCard(stored?: StoredCard) {
  return Boolean(stored?.learnedAt || (stored?.card.reps ?? 0) > 0)
}

export function shuffle<T>(items: T[]) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[next]] = [result[next], result[index]]
  }
  return result
}

export function estimateWordBox(word: string, fontScale: number) {
  const fontSize = Math.max(22, Math.min(34, 30 * fontScale - Math.max(0, word.length - 13) * 0.55))
  return {
    width: Math.max(90, Math.min(360, word.length * fontSize * 0.62 + 22)),
    height: fontSize + 18,
    fontSize,
  }
}

export function overlaps(a: Pick<PlacedWord, 'x' | 'y' | 'width' | 'height'>, b: Pick<PlacedWord, 'x' | 'y' | 'width' | 'height'>) {
  return !(
    a.x + a.width + GAP <= b.x ||
    b.x + b.width + GAP <= a.x ||
    a.y + a.height + GAP <= b.y ||
    b.y + b.height + GAP <= a.y
  )
}

export function isValidPlacement(candidate: Pick<PlacedWord, 'page' | 'x' | 'y' | 'width' | 'height'>, placed: PlacedWord[]) {
  if (
    candidate.x < MARGIN || candidate.y < MARGIN ||
    candidate.x + candidate.width > PAGE_WIDTH - MARGIN ||
    candidate.y + candidate.height > PAGE_HEIGHT - MARGIN
  ) return false
  return !placed.some((item) => item.page === candidate.page && overlaps(candidate, item))
}

export function findRandomPlacement(word: string, placed: PlacedWord[], fontScale: number) {
  const box = estimateWordBox(word, fontScale)
  let page = Math.max(0, ...placed.map((item) => item.page))
  for (let pageAttempts = 0; pageAttempts < 12; pageAttempts += 1) {
    for (let attempt = 0; attempt < 160; attempt += 1) {
      const candidate = {
        page,
        x: MARGIN + Math.random() * (PAGE_WIDTH - box.width - MARGIN * 2),
        y: MARGIN + Math.random() * (PAGE_HEIGHT - box.height - MARGIN * 2),
        ...box,
      }
      if (isValidPlacement(candidate, placed)) return candidate
    }
    page += 1
  }
  throw new Error('无法在纸面上找到可用位置')
}

export function summaryFor(session: StudySession): SessionSummary {
  const byWord = new Map<string, RecallEvent[]>()
  session.events.forEach((event) => byWord.set(event.wordId, [...(byWord.get(event.wordId) ?? []), event]))
  const groups = [...byWord.values()]
  const firstRemembered = groups.filter((events) => events[0]?.rating === 'remembered').length
  const finalRemembered = groups.filter((events) => events.at(-1)?.rating === 'remembered').length
  const counts = session.events.reduce((acc, event) => ({ ...acc, [event.rating]: acc[event.rating] + 1 }), {
    remembered: 0,
    fuzzy: 0,
    forgotten: 0,
  } as Record<RecallRating, number>)
  return {
    sessionId: session.id,
    totalWords: session.wordIds.length,
    firstRecallRate: groups.length ? firstRemembered / groups.length : 0,
    finalMasteryRate: groups.length ? finalRemembered / groups.length : 0,
    ...counts,
    durationMinutes: Math.max(1, Math.round((session.activeSeconds ?? (new Date(session.completedAt ?? session.updatedAt).getTime() - new Date(session.startedAt).getTime()) / 1000) / 60)),
  }
}

export function aggregateRating(events: RecallEvent[], spellingForgotten: boolean): Grade {
  const last = events.at(-1)?.rating
  if (last === 'forgotten') return Rating.Again
  if (spellingForgotten || events.some((event) => event.rating !== 'remembered')) return Rating.Hard
  return Rating.Good
}

const scheduler = fsrs()

function reviveCard(card: Card): Card {
  return {
    ...card,
    due: new Date(card.due),
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  }
}

export function scheduleCard(stored: StoredCard | undefined, rating: Grade, now = new Date()): StoredCard {
  const card = stored ? reviveCard(stored.card) : createEmptyCard(now)
  const result = scheduler.next(card, now, rating)
  return {
    wordId: stored?.wordId ?? '',
    card: result.card,
    lastStudiedAt: now.toISOString(),
  }
}

export function classifyCard(stored?: StoredCard) {
  if (!stored) return '未学习'
  const due = new Date(stored.card.due)
  if (due <= new Date()) return '待复习'
  if (stored.card.difficulty >= 7) return '薄弱'
  if (stored.card.stability >= 21) return '较熟练'
  return '学习中'
}

export function pickWords(words: WordEntry[], cards: Map<string, StoredCard>, count: number, mode: StudySession['mode'], allowRecent: boolean) {
  const now = Date.now()
  const recentCutoff = now - 3 * 24 * 60 * 60 * 1000
  const due = words.filter((word) => {
    const card = cards.get(word.id)
    return isLearnedCard(card) && new Date(card!.card.due).getTime() <= now
  })
  const unseen = words.filter((word) => !isLearnedCard(cards.get(word.id)))
  const weak = words.filter((word) => {
    const card = cards.get(word.id)
    return isLearnedCard(card) && new Date(card!.card.due).getTime() > now && ((card!.card.difficulty ?? 0) >= 7 || (card!.forgetCount ?? 0) > 0 || (card!.fuzzyCount ?? 0) > 0 || (card!.spellingErrorCount ?? 0) > 0 || card!.important || card!.confusing)
  })
  const learned = words.filter((word) => {
    const card = cards.get(word.id)
    return isLearnedCard(card) && new Date(card!.card.due).getTime() > now && (card!.card.difficulty ?? 0) < 7
  })
  const old = learned.filter((word) => {
    const card = cards.get(word.id)
    return !card?.lastStudiedAt || new Date(card.lastStudiedAt).getTime() < recentCutoff
  })
  const recent = learned.filter((word) => {
    const card = cards.get(word.id)
    return Boolean(card?.lastStudiedAt && new Date(card.lastStudiedAt).getTime() >= recentCutoff)
  })
  let ordered: WordEntry[]
  if (mode === 'daily') {
    ordered = [...shuffle(due), ...shuffle(unseen).slice(0, count)]
  } else if (mode === 'due') {
    const weakFirst = weak.sort((a, b) => (cards.get(b.id)?.card.difficulty ?? 0) - (cards.get(a.id)?.card.difficulty ?? 0))
    ordered = [...shuffle(due), ...weakFirst, ...shuffle(old), ...shuffle(unseen), ...shuffle(recent)]
  } else if (mode === 'weak') {
    const weakFirst = weak.sort((a, b) => (cards.get(b.id)?.card.difficulty ?? 0) - (cards.get(a.id)?.card.difficulty ?? 0))
    ordered = [...shuffle(due), ...weakFirst, ...shuffle(old), ...shuffle(unseen), ...shuffle(recent)]
  } else {
    const weakFirst = weak.sort((a, b) => (cards.get(b.id)?.card.difficulty ?? 0) - (cards.get(a.id)?.card.difficulty ?? 0))
    const recentWords = allowRecent ? shuffle(recent) : recent.sort((a, b) => new Date(cards.get(a.id)!.lastStudiedAt!).getTime() - new Date(cards.get(b.id)!.lastStudiedAt!).getTime())
    ordered = [...shuffle(due), ...weakFirst, ...shuffle(unseen), ...shuffle(old), ...recentWords]
  }
  const unique = [...new Map(ordered.map((word) => [word.id, word])).values()]
  return mode === 'daily' ? unique : unique.slice(0, count)
}

export function dailyPlan(words: WordEntry[], cards: Map<string, StoredCard>, newWordTarget: number) {
  const now = Date.now()
  const due = words.filter((word) => {
    const card = cards.get(word.id)
    return isLearnedCard(card) && new Date(card!.card.due).getTime() <= now
  })
  const unseen = words.filter((word) => !isLearnedCard(cards.get(word.id)))
  return {
    dueCount: due.length,
    availableNewCount: unseen.length,
    newCount: Math.min(Math.max(0, newWordTarget), unseen.length),
    totalCount: due.length + Math.min(Math.max(0, newWordTarget), unseen.length),
  }
}
