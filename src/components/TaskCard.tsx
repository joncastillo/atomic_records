import { Task, TaskStatus, getTaskStatus, formatDate } from '../types'
import { CARD_W } from '../utils'
import { downloadAttachment } from '../api'

interface Props {
  task: Task
  index: number
  isConnectTarget: boolean
  isConnectSource: boolean
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
  onToggle: (id: string) => void
  readOnly?: boolean
}

const STATUS: Record<TaskStatus, { card: string; badge: string; badgeText: string }> = {
  pending: {
    card: 'bg-white border-black',
    badge: 'bg-blue-400 border-black text-black',
    badgeText: 'PENDING',
  },
  completed: {
    card: 'bg-green-200 border-green-700',
    badge: 'bg-green-700 border-green-800 text-white',
    badgeText: 'DONE',
  },
  overdue: {
    card: 'bg-red-100 border-red-600',
    badge: 'bg-red-600 border-red-700 text-white',
    badgeText: 'OVERDUE',
  },
}

export default function TaskCard({ task, index, isConnectTarget, isConnectSource, onEdit, onDelete, onToggle, readOnly }: Props) {
  const status = getTaskStatus(task)
  const s = STATUS[status]

  let outlineStyle = ''
  if (isConnectTarget) outlineStyle = 'outline outline-4 outline-yellow-400 outline-offset-2'
  if (isConnectSource) outlineStyle = 'outline outline-4 outline-blue-400 outline-offset-2'

  return (
    <div
      data-card={task.id}
      className={`border-4 ${s.card} flex flex-col select-none relative ${outlineStyle}`}
      style={{ width: CARD_W, boxShadow: '6px 6px 0 #000' }}
    >
      {/* Label colour strip */}
      {task.labelColor && (
        <div className="h-2 w-full border-b-2 border-black shrink-0" style={{ background: task.labelColor }} />
      )}

      {/* Header row: index + checkbox + status badge */}
      <div className="flex items-start gap-2 px-3 pt-3 pb-2 shrink-0">
        <span className="text-xs font-black opacity-30 shrink-0 mt-0.5">
          #{String(index + 1).padStart(2, '0')}
        </span>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => onToggle(task.id)}
          className={`w-5 h-5 shrink-0 mt-0.5 border-2 border-black flex items-center justify-center font-black text-xs transition-colors
            ${task.completed ? 'bg-green-700 border-green-800 text-white' : 'bg-white hover:bg-yellow-100'}`}
          title={task.completed ? 'Mark incomplete' : 'Mark complete'}
        >
          {task.completed ? '✓' : ''}
        </button>

        {/* Title — wraps fully, no clamping */}
        <div className="flex-1 min-w-0">
          <h3 className={`font-black text-xs uppercase tracking-wide leading-snug break-words
            ${task.completed ? 'line-through opacity-50' : ''}`}>
            {task.title}
          </h3>
        </div>

        <span className={`text-xs font-black uppercase px-1.5 py-0.5 border-2 shrink-0 ${s.badge} leading-tight mt-0.5`}>
          {s.badgeText}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 pb-3 border-t-4 border-inherit pt-2">
        {/* Description — fully visible, no clamping */}
        {task.description && (
          <p className="text-xs text-gray-700 font-mono leading-relaxed mb-2 break-words">
            {task.description}
          </p>
        )}

        {/* Notes */}
        {task.notes && (
          <div className="mb-2 border-l-4 border-black pl-2">
            <p className="text-xs font-black uppercase tracking-widest opacity-40 leading-tight">Notes</p>
            <p className="text-xs text-gray-700 font-mono leading-relaxed whitespace-pre-wrap break-words">
              {task.notes}
            </p>
          </div>
        )}

        {/* Attachments */}
        {task.attachments?.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {task.attachments.map(att => (
              <button
                key={att.id}
                onMouseDown={e => e.stopPropagation()}
                onClick={() => downloadAttachment(att).catch(e => alert('Download failed: ' + String(e)))}
                className="text-xs font-mono border-2 border-black px-1.5 py-0.5 bg-white hover:bg-yellow-200 transition-colors max-w-full truncate"
                title={`Download ${att.filename}`}
              >
                📎 {att.filename}
              </button>
            ))}
          </div>
        )}

        {/* Dates */}
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs font-mono">
          <div className="flex items-center gap-1">
            <span className="font-black uppercase opacity-40">Created</span>
            <span className="font-black">{formatDate(task.createdDate)}</span>
          </div>
          <div className={`flex items-center gap-1 ${status === 'overdue' ? 'text-red-700' : ''}`}>
            <span className="font-black uppercase opacity-40">Due</span>
            <span className="font-black">{formatDate(task.dueDate)}</span>
            {status === 'overdue' && <span className="animate-pulse">⚠</span>}
          </div>
          {task.completedDate && (
            <div className="flex items-center gap-1 text-green-700">
              <span className="font-black uppercase opacity-40">Done</span>
              <span className="font-black">{formatDate(task.completedDate)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      {!readOnly && (
        <div className="flex border-t-4 border-inherit shrink-0">
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => onEdit(task)}
            className="flex-1 py-1.5 text-xs font-black uppercase tracking-widest hover:bg-yellow-300 transition-colors border-r-2 border-inherit"
          >
            EDIT
          </button>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => onDelete(task.id)}
            className="flex-1 py-1.5 text-xs font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-colors"
          >
            DEL
          </button>
        </div>
      )}

      {/* Connection port — right edge */}
      {!readOnly && (
        <div
          data-port={task.id}
          className="absolute flex items-center justify-center font-black text-xs border-black bg-yellow-300 hover:bg-black hover:text-yellow-300 transition-colors"
          style={{
            width: 26, height: 26,
            right: -15, top: '50%',
            transform: 'translateY(-50%)',
            cursor: 'crosshair',
            zIndex: 10,
            borderWidth: 3, borderStyle: 'solid',
            boxShadow: '3px 3px 0 #000',
          }}
          title="Drag to connect"
        >
          →
        </div>
      )}
    </div>
  )
}
