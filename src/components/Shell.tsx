import { BarChart3, FolderHeart, Home, PanelLeftClose, PanelLeftOpen, PencilLine, RefreshCw, Settings } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

export type ViewName = 'home' | 'setup' | 'study' | 'libraries' | 'archive' | 'stats' | 'settings'

interface ShellProps {
  view: ViewName
  onNavigate: (view: ViewName) => void
  children: ReactNode
  studyActive?: boolean
  updateAvailable?: boolean
  onUpdate?: () => void
}

const items = [
  { id: 'home' as const, label: '学习', icon: Home },
  { id: 'archive' as const, label: '学习档案', icon: FolderHeart },
  { id: 'stats' as const, label: '统计', icon: BarChart3 },
  { id: 'settings' as const, label: '设置', icon: Settings },
]

export function Shell({ view, onNavigate, children, studyActive, updateAvailable, onUpdate }: ShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('a4-sidebar-collapsed') === 'true')
  useEffect(() => {
    const viewport = window.visualViewport
    const updateViewport = () => {
      document.documentElement.style.setProperty('--visible-height', `${viewport?.height ?? window.innerHeight}px`)
      document.documentElement.style.setProperty('--keyboard-inset', `${Math.max(0, window.innerHeight - (viewport?.height ?? window.innerHeight) - (viewport?.offsetTop ?? 0))}px`)
    }
    updateViewport()
    viewport?.addEventListener('resize', updateViewport)
    viewport?.addEventListener('scroll', updateViewport)
    window.addEventListener('resize', updateViewport)
    return () => { viewport?.removeEventListener('resize', updateViewport); viewport?.removeEventListener('scroll', updateViewport); window.removeEventListener('resize', updateViewport) }
  }, [])

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      localStorage.setItem('a4-sidebar-collapsed', String(!current))
      return !current
    })
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}${view === 'study' ? ' focus-study' : ''}`}>
      <header className="topbar">
        {view === 'study' ? <div className="brand"><span className="brand-mark">A4</span><span>A4词忆</span></div> : <button className="brand" onClick={() => onNavigate('home')} aria-label="返回首页"><span className="brand-mark">A4</span><span>A4词忆</span></button>}
        <div className="topbar-actions">{studyActive && <span className="active-study-dot">学习进行中</span>}</div>
      </header>
      {updateAvailable && <div className="update-banner"><span>发现新版本</span>{view === 'study' ? <small>完成或暂时离开本轮学习后即可更新</small> : <button onClick={onUpdate}><RefreshCw size={15} />立即更新</button>}</div>}
      <main className={view === 'study' ? 'main study-main' : 'main'}>{children}</main>
      <nav className={`${view === 'study' ? 'bottom-nav study-navigation' : 'bottom-nav'}${sidebarCollapsed ? ' collapsed' : ''}`} aria-label="主导航">
          {items.map(({ id, label, icon: Icon }) => (
            <button key={id} className={(view === id || (id === 'home' && ['setup', 'libraries', 'study'].includes(view))) ? 'nav-item active' : 'nav-item'} onClick={() => onNavigate(id)}>
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
          <div className="sidebar-illustration" aria-hidden="true">
            <div className="sidebar-paper-art"><span>focus</span><span>memory</span><span>recall</span></div>
            <PencilLine />
          </div>
      </nav>
      <button className="sidebar-toggle" onClick={toggleSidebar} aria-label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'} title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
    </div>
  )
}
