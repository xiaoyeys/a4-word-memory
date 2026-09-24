interface MeaningPart {
  label?: string
  text: string
}

const partOfSpeechPattern = /(?:^|[；;]\s*)((?:n|v|vt|vi|adj|a|adv|ad|prep|conj|pron|num|art|int|interj|aux)\.)\s*/gi

function tidyMeaning(value: string) {
  return value.trim().replace(/,\s*/g, '、')
}

function canonicalLabel(value: string) {
  const label = value.trim().toLowerCase()
  if (label === 'a.' || label === 'a') return 'adj.'
  if (label === 'ad.' || label === 'ad') return 'adv.'
  return label
}

export function formatPartOfSpeech(value?: string) {
  if (!value) return undefined
  return value.split('/').map(canonicalLabel).join('/')
}

export function splitMeaning(meaning: string, fallbackPartOfSpeech?: string): MeaningPart[] {
  const matches = [...meaning.matchAll(partOfSpeechPattern)]
  if (!matches.length) return [{ label: formatPartOfSpeech(fallbackPartOfSpeech), text: tidyMeaning(meaning) }]

  const parts = matches.map((match, index) => {
    const start = match.index! + match[0].length
    const end = matches[index + 1]?.index ?? meaning.length
    return { label: canonicalLabel(match[1]), text: tidyMeaning(meaning.slice(start, end)) }
  }).filter((part) => part.text)

  return parts.length ? parts : [{ label: formatPartOfSpeech(fallbackPartOfSpeech), text: tidyMeaning(meaning) }]
}

export function emphasizedMeaningParts(text: string) {
  const segments = text.split(/([、,，;；])/)
  let meaningIndex = 0
  let nextGroupPrimary = false
  return segments.filter(Boolean).map((segment) => {
    const separator = /^[、,，;；]$/.test(segment)
    if (separator) {
      if (/[;；]/.test(segment)) nextGroupPrimary = true
      return { text: segment, bold: false }
    }
    const bold = meaningIndex < 2 || nextGroupPrimary
    nextGroupPrimary = false
    meaningIndex += 1
    return { text: segment, bold }
  })
}

function limitMeaningText(text: string, limit?: number) {
  if (!limit || limit < 1) return text
  const pieces = text.split(/[、,，;；]/).map((piece) => piece.trim()).filter(Boolean)
  if (pieces.length <= limit) return text
  return pieces.slice(0, limit).join('、')
}

export function MeaningDisplay({ meaning, partOfSpeech, compact = false, maxMeaningsPerPart }: { meaning: string; partOfSpeech?: string; compact?: boolean; maxMeaningsPerPart?: number }) {
  const parts = splitMeaning(meaning, partOfSpeech).map((part) => ({ ...part, text: limitMeaningText(part.text, maxMeaningsPerPart) }))
  return <div className={compact ? 'meaning-display compact' : 'meaning-display'}>
    {parts.map((part, index) => <div className="meaning-line" key={`${part.label ?? 'meaning'}-${index}`}>
      {part.label && <span className="meaning-pos">{part.label}</span>}
      <span className="meaning-text">{emphasizedMeaningParts(part.text).map((segment, segmentIndex) => segment.bold
        ? <strong className="meaning-primary" key={segmentIndex}>{segment.text}</strong>
        : <span key={segmentIndex}>{segment.text}</span>)}</span>
    </div>)}
  </div>
}
