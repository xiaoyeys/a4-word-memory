import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { PaperCanvas } from './PaperCanvas'

function ManualPaper() {
  const [page, setPage] = useState(0)
  return <PaperCanvas placed={[]} words={new Map()} currentPage={page} onPageChange={setPage} onWordClick={() => undefined} onPreview={() => undefined} placing={{ word: 'maintain', width: 120, height: 40, fontSize: 30 }} showSequence={false} onSpeak={() => undefined} mobileExpanded={false} onMobileToggle={() => undefined} />
}

describe('PaperCanvas', () => {
  it('allows manual placement to create another A4 page', () => {
    render(<ManualPaper />)
    fireEvent.click(screen.getByRole('button', { name: '新建一页' }))
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })
})
