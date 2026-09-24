import { BookOpenCheck, ChevronLeft, ChevronRight, MapPin, PenLine, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'

const steps = [
  { icon: BookOpenCheck, title: '先设置一次学习计划', text: '在首页打开“调整计划”，选好每日数量和默认方法。以后点击“学习新词”就会直接开始。', exampleTitle: '示例入口', exampleText: '调整计划 → 保存计划 → 学习新词' },
  { icon: BookOpenCheck, title: '看单词并记三遍', text: '先看单词、音标和释义。点击单词可以听发音，每完成一遍就点一次按钮。', exampleTitle: 'maintain', exampleText: '/meɪnˈteɪn/ · 维持；保养　　已完成 1 / 3 遍' },
  { icon: PenLine, title: '遮住答案，拼写出来', text: '三遍之后系统会要求你凭记忆拼写。拼写正确，才能把它放到 A4 纸上。', exampleTitle: '拼写当前单词', exampleText: '根据刚才的记忆，完整拼写这个单词' },
  { icon: MapPin, title: '把单词放到 A4 纸上', text: '手动点击纸面空白处，或使用自动随机位置。确认后，这个位置就是它的空间线索。', exampleTitle: '选择纸面位置', exampleText: '点击纸面空白处 → 确认放置' },
  { icon: RotateCcw, title: '每三个词开始回忆', text: '写完三个词后，从第一个位置开始，按写下的顺序找词并回忆释义。', exampleTitle: '第 1 轮累积回忆', exampleText: '找到单词 → 先在心里说释义 → 选择记得、模糊或忘记' },
]

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [stepIndex, setStepIndex] = useState(0)
  const step = steps[stepIndex]
  const Icon = step.icon
  const isLast = stepIndex === steps.length - 1

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <section className="modal onboarding onboarding-walkthrough">
        <button className="icon-button modal-close" onClick={onDone} aria-label="关闭新手引导"><X /></button>
        <p className="eyebrow">第一次使用 · 学习示例</p>
        <h1 id="onboarding-title">跟着示例走一遍</h1>
        <div className="onboarding-progress" aria-label={`第${stepIndex + 1}步，共${steps.length}步`}>
          <span>第 {stepIndex + 1} / {steps.length} 步</span>
          <div>{steps.map((item, index) => <i className={index <= stepIndex ? 'active' : ''} key={item.title} />)}</div>
        </div>
        <div className="onboarding-walkthrough-body">
          <div className="onboarding-walkthrough-icon"><Icon size={30} /></div>
          <div>
            <p className="onboarding-step-label">步骤 {stepIndex + 1}</p>
            <h2>{step.title}</h2>
            <p className="onboarding-description">{step.text}</p>
            <div className="onboarding-example"><strong>{step.exampleTitle}</strong><span>{step.exampleText}</span></div>
          </div>
        </div>
        <div className="onboarding-actions">
          <button className="text-button" onClick={onDone}>跳过引导</button>
          <div>
            <button className="secondary" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={stepIndex === 0}><ChevronLeft size={17} />上一步</button>
            <button className="primary" onClick={() => isLast ? onDone() : setStepIndex((current) => current + 1)}>{isLast ? '开始使用' : '下一步'}{!isLast && <ChevronRight size={17} />}</button>
          </div>
        </div>
      </section>
    </div>
  )
}
