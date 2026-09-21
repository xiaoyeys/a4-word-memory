import { BookOpenCheck, MapPin, PenLine, RotateCcw, X } from 'lucide-react'

export function Onboarding({ onDone }: { onDone: () => void }) {
  const steps = [
    { icon: BookOpenCheck, title: '先记三遍', text: '看清单词、音标和释义，每记完一遍主动确认。' },
    { icon: PenLine, title: '再拼出来', text: '隐藏答案后正确拼写，才可以写到纸面。' },
    { icon: MapPin, title: '建立空间线索', text: '手动选点或自动随机，将单词锁定在A4纸上。' },
    { icon: RotateCcw, title: '每三词累积回忆', text: '按书写顺序，从第一个词开始回忆所有已写单词。' },
  ]
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <section className="modal onboarding">
        <button className="icon-button modal-close" onClick={onDone} aria-label="关闭新手引导"><X /></button>
        <p className="eyebrow">第一次使用</p>
        <h1 id="onboarding-title">四步建立一张记忆纸</h1>
        <div className="onboarding-grid">
          {steps.map(({ icon: Icon, title, text }, index) => (
            <div className="onboarding-step" key={title}>
              <span className="step-index">{index + 1}</span>
              <Icon size={24} />
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          ))}
        </div>
        <button className="primary wide" onClick={onDone}>开始使用</button>
      </section>
    </div>
  )
}
