export interface Attachment {
  id: string
  filename: string
  mime: string
  size: number
  createdAt: string
}

export interface Task {
  id: string
  title: string
  description: string
  notes: string
  labelColor?: string // hex — optional accent label
  createdDate: string // YYYY-MM-DD
  dueDate: string     // YYYY-MM-DD
  completed: boolean
  completedDate?: string
  dependsOn: string[]
  attachments: Attachment[]
}

export interface Project {
  id: string
  name: string
  color: string    // hex
  createdAt: string
  taskCount: number
  archived: boolean
}

export type TaskStatus = 'pending' | 'completed' | 'overdue'

export function getTaskStatus(task: Task): TaskStatus {
  if (task.completed) return 'completed'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(task.dueDate + 'T00:00:00')
  if (due < today) return 'overdue'
  return 'pending'
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

export function today(): string {
  return new Date().toISOString().split('T')[0]
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export const PROJECT_PALETTE = [
  '#FFE500', '#FF3B3B', '#3B9EFF', '#38E54D',
  '#FF8C00', '#9B5DE5', '#FF6B9D', '#00CED1',
]

// Palette for per-task accent labels (first entry = no label)
export const LABEL_PALETTE = [
  '', '#FF3B3B', '#FF8C00', '#FFE500', '#38E54D',
  '#3B9EFF', '#9B5DE5', '#FF6B9D', '#00CED1',
]

export const OVERALL_PROJECT_ID = '__overall__'
export const OVERALL_PROJECT: Project = {
  id: OVERALL_PROJECT_ID,
  name: 'OVERALL',
  color: '#E2E8F0',
  createdAt: '',
  taskCount: 0,
  archived: false,
}

export const OVERALL_NOTES_PROJECT_ID = '__overall_notes__'
export const OVERALL_NOTES_PROJECT: Project = {
  id: OVERALL_NOTES_PROJECT_ID,
  name: 'OVERALL NOTES',
  color: '#CBD5E1',
  createdAt: '',
  taskCount: 0,
  archived: false,
}
