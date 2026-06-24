import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Task, Project, Attachment, today, getTaskStatus,
  OVERALL_PROJECT_ID, OVERALL_PROJECT,
  OVERALL_NOTES_PROJECT_ID, OVERALL_NOTES_PROJECT,
} from './types'
import { Positions, autoArrange } from './utils'
import { api, checkAuth, setToken, AuthUser, ExportProject } from './api'
import TaskGraph from './components/TaskGraph'
import OverallGraph from './components/OverallGraph'
import OverallNotes from './components/OverallNotes'
import TaskModal from './components/TaskModal'
import NoteEditorFullScreen from './components/NoteEditorFullScreen'
import StatsBar from './components/StatsBar'
import Sidebar, { ExpTask } from './components/Sidebar'
import LoginScreen from './components/LoginScreen'

function genId(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2) }
function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) }

interface BoardState { tasks: Task[]; positions: Positions }

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)

  const [projects, setProjects] = useState<Project[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [positions, setPositions] = useState<Positions>({})
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [loadingBoard, setLoadingBoard] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [editingNotesTask, setEditingNotesTask] = useState<Task | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [headerVisible, setHeaderVisible] = useState(true)
  const [filters, setFilters] = useState({ PENDING: true, DONE: true, OVERDUE: true })

  // Cross-project task cache for Overall view and expiring list
  const [allTasksMap, setAllTasksMap] = useState<Record<string, Task[]>>({})

  // ── History (refs — no re-renders) ────────────────────
  const historyRef = useRef<BoardState[]>([])
  const historyIdxRef = useRef(-1)
  const activeIdRef = useRef<string | null>(null)
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  function pushHistory(t: Task[], p: Positions) {
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1)
    historyRef.current.push(clone({ tasks: t, positions: p }))
    historyIdxRef.current = historyRef.current.length - 1
  }

  const handleUndo = useCallback(() => {
    if (historyIdxRef.current <= 0) return
    historyIdxRef.current--
    const s = clone(historyRef.current[historyIdxRef.current])
    setTasks(s.tasks); setPositions(s.positions)
    const pid = activeIdRef.current
    if (pid && pid !== OVERALL_PROJECT_ID) {
      api.replaceBoardState(pid, s.tasks, s.positions)
      setAllTasksMap(prev => ({ ...prev, [pid]: s.tasks }))
    }
  }, [])

  const handleRedo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return
    historyIdxRef.current++
    const s = clone(historyRef.current[historyIdxRef.current])
    setTasks(s.tasks); setPositions(s.positions)
    const pid = activeIdRef.current
    if (pid && pid !== OVERALL_PROJECT_ID) {
      api.replaceBoardState(pid, s.tasks, s.positions)
      setAllTasksMap(prev => ({ ...prev, [pid]: s.tasks }))
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); handleUndo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); handleRedo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleUndo, handleRedo])

  // ── Auth check on mount ────────────────────────────────
  useEffect(() => {
    checkAuth().then(({ user, needsSetup }) => {
      setUser(user)
      setNeedsSetup(needsSetup)
      setAuthChecking(false)
    })
  }, [])

  async function handleLogout() {
    await api.logout().catch(() => {})
    setToken(null)
    setUser(null)
    setProjects([])
    setActiveId(null)
    setTasks([])
    setPositions({})
    setAllTasksMap({})
  }

  // ── Load projects + all tasks ──────────────────────────
  useEffect(() => {
    if (!user) return
    setLoadingProjects(true)
    api.getProjects()
      .then(async ps => {
        setProjects(ps)
        if (ps.length > 0) {
          const entries = await Promise.all(
            ps.map(p => api.getProjectTasks(p.id)
              .then(t => [p.id, t] as const)
              .catch(() => [p.id, []] as const))
          )
          setAllTasksMap(Object.fromEntries(entries))
          setActiveId(OVERALL_PROJECT_ID)
        }
      })
      .finally(() => setLoadingProjects(false))
  }, [user])

  // ── Load board when project switches ──────────────────
  useEffect(() => {
    if (!activeId || activeId === OVERALL_PROJECT_ID || activeId === OVERALL_NOTES_PROJECT_ID) {
      setTasks([]); setPositions({}); return
    }
    setTasks([])
    setPositions({})
    setLoadingBoard(true)
    const loadingId = activeId
    Promise.all([api.getProjectTasks(activeId), api.getProjectPositions(activeId)])
      .then(([t, p]) => {
        setTasks(t); setPositions(p)
        setAllTasksMap(prev => ({ ...prev, [loadingId]: t }))
        historyRef.current = [clone({ tasks: t, positions: p })]
        historyIdxRef.current = 0
      })
      .finally(() => setLoadingBoard(false))
    setSidebarOpen(false) // Close sidebar when project changes
  }, [activeId])

  // ── Project handlers ───────────────────────────────────
  function handleCreateProject(name: string, color: string) {
    const id = genId()
    const p: Omit<Project, 'taskCount'> = { id, name, color, createdAt: new Date().toISOString(), archived: false }
    setProjects(prev => [...prev, { ...p, taskCount: 0 }])
    setAllTasksMap(prev => ({ ...prev, [id]: [] }))
    api.createProject(p)
    setActiveId(id)
  }

  function handleRenameProject(id: string, name: string) {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p))
    api.updateProject({ id, name })
  }

  function handleArchiveProject(id: string) {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, archived: true } : p))
    api.updateProject({ id, archived: true })
    if (activeId === id) setActiveId(OVERALL_PROJECT_ID)
  }

  function handleUnarchiveProject(id: string) {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, archived: false } : p))
    api.updateProject({ id, archived: false })
    setActiveId(id)
  }

  function handleDeleteProject(id: string) {
    const remaining = projects.filter(p => p.id !== id)
    setProjects(remaining)
    api.deleteProject(id)
    setAllTasksMap(prev => { const n = { ...prev }; delete n[id]; return n })
    if (activeId === id) setActiveId(remaining.length > 0 ? OVERALL_PROJECT_ID : null)
  }

  // ── Task handlers (optimistic + push history) ─────────
  function applyTasks(updated: Task[], newPositions?: Positions) {
    const p = newPositions ?? positions
    setTasks(updated)
    if (activeId && activeId !== OVERALL_PROJECT_ID) {
      setAllTasksMap(prev => ({ ...prev, [activeId]: updated }))
    }
    if (newPositions) setPositions(newPositions)
    pushHistory(updated, p)
    return p
  }

  function handleSave(data: Omit<Task, 'id' | 'completed' | 'completedDate' | 'attachments'>) {
    if (!activeId || activeId === OVERALL_PROJECT_ID || activeId === OVERALL_NOTES_PROJECT_ID) return
    if (editingTask) {
      const updated = tasks.map(t => t.id === editingTask.id ? { ...t, ...data } : t)
      applyTasks(updated)
      api.updateTask(updated.find(t => t.id === editingTask.id)!)
    } else {
      const id = genId()
      const newTask: Task = { id, completed: false, attachments: [], ...data }
      const updated = [...tasks, newTask]
      const xs = Object.values(positions).map(p => p.x)
      const x = xs.length ? Math.max(...xs) + 320 : 60
      const newPositions = { ...positions, [id]: { x, y: 60 } }
      applyTasks(updated, newPositions)
      api.createProjectTask(activeId, newTask)
      api.updatePosition(id, x, 60)
      setProjects(prev => prev.map(p => p.id === activeId ? { ...p, taskCount: p.taskCount + 1 } : p))
    }
    closeModal()
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this task?')) return
    const affected: Task[] = []
    const updated = tasks
      .filter(t => t.id !== id)
      .map(t => {
        if (!t.dependsOn.includes(id)) return t
        const next = { ...t, dependsOn: t.dependsOn.filter(d => d !== id) }
        affected.push(next); return next
      })
    const newPositions = { ...positions }
    delete newPositions[id]
    applyTasks(updated, newPositions)
    affected.forEach(t => api.updateTask(t))
    api.deleteTask(id)
    setProjects(prev => prev.map(p => p.id === activeId ? { ...p, taskCount: Math.max(0, p.taskCount - 1) } : p))
  }

  function handleToggle(id: string) {
    const updated = tasks.map(t =>
      t.id === id ? { ...t, completed: !t.completed, completedDate: !t.completed ? today() : undefined } : t
    )
    applyTasks(updated)
    api.updateTask(updated.find(t => t.id === id)!)
  }

  function handleTaskMove(id: string, x: number, y: number) {
    const newPositions = { ...positions, [id]: { x, y } }
    setPositions(newPositions)
    pushHistory(tasks, newPositions)
    api.updatePosition(id, x, y)
  }

  function handleConnect(fromId: string, toId: string) {
    if (tasks.find(t => t.id === toId)?.dependsOn.includes(fromId)) return
    const updated = tasks.map(t => t.id === toId ? { ...t, dependsOn: [...t.dependsOn, fromId] } : t)
    applyTasks(updated)
    api.updateTask(updated.find(t => t.id === toId)!)
  }

  function handleDisconnect(fromId: string, toId: string) {
    const updated = tasks.map(t => t.id === toId ? { ...t, dependsOn: t.dependsOn.filter(d => d !== fromId) } : t)
    applyTasks(updated)
    api.updateTask(updated.find(t => t.id === toId)!)
  }

  // Patch a single task in both the active board and the cross-project cache
  function patchTask(projectId: string, taskId: string, patch: Partial<Task>) {
    setAllTasksMap(prev => ({
      ...prev,
      [projectId]: (prev[projectId] ?? []).map(t => t.id === taskId ? { ...t, ...patch } : t),
    }))
    if (projectId === activeId) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...patch } : t))
    }
  }

  function handleAttachmentsChange(taskId: string, attachments: Attachment[]) {
    if (!activeId || activeId === OVERALL_PROJECT_ID || activeId === OVERALL_NOTES_PROJECT_ID) return
    patchTask(activeId, taskId, { attachments })
  }

  // Inline notes edit from the Overall Notes view (task may be in any project)
  function handleSaveNotes(taskId: string, projectId: string, notes: string) {
    const task = (allTasksMap[projectId] ?? []).find(t => t.id === taskId)
    if (!task) return
    patchTask(projectId, taskId, { notes })
    api.updateTask({ ...task, notes })
  }

  function handleSaveFullScreenNotes(taskId: string, notes: string) {
    if (!activeId || activeId === OVERALL_PROJECT_ID || activeId === OVERALL_NOTES_PROJECT_ID) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    patchTask(activeId, taskId, { notes })
    api.updateTask({ ...task, notes })
    setEditingNotesTask(null)
  }

  function handleAutoArrange() {
    const next = autoArrange(tasks)
    setPositions(next)
    pushHistory(tasks, next)
    api.updateAllPositions(next)
  }

  // ── Export / Import ────────────────────────────────────
  function handleExport() {
    api.exportAll().then(payload => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `atomic-records-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const importInputRef = useRef<HTMLInputElement>(null)
  function handleImportClick() { importInputRef.current?.click() }
  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const payload = JSON.parse(ev.target?.result as string)
        const importProjects: ExportProject[] = payload.projects ?? []
        if (!importProjects.length) { alert('No projects found in file.'); return }
        await api.importAll(importProjects)
        const updated = await api.getProjects()
        setProjects(updated)
        const entries = await Promise.all(
          updated.map(p => api.getProjectTasks(p.id).then(t => [p.id, t] as const).catch(() => [p.id, []] as const))
        )
        setAllTasksMap(Object.fromEntries(entries))
        alert(`Imported ${importProjects.length} project(s).`)
      } catch (err) {
        alert('Import failed: ' + String(err))
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function closeModal() { setShowModal(false); setEditingTask(null) }

  // ── Derived data ───────────────────────────────────────
  const activeProjects = useMemo(() => projects.filter(p => !p.archived), [projects])
  const archivedProjects = useMemo(() => projects.filter(p => p.archived), [projects])

  const totalTaskCount = useMemo(
    () => activeProjects.reduce((sum, p) => sum + (allTasksMap[p.id]?.length ?? 0), 0),
    [activeProjects, allTasksMap]
  )

  const overallProject: Project = { ...OVERALL_PROJECT, taskCount: totalTaskCount }
  const overallNotesProject: Project = { ...OVERALL_NOTES_PROJECT, taskCount: totalTaskCount }
  const displayProjects = [overallProject, overallNotesProject, ...activeProjects]
  const activeProject = displayProjects.find(p => p.id === activeId)
  const isOverall = activeId === OVERALL_PROJECT_ID
  const isOverallNotes = activeId === OVERALL_NOTES_PROJECT_ID
  const isSpecial = isOverall || isOverallNotes

  const allTasksList = useMemo(
    () => activeProjects.flatMap(p => allTasksMap[p.id] ?? []),
    [activeProjects, allTasksMap]
  )

  const expiringTasks = useMemo((): ExpTask[] => {
    const todayStr = today()
    const limit = new Date()
    limit.setDate(limit.getDate() + 3)
    const limitStr = limit.toISOString().split('T')[0]
    const result: ExpTask[] = []
    activeProjects.forEach(p => {
      ;(allTasksMap[p.id] ?? []).forEach(t => {
        if (!t.completed && t.dueDate >= todayStr && t.dueDate <= limitStr) {
          result.push({ task: t, projectId: p.id, projectName: p.name, projectColor: p.color })
        }
      })
    })
    result.sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate))
    return result
  }, [allTasksMap, activeProjects])

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const status = getTaskStatus(t)
      if (status === 'pending' && !filters.PENDING) return false
      if (status === 'completed' && !filters.DONE) return false
      if (status === 'overdue' && !filters.OVERDUE) return false
      return true
    })
  }, [tasks, filters])

  const filteredAllTasksMap = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const [pid, list] of Object.entries(allTasksMap)) {
      map[pid] = list.filter(t => {
        const status = getTaskStatus(t)
        if (status === 'pending' && !filters.PENDING) return false
        if (status === 'completed' && !filters.DONE) return false
        if (status === 'overdue' && !filters.OVERDUE) return false
        return true
      })
    }
    return map
  }, [allTasksMap, filters])

  if (authChecking) {
    return (
      <div className="h-screen flex items-center justify-center bg-yellow-300">
        <div className="bg-white border-4 border-black px-8 py-6 text-center" style={{ boxShadow: '8px 8px 0 #000' }}>
          <p className="font-black uppercase tracking-widest text-xl animate-pulse">◈ LOADING…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginScreen needsSetup={needsSetup} onAuth={u => { setUser(u); setNeedsSetup(false) }} />
  }

  if (loadingProjects) {
    return (
      <div className="h-screen flex items-center justify-center bg-yellow-300">
        <div className="bg-white border-4 border-black px-8 py-6 text-center" style={{ boxShadow: '8px 8px 0 #000' }}>
          <p className="font-black uppercase tracking-widest text-xl animate-pulse">◈ LOADING…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Sidebar container */}
      <div
        className={`fixed inset-y-0 left-0 z-50 transition-transform md:relative md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Sidebar
          projects={displayProjects}
          archivedProjects={archivedProjects}
          activeId={activeId}
          onSelect={setActiveId}
          onCreate={handleCreateProject}
          onRename={handleRenameProject}
          onDelete={handleDeleteProject}
          onArchive={handleArchiveProject}
          onUnarchive={handleUnarchiveProject}
          expiringTasks={expiringTasks}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0 relative">
        {activeProject && (
          <button
            onClick={() => setHeaderVisible(v => !v)}
            className="md:hidden absolute top-0 right-0 z-40 bg-white border-b-4 border-l-4 border-black px-2 py-1 text-xs font-black hover:bg-yellow-300 transition-colors"
          >
            {headerVisible ? '▲ HIDE' : '▼ MENU'}
          </button>
        )}

        {headerVisible && (
          <header className="shrink-0 border-b-4 border-black z-30 relative"
            style={{ background: activeProject ? activeProject.color : '#FFE500' }}>
          <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden bg-white border-4 border-black font-black flex items-center justify-center shrink-0 px-3 py-2 text-xs uppercase tracking-widest"
              style={{ boxShadow: '2px 2px 0 #000' }}
            >
              ◀ Projects
            </button>
            <div className="mr-1 min-w-0">
              <h1 className="text-lg font-black uppercase tracking-widest leading-none truncate">
                {activeProject ? activeProject.name : 'SELECT A PROJECT'}
              </h1>
              <p className="text-xs font-mono opacity-50">
                {isOverall ? '// all projects consolidated'
                  : isOverallNotes ? '// notes summary'
                  : '// task dependency graph'}
              </p>
            </div>

            {activeProject && (
              <StatsBar
                tasks={isSpecial ? allTasksList : tasks}
                filters={filters}
                onToggle={key => {
                  if (key === 'TOTAL') {
                    const allOn = filters.PENDING && filters.DONE && filters.OVERDUE
                    setFilters({ PENDING: !allOn, DONE: !allOn, OVERDUE: !allOn })
                  } else {
                    setFilters(prev => ({ ...prev, [key as keyof typeof filters]: !prev[key as keyof typeof filters] }))
                  }
                }}
              />
            )}

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono opacity-50 hidden md:block">{user.username}</span>
              <button onClick={handleLogout}
                className="bg-white font-black uppercase tracking-widest px-3 py-2 border-4 border-black hover:bg-black hover:text-white transition-colors text-xs"
                style={{ boxShadow: '3px 3px 0 #000' }} title="Sign out">
                <span className="md:hidden">⎋</span><span className="hidden md:inline">⎋ LOGOUT</span>
              </button>
              <button onClick={handleExport}
                className="bg-white font-black uppercase tracking-widest px-3 py-2 border-4 border-black hover:bg-black hover:text-white transition-colors text-xs hidden sm:block"
                style={{ boxShadow: '3px 3px 0 #000' }} title="Export all data to JSON">
                ↓ EXPORT
              </button>
              <button onClick={handleImportClick}
                className="bg-white font-black uppercase tracking-widest px-3 py-2 border-4 border-black hover:bg-black hover:text-white transition-colors text-xs hidden sm:block"
                style={{ boxShadow: '3px 3px 0 #000' }} title="Import from JSON">
                ↑ IMPORT
              </button>
              <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />

              {activeProject && !isSpecial && (
                <>
                  <button onClick={handleAutoArrange}
                    className="bg-white font-black uppercase tracking-widest px-3 py-2 border-4 border-black hover:bg-black hover:text-white transition-colors text-sm"
                    style={{ boxShadow: '4px 4px 0 #000' }} title="Auto arrange tasks">
                    <span className="md:hidden">⊞</span><span className="hidden md:inline">⊞ ARRANGE</span>
                  </button>
                  <button onClick={() => { setEditingTask(null); setShowModal(true) }}
                    className="bg-black text-white font-black uppercase tracking-widest px-4 py-2 border-4 border-black hover:bg-white hover:text-black transition-colors text-sm"
                    style={{ boxShadow: '4px 4px 0 #000' }} title="Add new task">
                    <span className="md:hidden">+</span><span className="hidden md:inline">+ ADD TASK</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {activeProject && (
            <div className="flex gap-5 px-4 pb-2 items-center flex-wrap">
              {[
                { color: 'bg-blue-400', label: 'PENDING' },
                { color: 'bg-green-400', label: 'COMPLETED' },
                { color: 'bg-red-500', label: 'OVERDUE' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 ${l.color} border-2 border-black`} />
                  <span className="text-xs font-black uppercase tracking-wide opacity-60">{l.label}</span>
                </div>
              ))}
              <span className="text-xs font-mono opacity-40 ml-2 hidden md:block">
                {isOverall
                  ? 'read-only · scroll to zoom · drag to pan'
                  : isOverallNotes
                  ? 'click to expand/collapse · edit notes inline · expanded nodes persist'
                  : 'drag card · drag → to connect · right-click arrow · scroll to zoom · Ctrl+Z/Y undo/redo'}
              </span>
            </div>
          )}
        </header>
        )}

        {!activeProject && (
          <div className="flex-1 flex items-center justify-center" style={{ background: '#f5f0e8' }}>
            <div className="bg-white border-4 border-black p-12 text-center" style={{ boxShadow: '8px 8px 0 #000' }}>
              <div className="text-5xl mb-4 opacity-20">◈</div>
              <p className="font-black uppercase tracking-widest text-gray-500">Create a project to get started</p>
            </div>
          </div>
        )}

        {activeProject && !isSpecial && loadingBoard && (
          <div className="flex-1 flex items-center justify-center" style={{ background: '#f5f0e8' }}>
            <p className="font-black uppercase tracking-widest animate-pulse opacity-40">Loading…</p>
          </div>
        )}

        {activeProject && isOverall && (
          <OverallGraph
            key="overall"
            projects={activeProjects}
            allTasksMap={filteredAllTasksMap}
          />
        )}

        {activeProject && isOverallNotes && (
          <OverallNotes
            key="overall-notes"
            projects={activeProjects}
            allTasksMap={filteredAllTasksMap}
            onSaveNotes={handleSaveNotes}
          />
        )}

        {activeProject && !isSpecial && !loadingBoard && (
          <TaskGraph
            key={activeId}
            tasks={filteredTasks} positions={positions}
            onTaskMove={handleTaskMove}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onAutoArrange={handleAutoArrange}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onEdit={t => { setEditingTask(t); setShowModal(true) }}
            onDelete={handleDelete}
            onToggle={handleToggle}
            onNoteClick={t => setEditingNotesTask(t)}
          />
        )}
      </div>

      {showModal && activeProject && !isSpecial && (
        <TaskModal
          task={editingTask}
          allTasks={tasks}
          onSave={handleSave}
          onClose={closeModal}
          onAttachmentsChange={handleAttachmentsChange}
        />
      )}

      {editingNotesTask && activeProject && !isSpecial && (
        <NoteEditorFullScreen
          task={editingNotesTask}
          onSave={handleSaveFullScreenNotes}
          onClose={() => setEditingNotesTask(null)}
        />
      )}
    </div>
  )
}
