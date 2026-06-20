import { useState, useRef, useEffect } from 'react'
import { Project, Task, PROJECT_PALETTE, OVERALL_PROJECT_ID, formatDate } from '../types'

export interface ExpTask {
  task: Task
  projectId: string
  projectName: string
  projectColor: string
}

interface Props {
  projects: Project[]
  archivedProjects: Project[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: (name: string, color: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  expiringTasks: ExpTask[]
}

export default function Sidebar({ projects, archivedProjects, activeId, onSelect, onCreate, onRename, onDelete, onArchive, onUnarchive, expiringTasks }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PROJECT_PALETTE[0])
  const [showArchived, setShowArchived] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId || creating) inputRef.current?.focus()
  }, [editingId, creating])

  function startEdit(p: Project) {
    setEditingId(p.id)
    setEditValue(p.name)
  }

  function confirmEdit(p: Project) {
    if (editValue.trim()) onRename(p.id, editValue.trim())
    setEditingId(null)
  }

  function startCreate() {
    const used = projects.filter(p => p.id !== OVERALL_PROJECT_ID).length
    setNewColor(PROJECT_PALETTE[used % PROJECT_PALETTE.length])
    setNewName('')
    setCreating(true)
  }

  function confirmCreate() {
    if (newName.trim()) onCreate(newName.trim(), newColor)
    setCreating(false)
    setNewName('')
  }

  function handleDeleteClick(e: React.MouseEvent, p: Project) {
    e.stopPropagation()
    if (!confirm(`Delete project "${p.name}" and all its tasks?`)) return
    onDelete(p.id)
  }

  function handleArchiveClick(e: React.MouseEvent, p: Project) {
    e.stopPropagation()
    onArchive(p.id)
  }

  return (
    <aside
      className="flex flex-col shrink-0 border-r-4 border-black overflow-hidden"
      style={{ width: 220, background: '#111', minHeight: 0 }}
    >
      {/* Brand */}
      <div className="px-4 py-4 border-b-4 border-black shrink-0" style={{ background: '#000' }}>
        <p className="text-yellow-300 font-black text-base uppercase tracking-widest leading-tight">◈ ATOMIC</p>
        <p className="text-yellow-300 font-black text-base uppercase tracking-widest leading-tight">RECORDS</p>
        <p className="text-gray-500 font-mono text-xs mt-1">// task graph</p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Project list */}
        <div className="px-3 pt-3 pb-1">
          <p className="text-gray-500 font-black text-xs uppercase tracking-widest">Projects</p>
        </div>

        {projects.map(p => {
          const isActive = p.id === activeId
          const isEditing = editingId === p.id
          const isOverall = p.id === OVERALL_PROJECT_ID

          return (
            <div
              key={p.id}
              onClick={() => !isEditing && onSelect(p.id)}
              className="group mx-2 mb-1 cursor-pointer"
              style={{
                background: isActive ? p.color : 'transparent',
                borderLeft: `4px solid ${p.color}`,
              }}
            >
              <div className="flex items-center gap-2 px-2 py-2">
                {isEditing ? (
                  <input
                    ref={inputRef}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') confirmEdit(p)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={() => confirmEdit(p)}
                    onClick={e => e.stopPropagation()}
                    className="flex-1 bg-white text-black font-black text-xs px-1 py-0.5 min-w-0 outline-none"
                    style={{ border: '2px solid #000' }}
                  />
                ) : (
                  <>
                    <span
                      className={`flex-1 font-black text-xs uppercase tracking-wide truncate ${isActive ? 'text-black' : 'text-gray-300 group-hover:text-white'}`}
                      onDoubleClick={e => {
                        if (isOverall) return
                        e.stopPropagation()
                        startEdit(p)
                      }}
                    >
                      {isOverall && <span className="opacity-50 mr-1">◈</span>}
                      {p.name}
                    </span>
                    <span className={`text-xs font-mono shrink-0 ${isActive ? 'text-black opacity-60' : 'text-gray-600 group-hover:text-gray-400'}`}>
                      {p.taskCount}
                    </span>
                    {!isOverall && (
                      <>
                        <button
                          onClick={e => handleArchiveClick(e, p)}
                          className={`shrink-0 w-4 h-4 font-black text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? 'text-black hover:text-blue-700' : 'text-gray-500 hover:text-blue-300'}`}
                          title="Archive project"
                        >▣</button>
                        <button
                          onClick={e => handleDeleteClick(e, p)}
                          className={`shrink-0 w-4 h-4 font-black text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${isActive ? 'text-black hover:text-red-700' : 'text-gray-500 hover:text-red-400'}`}
                          title="Delete project"
                        >×</button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}

        {/* New project inline input */}
        {creating && (
          <div className="mx-2 mb-1 border-4 border-yellow-300" style={{ background: '#222' }}>
            <div className="flex gap-1 px-2 pt-2 flex-wrap">
              {PROJECT_PALETTE.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className="w-4 h-4 shrink-0"
                  style={{
                    background: c,
                    border: newColor === c ? '2px solid #fff' : '2px solid transparent',
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-1 px-2 pb-2 pt-1">
              <div className="w-1 h-5 shrink-0" style={{ background: newColor }} />
              <input
                ref={inputRef}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') confirmCreate()
                  if (e.key === 'Escape') { setCreating(false); setNewName('') }
                }}
                placeholder="Project name…"
                className="flex-1 bg-transparent text-white font-black text-xs px-1 py-0.5 min-w-0 outline-none placeholder-gray-600"
                style={{ borderBottom: '2px solid #555' }}
              />
              <button
                onClick={confirmCreate}
                className="text-yellow-300 font-black text-xs hover:text-white"
              >✓</button>
            </div>
          </div>
        )}

        {/* Archived section */}
        {archivedProjects.length > 0 && (
          <div className="border-t-4 border-black mt-2">
            <button
              onClick={() => setShowArchived(v => !v)}
              className="w-full flex items-center gap-1 px-3 pt-3 pb-1 text-left"
            >
              <span className="text-gray-500 font-black text-xs uppercase tracking-widest">
                {showArchived ? '▾' : '▸'} Archived
              </span>
              <span className="text-gray-600 font-mono text-xs ml-auto">{archivedProjects.length}</span>
            </button>
            {showArchived && archivedProjects.map(p => (
              <div
                key={p.id}
                className="group mx-2 mb-1 flex items-center gap-2 px-2 py-2"
                style={{ borderLeft: `4px solid ${p.color}`, background: 'rgba(255,255,255,0.03)' }}
              >
                <span className="flex-1 font-black text-xs uppercase tracking-wide truncate text-gray-400">
                  {p.name}
                </span>
                <span className="text-xs font-mono shrink-0 text-gray-600">{p.taskCount}</span>
                <button
                  onClick={() => onUnarchive(p.id)}
                  className="shrink-0 text-xs font-black uppercase tracking-wider text-yellow-300 border-2 border-yellow-300 px-1.5 py-0.5 hover:bg-yellow-300 hover:text-black transition-colors"
                  title="Restore project"
                >Restore</button>
                <button
                  onClick={e => handleDeleteClick(e, p)}
                  className="shrink-0 w-4 h-4 font-black text-xs flex items-center justify-center text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete project"
                >×</button>
              </div>
            ))}
          </div>
        )}

        {/* Expiring Soon section */}
        {expiringTasks.length > 0 && (
          <div className="border-t-4 border-black mt-2">
            <div className="px-3 pt-3 pb-1">
              <p className="text-red-400 font-black text-xs uppercase tracking-widest">⚠ Expiring Soon</p>
            </div>
            {expiringTasks.map(({ task, projectId, projectName, projectColor }) => (
              <div
                key={task.id}
                className="mx-2 mb-1.5 px-2 py-1.5 cursor-pointer hover:bg-white hover:bg-opacity-10 transition-colors"
                style={{ borderLeft: `3px solid ${projectColor}`, background: 'rgba(255,255,255,0.04)' }}
                onClick={() => onSelect(projectId)}
                title={`Go to ${projectName}`}
              >
                <p className={`text-xs font-black truncate ${task.completed ? 'line-through opacity-40 text-gray-400' : 'text-white'}`}>
                  {task.title}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-xs font-mono truncate" style={{ color: projectColor, opacity: 0.7, maxWidth: 90 }}>
                    {projectName}
                  </span>
                  <span className="text-xs font-black font-mono ml-auto shrink-0 text-red-400">
                    {formatDate(task.dueDate)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New project button */}
      <div className="p-3 border-t-4 border-black shrink-0" style={{ background: '#000' }}>
        <button
          onClick={startCreate}
          className="w-full py-2 font-black text-xs uppercase tracking-widest border-4 border-yellow-300 text-yellow-300 hover:bg-yellow-300 hover:text-black transition-colors"
          style={{ boxShadow: '3px 3px 0 #FFE500' }}
        >
          + New Project
        </button>
      </div>
    </aside>
  )
}
