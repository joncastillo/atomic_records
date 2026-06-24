import { useState, useEffect, useRef } from 'react'
import { Task, Attachment, today, LABEL_PALETTE, formatBytes } from '../types'
import { api, downloadAttachment, fileToBase64 } from '../api'
import RichTextEditor from './RichTextEditor'

interface Props {
  task?: Task | null
  allTasks: Task[]
  onSave: (data: Omit<Task, 'id' | 'completed' | 'completedDate' | 'attachments'>) => void
  onClose: () => void
  // Sync attachment changes back into the board state (cards / overall notes)
  onAttachmentsChange?: (taskId: string, attachments: Attachment[]) => void
}

const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20 MB

export default function TaskModal({ task, allTasks, onSave, onClose, onAttachmentsChange }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [labelColor, setLabelColor] = useState<string>('')
  const [createdDate, setCreatedDate] = useState(today())
  const [dueDate, setDueDate] = useState(today())
  const [dependsOn, setDependsOn] = useState<string[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description)
      setNotes(task.notes ?? '')
      setLabelColor(task.labelColor ?? '')
      setCreatedDate(task.createdDate)
      setDueDate(task.dueDate)
      setDependsOn(task.dependsOn)
      setAttachments(task.attachments ?? [])
    } else {
      setTitle(''); setDescription(''); setNotes(''); setLabelColor('')
      setCreatedDate(today()); setDueDate(today()); setDependsOn([]); setAttachments([])
    }
  }, [task])

  function toggleDep(id: string) {
    setDependsOn(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !dueDate) return
    onSave({
      title: title.trim(),
      description: description.trim(),
      notes: notes.trim(),
      labelColor: labelColor || undefined,
      createdDate, dueDate, dependsOn,
    })
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !task) return
    setUploading(true)
    try {
      let next = attachments
      for (const file of Array.from(files)) {
        if (file.size > MAX_FILE_BYTES) {
          alert(`"${file.name}" is too large (max ${formatBytes(MAX_FILE_BYTES)}).`)
          continue
        }
        const data = await fileToBase64(file)
        const att = await api.uploadAttachment(task.id, { filename: file.name, mime: file.type, data })
        next = [...next, att]
        setAttachments(next)
      }
      onAttachmentsChange?.(task.id, next)
    } catch (err) {
      alert('Upload failed: ' + String(err))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleRemoveAttachment(att: Attachment) {
    if (!task) return
    if (!confirm(`Remove "${att.filename}"?`)) return
    try {
      await api.deleteAttachment(att.id)
      const next = attachments.filter(a => a.id !== att.id)
      setAttachments(next)
      onAttachmentsChange?.(task.id, next)
    } catch (err) {
      alert('Delete failed: ' + String(err))
    }
  }

  // Candidates: all tasks except the one being edited (can't depend on itself)
  const candidates = allTasks.filter(t => t.id !== task?.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white border-4 border-black shadow-brutal-lg w-full max-w-lg mx-4 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-yellow-300 border-b-4 border-black px-6 py-4 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-black uppercase tracking-wider">
            {task ? '// EDIT TASK' : '// NEW TASK'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 border-2 border-black font-black text-lg flex items-center justify-center hover:bg-black hover:text-yellow-300 transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest mb-1">Task Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Enter task title..."
              required
              autoComplete="nope"
              autoCorrect="off"
              spellCheck="false"
              className="w-full px-3 py-2 font-mono text-sm focus:outline-none focus:bg-yellow-50 bg-white"
              style={{ border: '3px solid black' }}
            />
          </div>

          {/* Label colour */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest mb-1">Label Colour</label>
            <div className="flex gap-2 flex-wrap items-center">
              {LABEL_PALETTE.map(c => {
                const isNone = c === ''
                const selected = labelColor === c
                return (
                  <button
                    key={c || 'none'}
                    type="button"
                    onClick={() => setLabelColor(c)}
                    title={isNone ? 'No label' : c}
                    className="w-7 h-7 flex items-center justify-center font-black text-xs"
                    style={{
                      background: isNone ? '#fff' : c,
                      border: selected ? '3px solid #000' : '2px solid #999',
                      boxShadow: selected ? '2px 2px 0 #000' : 'none',
                    }}
                  >
                    {isNone ? '∅' : selected ? '✓' : ''}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What needs to be done?"
              rows={3}
              autoComplete="nope"
              autoCorrect="off"
              spellCheck="false"
              className="w-full px-3 py-2 font-mono text-sm focus:outline-none focus:bg-yellow-50 bg-white resize-none"
              style={{ border: '3px solid black' }}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest mb-1">
              Notes
              <span className="opacity-40 ml-2 normal-case">(running notes / context)</span>
            </label>
            <div className="bg-white border-black" style={{ border: '3px solid black', minHeight: 120 }}>
              <RichTextEditor
                value={notes}
                onChange={setNotes}
                placeholder="Add notes…"
                className="w-full font-mono text-sm"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest mb-1">Created Date</label>
              <input
                type="date"
                value={createdDate}
                onChange={e => setCreatedDate(e.target.value)}
                className="w-full px-3 py-2 font-mono text-sm focus:outline-none focus:bg-yellow-50 bg-white"
                style={{ border: '3px solid black' }}
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest mb-1">Due Date *</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                required
                className="w-full px-3 py-2 font-mono text-sm focus:outline-none focus:bg-yellow-50 bg-white"
                style={{ border: '3px solid black' }}
              />
            </div>
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest mb-1">Attachments</label>
            {!task ? (
              <p className="text-xs font-mono opacity-50 border-2 border-dashed border-gray-400 px-3 py-2">
                Save the task first to attach files.
              </p>
            ) : (
              <div className="border-black bg-white" style={{ border: '3px solid black' }}>
                {attachments.length > 0 && (
                  <div className="divide-y-2 divide-black">
                    {attachments.map(att => (
                      <div key={att.id} className="flex items-center gap-2 px-3 py-2">
                        <span className="shrink-0">📎</span>
                        <button
                          type="button"
                          onClick={() => downloadAttachment(att).catch(e => alert('Download failed: ' + String(e)))}
                          className="text-xs font-black truncate text-left hover:underline flex-1 min-w-0"
                          title={`Download ${att.filename}`}
                        >
                          {att.filename}
                        </button>
                        <span className="text-xs font-mono opacity-40 shrink-0">{formatBytes(att.size)}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAttachment(att)}
                          className="shrink-0 w-5 h-5 border-2 border-black font-black text-xs hover:bg-red-500 hover:text-white transition-colors"
                          title="Remove attachment"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="px-3 py-2 border-t-2 border-black">
                  <input ref={fileRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="text-xs font-black uppercase tracking-widest border-2 border-black px-3 py-1.5 hover:bg-black hover:text-yellow-300 transition-colors disabled:opacity-40"
                  >
                    {uploading ? 'Uploading…' : '+ Attach File'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Dependencies */}
          {candidates.length > 0 && (
            <div>
              <label className="block text-xs font-black uppercase tracking-widest mb-1">
                Depends On
                <span className="opacity-40 ml-2 normal-case">(tasks that must come before this one)</span>
              </label>
              <div
                className="border-black bg-white overflow-y-auto max-h-36 divide-y-2 divide-black"
                style={{ border: '3px solid black' }}
              >
                {candidates.map(t => (
                  <label
                    key={t.id}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-yellow-50 transition-colors"
                  >
                    <div
                      className={`w-4 h-4 border-2 border-black flex items-center justify-center font-black text-xs transition-colors shrink-0
                        ${dependsOn.includes(t.id) ? 'bg-black text-yellow-300' : 'bg-white'}`}
                    >
                      {dependsOn.includes(t.id) ? '✓' : ''}
                    </div>
                    <input
                      type="checkbox"
                      checked={dependsOn.includes(t.id)}
                      onChange={() => toggleDep(t.id)}
                      className="hidden"
                    />
                    <span className="text-xs font-black uppercase truncate">{t.title}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              className="flex-1 bg-black text-yellow-300 font-black uppercase tracking-wider py-3 border-4 border-black hover:bg-yellow-300 hover:text-black transition-colors shadow-brutal-sm active:translate-x-1 active:translate-y-1 active:shadow-none"
            >
              {task ? 'SAVE CHANGES' : 'ADD TASK'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 bg-white font-black uppercase tracking-wider py-3 border-4 border-black hover:bg-gray-100 transition-colors shadow-brutal-sm active:translate-x-1 active:translate-y-1 active:shadow-none"
            >
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
