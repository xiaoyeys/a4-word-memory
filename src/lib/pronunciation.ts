import type { AppSettings } from '../types'

const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAAgICA'

let sharedAudio: HTMLAudioElement | undefined
let playbackToken = 0

function audioElement() {
  sharedAudio ??= new Audio()
  return sharedAudio
}

function onlineAudioUrl(text: string, accent: AppSettings['accent']) {
  // Youdao uses type=2 for American English and type=1 for British English.
  const type = accent === 'en-US' ? '2' : '1'
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=${type}`
}

export function unlockPronunciationAudio() {
  if (typeof Audio === 'undefined') return
  const audio = audioElement()
  const token = ++playbackToken
  audio.pause()
  audio.src = SILENT_WAV
  audio.volume = .01
  audio.load()
  void audio.play().then(() => {
    if (token !== playbackToken) return
    audio.pause()
    audio.currentTime = 0
    audio.volume = 1
  }).catch(() => {
    if (token === playbackToken) audio.volume = 1
  })
}

export function playOnlinePronunciation(text: string, accent: AppSettings['accent'], onFailure: () => void) {
  if (typeof Audio === 'undefined') {
    onFailure()
    return
  }
  const audio = audioElement()
  const token = ++playbackToken
  let failed = false
  const fail = () => {
    if (failed || token !== playbackToken) return
    failed = true
    onFailure()
  }
  audio.pause()
  audio.src = onlineAudioUrl(text, accent)
  audio.preload = 'none'
  audio.volume = 1
  audio.onerror = fail
  audio.onended = () => {
    if (token !== playbackToken) return
    audio.onerror = null
    audio.onended = null
  }
  audio.load()
  void audio.play().catch(fail)
}

export function stopPronunciationAudio() {
  playbackToken += 1
  sharedAudio?.pause()
  if (sharedAudio) {
    sharedAudio.onerror = null
    sharedAudio.onended = null
  }
}
