import { BarChart3, BookOpen, Home, Library, RefreshCw, Settings } from 'lucide-react'
import type { ReactNode } from 'react'

export type ViewName = 'home' | 'setup' | 'study' | 'libraries' | 'stats' | 'settings'

interface ShellProps {
  view: ViewName
  onNavigate: (view: ViewName) => void
  children: ReactNode
  studyActive?: boolean
  updateAvailable?: boolean
  onUpdate?: () => void
}

const items = [
  { id: 'home' as const, label: '首页', icon: Home },
  { id: 'setup' as const, label: '开始学习', icon: BookOpen },
  { id: 'libraries' as const, label: '词库', icon: Library },
  { id: 'stats' as const, label: '统计', icon: BarChart3 },
  { id: 'settings' as const, label: '设置', icon: Settings },
]

export function Shell({ view, onNavigate, children, studyActive, updateAvailable, onUpdate }: ShellProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => onNavigate('home')} aria-label="返回首页">
          <span className="brand-mark">A4</span>
          <span>A4词忆</span>
        </button>
        {studyActive && <span className="active-study-dot">学习进行中</span>}
      </header>
      {updateAvailable && <div className="update-banner"><span>发现新版本</span>{view === 'study' ? <small>完成或暂时离开本轮学习后即可更新</small> : <button onClick={onUpdate}><RefreshCw size={15} />立即更新</button>}</div>}
      <main className={view === 'study' ? 'main study-main' : 'main'}>{children}</main>
      {view !== 'study' && (
        <nav className="bottom-nav" aria-label="主导航">
          {items.map(({ id, label, icon: Icon }) => (
            <button key={id} className={view === id ? 'nav-item active' : 'nav-item'} onClick={() => onNavigate(id)}>
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
