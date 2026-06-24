import { useState, useEffect, useRef } from 'react'
import { Task } from '../types'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'

interface Props {
  task: Task
  onSave: (taskId: string, notes: string) => void
  onClose: () => void
}

export default function NoteEditorFullScreen({ task, onSave, onClose }: Props) {
  const [notes, setNotes] = useState(task.notes ?? '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // Focus and place cursor at end
    if (textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.selectionStart = textareaRef.current.value.length
      textareaRef.current.selectionEnd = textareaRef.current.value.length
    }
  }, [])

  function handleSave() {
    onSave(task.id, notes)
  }

  // Ctrl+S or Cmd+S to save
  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, 4, 5, 6, false] }, { 'font': [] }, { 'size': [] }],
      [{ 'color': [] }, { 'background': [] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{'list': 'ordered'}, {'list': 'bullet'}],
      ['link', 'clean']
    ],
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <header className="shrink-0 bg-yellow-300 border-b-4 border-black px-4 py-3 flex items-center justify-between">
        <div className="flex-1 min-w-0 mr-4">
          <p className="text-xs font-black uppercase tracking-widest opacity-60">Editing Notes For</p>
          <h2 className="text-lg font-black uppercase tracking-widest truncate">{task.title}</h2>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 border-4 border-black bg-white font-black uppercase tracking-widest text-xs hover:bg-gray-200 transition-colors"
            style={{ boxShadow: '2px 2px 0 #000' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 border-4 border-black bg-black text-yellow-300 font-black uppercase tracking-widest text-xs hover:bg-yellow-300 hover:text-black transition-colors"
            style={{ boxShadow: '2px 2px 0 #000' }}
          >
            Save
          </button>
        </div>
      </header>

      {/* Editor Body */}
      <div className="flex-1 flex flex-col p-4 md:p-8 bg-[#f5f0e8] overflow-hidden" onKeyDown={handleKeyDown}>
        <div className="flex-1 bg-white border-4 border-black flex flex-col overflow-hidden relative" style={{ boxShadow: '8px 8px 0 #000' }}>
          <ReactQuill
            theme="snow"
            value={notes}
            onChange={setNotes}
            modules={modules}
            placeholder="Type your notes here... (Ctrl+S to save, Esc to cancel)"
            className="flex-1 flex flex-col h-full"
          />
        </div>
      </div>
    </div>
  )
}
