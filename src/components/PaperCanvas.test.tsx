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

  it('keeps the mobile recall guide within the paper workspace', () => {
    const { container } = render(<PaperCanvas placed={[]} words={new Map()} currentPage={0} onPageChange={() => undefined} onWordClick={() => undefined} onPreview={() => undefined} showSequence={false} onSpeak={() => undefined} mobileExpanded onMobileToggle={() => undefined} mobileGuide={<p>顺序 4 / 6</p>} />)
    const paper = container.querySelector('.paper-workspace')
    expect(paper).toContainElement(container.querySelector('.mobile-paper-guide p'))
    expect(container.querySelector('.mobile-paper-guide')).toHaveTextContent('顺序 4 / 6')
    expect(paper).toHaveClass('has-mobile-guide')
  })
})
