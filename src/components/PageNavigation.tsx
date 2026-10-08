import { ArrowLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { goBackPage, goToPage } from '../lib/navigation'

export function PageBack({ fallback, label = '返回' }: { fallback: string; label?: string }) {
  const trail: string[] = window.history.state?.a4Trail ?? []
  const previous = trail[trail.length - 1]
  const titles: Record<string, string> = { home: '学习', setup: '调整计划', 'setup/extra': '加量学习', 'setup/weak': '薄弱加练', archive: '学习档案', 'archive/words': '收藏单词', stats: '统计', settings: '设置' }
  const title = previous && (titles[previous] || (previous.includes('/methods') ? '学习流程' : previous.startsWith('setup/books') ? '词书' : previous.startsWith('archive/paper/') ? '记忆纸' : previous.startsWith('stats/words') ? '已学单词' : undefined))
  return <button type="button" className="page-back" onClick={() => goBackPage(fallback)}><ArrowLeft size={18} />{title ? `返回${title}` : label}</button>
}

export function PageLink({ to, title, description, icon }: { to: string; title: string; description?: string; icon?: ReactNode }) {
  return <button type="button" className="page-link" onClick={() => goToPage(to)}>{icon && <span className="page-link-icon">{icon}</span>}<span className="page-link-copy"><strong>{title}</strong>{description && <small>{description}</small>}</span><ChevronRight size={18} /></button>
}
