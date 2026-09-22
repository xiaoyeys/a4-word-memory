import { db } from '../db'
import type { MemoryFolder, MemoryPaper, StudySession, WordEntry, WordLibrary } from '../types'
import { summaryFor } from './study'

export function libraryFolderId(libraryId: string) {
  return `memory-folder-library-${libraryId}`
}

export function paperId(sessionId: string) {
  return `memory-paper-${sessionId}`
}

export function defaultPaperTitle(session: StudySession) {
  const date = new Date(session.completedAt ?? session.updatedAt)
  const day = Number.isFinite(date.getTime()) ? date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }) : '历史学习'
  return `${day} · ${session.wordIds.length}词`
}

export function buildArchiveRecords(
  libraries: WordLibrary[],
  words: WordEntry[],
  sessions: StudySession[],
  existingFolders: MemoryFolder[],
  existingPapers: MemoryPaper[],
  now = new Date().toISOString(),
) {
  const folderIds = new Set(existingFolders.map((folder) => folder.id))
  const paperSessions = new Set(existingPapers.map((paper) => paper.sourceSessionId))
  const wordsById = new Map(words.map((word) => [word.id, word]))
  const folders: MemoryFolder[] = []
  const papers: MemoryPaper[] = []

  libraries.forEach((library, index) => {
    const id = libraryFolderId(library.id)
    if (folderIds.has(id)) return
    folders.push({ id, name: library.name, kind: 'library', libraryId: library.id, order: index, createdAt: now, updatedAt: now })
  })

  sessions.filter((session) => session.status === 'completed' && session.completedAt && !paperSessions.has(session.id)).forEach((session) => {
    const summary = summaryFor(session)
    const completedAt = session.completedAt!
    const snapshots = session.wordIds.map((id) => wordsById.get(id)).filter((word): word is WordEntry => Boolean(word)).map((word) => ({
      id: word.id,
      word: word.word,
      phonetic: word.phonetic,
      partOfSpeech: word.partOfSpeech,
      meaning: word.meaning,
    }))
    const snapshotIds = new Set(snapshots.map((word) => word.id))
    papers.push({
      id: paperId(session.id),
      sourceSessionId: session.id,
      folderId: libraryFolderId(session.libraryId),
      libraryId: session.libraryId,
      libraryName: session.libraryName,
      title: defaultPaperTitle(session),
      favorite: false,
      removed: false,
      placed: session.placed.filter((item) => snapshotIds.has(item.wordId)),
      words: snapshots,
      completedAt,
      firstRecallRate: summary.firstRecallRate,
      finalMasteryRate: summary.finalMasteryRate,
      createdAt: now,
      updatedAt: now,
    })
  })

  return { folders, papers }
}

export async function syncMemoryArchive(libraries: WordLibrary[], words: WordEntry[], sessions: StudySession[]) {
  const [existingFolders, existingPapers] = await Promise.all([db.memoryFolders.toArray(), db.memoryPapers.toArray()])
  const records = buildArchiveRecords(libraries, words, sessions, existingFolders, existingPapers)
  if (!records.folders.length && !records.papers.length) return
  await db.transaction('rw', db.memoryFolders, db.memoryPapers, async () => {
    for (const folder of records.folders) {
      if (!(await db.memoryFolders.get(folder.id))) await db.memoryFolders.add(folder)
    }
    for (const paper of records.papers) {
      if (!(await db.memoryPapers.where('sourceSessionId').equals(paper.sourceSessionId).first())) await db.memoryPapers.add(paper)
    }
  })
}
