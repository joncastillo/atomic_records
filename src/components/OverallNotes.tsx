import { useState, useEffect } from 'react'
import { Task, Project, getTaskStatus, TaskStatus } from '../types'
import { downloadAttachment } from '../api'
import RichTextEditor from './RichTextEditor'

interface Props {
  projects: Project[]
  allTasksMap: Record<string, Task[]>
  onSaveNotes: (taskId: string, projectId: string, notes: string) => void
}

const STORAGE_KEY = 'overall_notes_expanded'

const STATUS_DOT: Record<TaskStatus, string> = {
  pending: 'bg-blue-400',
  completed: 'bg-green-500',
  overdue: 'bg-red-500',
}

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch (_) { /* ignore */ }
  return new Set()
}

export default function OverallNotes({ projects, allTasksMap, onSaveNotes }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  // Persist expansion across sessions
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...expanded])) } catch (_) { /* ignore */ }
  }, [expanded])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function expandAll() {
    const ids = new Set<string>()
    projects.forEach(p => {
      ids.add(p.id)
      ;(allTasksMap[p.id] ?? []).forEach(t => ids.add(t.id))
    })
    setExpanded(ids)
  }

  function collapseAll() {
    setExpanded(new Set())
  }

  function startEdit(task: Task) {
    setEditingId(task.id)
    setDraft(task.notes ?? '')
  }

  function saveEdit(task: Task, projectId: string) {
    onSaveNotes(task.id, projectId, draft.trim())
    setEditingId(null)
  }

  const hasAny = projects.some(p => (allTasksMap[p.id] ?? []).length > 0)

  if (!hasAny) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: '#f5f0e8' }}>
        <div className="bg-white border-4 border-black p-12 text-center" style={{ boxShadow: '8px 8px 0 #000' }}>
          <div className="text-5xl mb-4 opacity-20">◈</div>
          <p className="font-black uppercase tracking-widest text-gray-500">No tasks across all projects</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: '#f5f0e8' }}>
      <div className="max-w-3xl mx-auto p-6">
        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={expandAll}
            className="bg-white font-black uppercase tracking-widest px-3 py-1.5 border-4 border-black hover:bg-black hover:text-white transition-colors text-xs"
            style={{ boxShadow: '3px 3px 0 #000' }}
          >⊕ Expand All</button>
          <button
            onClick={collapseAll}
            className="bg-white font-black uppercase tracking-widest px-3 py-1.5 border-4 border-black hover:bg-black hover:text-white transition-colors text-xs"
            style={{ boxShadow: '3px 3px 0 #000' }}
          >⊖ Collapse All</button>
        </div>

        {projects.map(p => {
          const tasks = allTasksMap[p.id] ?? []
          const projOpen = expanded.has(p.id)
          const done = tasks.filter(t => t.completed).length
          return (
            <div key={p.id} className="mb-3 border-4 border-black bg-white" style={{ boxShadow: '5px 5px 0 #000' }}>
              {/* Project header */}
              <button
                onClick={() => toggle(p.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left border-b-4 border-black"
                style={{ background: p.color }}
              >
                <span className="font-black text-sm shrink-0">{projOpen ? '▾' : '▸'}</span>
                <span className="font-black uppercase tracking-widest text-sm truncate flex-1">{p.name}</span>
                <span className="text-xs font-mono font-black opacity-70 shrink-0">{done}/{tasks.length} done</span>
              </button>

              {/* Tasks */}
              {projOpen && (
                <div className="divide-y-2 divide-black">
                  {tasks.length === 0 && (
                    <p className="px-4 py-3 text-xs font-mono opacity-40">No tasks.</p>
                  )}
                  {tasks.map(task => {
                    const taskOpen = expanded.has(task.id)
                    const status = getTaskStatus(task)
                    const isEditing = editingId === task.id
                    return (
                      <div key={task.id}>
                        {/* Task header */}
                        <button
                          onClick={() => toggle(task.id)}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-yellow-50 transition-colors"
                        >
                          <span className="font-black text-xs shrink-0 opacity-60">{taskOpen ? '▾' : '▸'}</span>
                          {task.labelColor && (
                            <span className="w-3 h-3 border-2 border-black shrink-0" style={{ background: task.labelColor }} />
                          )}
                          <span className={`w-2.5 h-2.5 rounded-full border border-black shrink-0 ${STATUS_DOT[status]}`} />
                          <span className={`font-black text-xs uppercase tracking-wide truncate flex-1 ${task.completed ? 'line-through opacity-50' : ''}`}>
                            {task.title}
                          </span>
                          {task.attachments?.length > 0 && (
                            <span className="text-xs font-mono opacity-50 shrink-0">📎{task.attachments.length}</span>
                          )}
                        </button>

                        {/* Task body: notes + attachments */}
                        {taskOpen && (
                          <div className="px-4 pb-3 pl-9">
                            {task.description && (
                              <p className="text-xs text-gray-600 font-mono mb-2 whitespace-pre-wrap break-words">{task.description}</p>
                            )}

                            {/* Notes (editable) */}
                            <div className="mb-2">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-black uppercase tracking-widest opacity-40">Notes</span>
                                {!isEditing && (
                                  <button
                                    onClick={() => startEdit(task)}
                                    className="text-xs font-black uppercase tracking-wider border-2 border-black px-1.5 py-0.5 hover:bg-black hover:text-white transition-colors"
                                  >Edit</button>
                                )}
                              </div>
                              {isEditing ? (
                                <div>
                                  <div className="bg-white border-4 border-black" style={{ minHeight: 150 }}>
                                    <RichTextEditor
                                      value={draft}
                                      onChange={setDraft}
                                      autoFocus
                                    />
                                  </div>
                                  <div className="flex gap-2 mt-2">
                                    <button
                                      onClick={() => saveEdit(task, p.id)}
                                      className="bg-black text-yellow-300 font-black uppercase tracking-wider text-xs px-3 py-1 border-2 border-black hover:bg-yellow-300 hover:text-black transition-colors"
                                    >Save</button>
                                    <button
                                      onClick={() => setEditingId(null)}
                                      className="bg-white font-black uppercase tracking-wider text-xs px-3 py-1 border-2 border-black hover:bg-gray-100 transition-colors"
                                    >Cancel</button>
                                  </div>
                                </div>
                              ) : task.notes ? (
                                <div 
                                  className="text-xs text-gray-800 font-mono whitespace-pre-wrap break-words border-l-4 border-black pl-2 ql-editor px-0 py-1"
                                  style={{ minHeight: 'auto' }}
                                  dangerouslySetInnerHTML={{ __html: task.notes }}
                                />
                              ) : (
                                <p className="text-xs font-mono opacity-30 italic">No notes yet.</p>
                              )}
                            </div>

                            {/* Attachments */}
                            {task.attachments?.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {task.attachments.map(att => (
                                  <button
                                    key={att.id}
                                    onClick={() => downloadAttachment(att).catch(e => alert('Download failed: ' + String(e)))}
                                    className="text-xs font-mono border-2 border-black px-1.5 py-0.5 bg-white hover:bg-yellow-200 transition-colors max-w-full truncate"
                                    title={`Download ${att.filename}`}
                                  >📎 {att.filename}</button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
