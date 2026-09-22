type FeedbackSound = 'complete' | 'correct' | 'place' | 'finish' | 'error'

let audioContext: AudioContext | undefined

export function playFeedbackSound(kind: FeedbackSound, enabled = true) {
  if (!enabled || typeof window === 'undefined') return
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return
  try {
    audioContext ??= new AudioContextClass()
    const context = audioContext
    if (context.state === 'suspended') void context.resume()
    const now = context.currentTime
    const notes = kind === 'error' ? [190] : kind === 'finish' ? [440, 554, 659] : kind === 'correct' ? [523, 659] : kind === 'place' ? [392, 523] : [440, 587]
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = kind === 'error' ? 'triangle' : 'sine'
      oscillator.frequency.value = frequency
      const start = now + index * .07
      gain.gain.setValueAtTime(.0001, start)
      gain.gain.exponentialRampToValueAtTime(.08, start + .012)
      gain.gain.exponentialRampToValueAtTime(.0001, start + .14)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + .16)
    })
  } catch {
    // Feedback audio is optional and must never interrupt a study action.
  }
}
