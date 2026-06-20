import { Task, Project, Attachment } from './types'
import { Positions } from './utils'

let _token: string | null = localStorage.getItem('auth_token')

export function setToken(t: string | null) {
  _token = t
  if (t) localStorage.setItem('auth_token', t)
  else localStorage.removeItem('auth_token')
}

async function call<T>(url: string, opts?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(opts?.headers as Record<string, string> ?? {}) }
  if (_token) headers['Authorization'] = `Bearer ${_token}`
  const r = await fetch(url, { ...opts, headers })
  if (!r.ok) {
    const data = await r.json().catch(() => ({}))
    throw new Error(data.error ?? `API ${opts?.method ?? 'GET'} ${url} → ${r.status}`)
  }
  return r.json() as Promise<T>
}

const J = { 'Content-Type': 'application/json' }
const body = (d: unknown) => JSON.stringify(d)

export interface AuthUser { id: string; username: string }
export interface ExportProject {
  id: string; name: string; color: string; createdAt: string; archived?: boolean
  tasks: Task[]; positions: Positions
  attachmentData?: unknown[]
}
export interface ExportPayload {
  version: number; exportedAt: string; projects: ExportProject[]
}

export async function checkAuth(): Promise<{ user: AuthUser | null; needsSetup: boolean }> {
  const headers: Record<string, string> = {}
  if (_token) headers['Authorization'] = `Bearer ${_token}`
  const r = await fetch('/api/auth/me', { headers })
  if (r.ok) return { user: await r.json(), needsSetup: false }
  const data = await r.json().catch(() => ({}))
  return { user: null, needsSetup: data.needsSetup ?? false }
}

export const api = {
  // Auth
  login:    (username: string, password: string) =>
              call<{ token: string; id: string; username: string }>('/api/auth/login', { method: 'POST', headers: J, body: body({ username, password }) }),
  register: (username: string, password: string) =>
              call<{ token: string; id: string; username: string }>('/api/auth/register', { method: 'POST', headers: J, body: body({ username, password }) }),
  logout:   () => call<{ ok: boolean }>('/api/auth/logout', { method: 'DELETE' }),

  // Projects
  getProjects:       ()                          => call<Project[]>('/api/projects'),
  createProject:     (p: Omit<Project, 'taskCount'>) => call<void>('/api/projects', { method: 'POST', headers: J, body: body(p) }),
  updateProject:     (p: { id: string; name?: string; color?: string; archived?: boolean }) =>
                       call<void>(`/api/projects/${p.id}`, { method: 'PUT', headers: J, body: body(p) }),
  deleteProject:     (id: string)                => call<void>(`/api/projects/${id}`, { method: 'DELETE' }),

  // Tasks
  getProjectTasks:      (pid: string)            => call<Task[]>(`/api/projects/${pid}/tasks`),
  createProjectTask:    (pid: string, t: Task)   => call<void>(`/api/projects/${pid}/tasks`, { method: 'POST', headers: J, body: body(t) }),
  updateTask:           (t: Task)                => call<void>(`/api/tasks/${t.id}`, { method: 'PUT', headers: J, body: body(t) }),
  deleteTask:           (id: string)             => call<void>(`/api/tasks/${id}`, { method: 'DELETE' }),

  // Positions
  getProjectPositions:  (pid: string)            => call<Positions>(`/api/projects/${pid}/positions`),
  updatePosition:       (id: string, x: number, y: number) =>
                          call<void>(`/api/positions/${id}`, { method: 'PUT', headers: J, body: body({ x, y }) }),
  updateAllPositions:   (p: Positions)           => call<void>('/api/positions', { method: 'PUT', headers: J, body: body(p) }),

  // Board atomic replace (undo/redo)
  replaceBoardState:    (pid: string, tasks: Task[], positions: Positions) =>
                          call<void>(`/api/projects/${pid}/board`, { method: 'PUT', headers: J, body: body({ tasks, positions }) }),

  // Attachments
  getAttachments:       (taskId: string)         => call<Attachment[]>(`/api/tasks/${taskId}/attachments`),
  uploadAttachment:     (taskId: string, file: { filename: string; mime: string; data: string }) =>
                          call<Attachment>(`/api/tasks/${taskId}/attachments`, { method: 'POST', headers: J, body: body(file) }),
  deleteAttachment:     (id: string)             => call<void>(`/api/attachments/${id}`, { method: 'DELETE' }),

  // Export / Import
  exportAll:            ()                       => call<ExportPayload>('/api/export'),
  importAll:            (projects: ExportProject[]) =>
                          call<{ ok: boolean; imported: number }>('/api/import', { method: 'POST', headers: J, body: body({ projects }) }),
}

// Fetch an attachment (auth header required) and trigger a browser download
export async function downloadAttachment(att: Attachment): Promise<void> {
  const headers: Record<string, string> = {}
  if (_token) headers['Authorization'] = `Bearer ${_token}`
  const r = await fetch(`/api/attachments/${att.id}/download`, { headers })
  if (!r.ok) throw new Error('Download failed')
  const blob = await r.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = att.filename
  a.click()
  URL.revokeObjectURL(url)
}

// Read a File into a base64 string (no data: prefix)
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
