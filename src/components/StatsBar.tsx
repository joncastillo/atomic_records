import { Task, getTaskStatus } from '../types'

interface Props {
  tasks: Task[]
  filters: Record<string, boolean>
  onToggle: (label: string) => void
}

export default function StatsBar({ tasks, filters, onToggle }: Props) {
  const total = tasks.length
  const done = tasks.filter(t => t.completed).length
  const overdue = tasks.filter(t => getTaskStatus(t) === 'overdue').length
  const pending = tasks.filter(t => getTaskStatus(t) === 'pending').length

  const allOn = filters.PENDING && filters.DONE && filters.OVERDUE

  const stats = [
    { label: 'TOTAL', value: total, active: allOn, cls: 'bg-white text-black' },
    { label: 'PENDING', value: pending, active: filters.PENDING, cls: 'bg-blue-400 text-black' },
    { label: 'DONE', value: done, active: filters.DONE, cls: 'bg-green-400 text-black' },
    { label: 'OVERDUE', value: overdue, active: filters.OVERDUE, cls: overdue > 0 ? 'bg-red-500 text-white' : 'bg-red-100 text-black' },
  ]

  return (
    <div className="flex gap-2">
      {stats.map(s => (
        <button
          key={s.label}
          onClick={() => onToggle(s.label)}
          className={`border-4 border-black px-4 py-1 text-center min-w-[60px] transition-colors cursor-pointer ${
            s.active ? s.cls : 'bg-gray-200 text-gray-500 opacity-70'
          }`}
          style={{ boxShadow: s.active ? '3px 3px 0 #000' : '1px 1px 0 #000', transform: s.active ? 'none' : 'translate(2px, 2px)' }}
        >
          <div className="text-lg font-black leading-tight">{s.value}</div>
          <div className="text-xs font-black uppercase tracking-widest opacity-80 leading-tight">{s.label}</div>
        </button>
      ))}
    </div>
  )
}
