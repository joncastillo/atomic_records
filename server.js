import express from 'express'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
mkdirSync(DATA_DIR, { recursive: true })

const db = new Database(join(DATA_DIR, 'records.db'))
db.pragma('journal_mode = WAL')

// ── Schema ───────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL DEFAULT '',
    name       TEXT NOT NULL,
    color      TEXT NOT NULL DEFAULT '#FFE500',
    created_at TEXT NOT NULL,
    archived   INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id             TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL DEFAULT 'default',
    title          TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    notes          TEXT NOT NULL DEFAULT '',
    label_color    TEXT,
    created_date   TEXT NOT NULL,
    due_date       TEXT NOT NULL,
    completed      INTEGER NOT NULL DEFAULT 0,
    completed_date TEXT,
    depends_on     TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS positions (
    task_id TEXT PRIMARY KEY,
    x       REAL NOT NULL,
    y       REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS attachments (
    id         TEXT PRIMARY KEY,
    task_id    TEXT NOT NULL,
    filename   TEXT NOT NULL,
    mime       TEXT NOT NULL DEFAULT '',
    size       INTEGER NOT NULL DEFAULT 0,
    data       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`)

// ── Migrations ───────────────────────────────────────────
try { db.exec(`ALTER TABLE tasks ADD COLUMN project_id TEXT NOT NULL DEFAULT 'default'`) } catch (_) {}
try { db.exec(`ALTER TABLE projects ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`) } catch (_) {}
try { db.exec(`ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`) } catch (_) {}
try { db.exec(`ALTER TABLE tasks ADD COLUMN notes TEXT NOT NULL DEFAULT ''`) } catch (_) {}
try { db.exec(`ALTER TABLE tasks ADD COLUMN label_color TEXT`) } catch (_) {}

// Ensure a default project exists for legacy data
db.prepare(`INSERT OR IGNORE INTO projects (id, name, color, created_at) VALUES (?, ?, ?, ?)`)
  .run('default', 'Default', '#FFE500', new Date().toISOString())

// ── Auth helpers ─────────────────────────────────────────
function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(pw, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':')
  const buf = Buffer.from(hash, 'hex')
  const derived = scryptSync(pw, salt, 64)
  return timingSafeEqual(buf, derived)
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const session = db.prepare(`SELECT * FROM sessions WHERE id=?`).get(token)
  if (!session) return res.status(401).json({ error: 'Unauthorized' })
  req.userId = session.user_id
  next()
}

const app = express()
app.use(express.json({ limit: '25mb' }))
app.use(express.static(join(__dirname, 'dist')))

// All /api routes except /api/auth/* require authentication
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) return next()
  requireAuth(req, res, next)
})

// ── Auth endpoints ────────────────────────────────────────
app.get('/api/auth/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token) {
    const row = db.prepare(`SELECT s.user_id as id, u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?`).get(token)
    if (row) return res.json({ id: row.id, username: row.username })
  }
  const userCount = db.prepare(`SELECT COUNT(*) as c FROM users`).get().c
  res.status(401).json({ error: 'Not authenticated', needsSetup: userCount === 0 })
})

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body
  if (!username?.trim() || !password) return res.status(400).json({ error: 'Username and password required' })
  const isFirst = db.prepare(`SELECT COUNT(*) as c FROM users`).get().c === 0
  const id = randomBytes(16).toString('hex')
  try {
    db.prepare(`INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)`)
      .run(id, username.trim(), hashPassword(password), new Date().toISOString())
  } catch {
    return res.status(400).json({ error: 'Username already taken' })
  }
  // First user claims all orphaned legacy projects
  if (isFirst) db.prepare(`UPDATE projects SET user_id=? WHERE user_id=''`).run(id)
  const token = randomBytes(32).toString('hex')
  db.prepare(`INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)`).run(token, id, Date.now())
  res.json({ token, id, username: username.trim() })
})

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body
  const user = db.prepare(`SELECT * FROM users WHERE username=?`).get(username)
  if (!user || !verifyPassword(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid username or password' })
  const token = randomBytes(32).toString('hex')
  db.prepare(`INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)`).run(token, user.id, Date.now())
  res.json({ token, id: user.id, username: user.username })
})

app.delete('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (token) db.prepare(`DELETE FROM sessions WHERE id=?`).run(token)
  res.json({ ok: true })
})

// ── Helpers ──────────────────────────────────────────────
function attachmentMeta(row) {
  return { id: row.id, filename: row.filename, mime: row.mime, size: row.size, createdAt: row.created_at }
}

// Attachment metadata (no blob data) grouped by task id, for a set of task ids
function attachmentsByTask(taskIds) {
  const out = {}
  for (const id of taskIds) out[id] = []
  if (taskIds.length === 0) return out
  const placeholders = taskIds.map(() => '?').join(',')
  const rows = db.prepare(
    `SELECT id, task_id, filename, mime, size, created_at FROM attachments WHERE task_id IN (${placeholders}) ORDER BY created_at`
  ).all(...taskIds)
  for (const r of rows) (out[r.task_id] ??= []).push(attachmentMeta(r))
  return out
}

function rowToTask(row, attachments = []) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    notes: row.notes ?? '',
    labelColor: row.label_color ?? undefined,
    createdDate: row.created_date,
    dueDate: row.due_date,
    completed: Boolean(row.completed),
    completedDate: row.completed_date ?? undefined,
    dependsOn: JSON.parse(row.depends_on),
    attachments,
  }
}

// Confirm a task belongs to a project owned by the user
function taskOwnedBy(taskId, userId) {
  return !!db.prepare(
    `SELECT t.id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ? AND p.user_id = ?`
  ).get(taskId, userId)
}

// ── Projects (user-scoped) ────────────────────────────────
app.get('/api/projects', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, COUNT(t.id) AS task_count
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.user_id = ?
    GROUP BY p.id
    ORDER BY p.created_at
  `).all(req.userId)
  res.json(rows.map(r => ({
    id: r.id, name: r.name, color: r.color, createdAt: r.created_at,
    taskCount: r.task_count, archived: Boolean(r.archived),
  })))
})

app.post('/api/projects', (req, res) => {
  const { id, name, color, createdAt } = req.body
  db.prepare(`INSERT INTO projects (id, name, color, created_at, user_id, archived) VALUES (?, ?, ?, ?, ?, 0)`)
    .run(id, name, color, createdAt, req.userId)
  res.json({ ok: true })
})

app.put('/api/projects/:id', (req, res) => {
  const cur = db.prepare(`SELECT * FROM projects WHERE id=? AND user_id=?`).get(req.params.id, req.userId)
  if (!cur) return res.status(403).json({ error: 'Not found' })
  const name = req.body.name ?? cur.name
  const color = req.body.color ?? cur.color
  const archived = req.body.archived !== undefined ? (req.body.archived ? 1 : 0) : cur.archived
  db.prepare(`UPDATE projects SET name=?, color=?, archived=? WHERE id=? AND user_id=?`)
    .run(name, color, archived, req.params.id, req.userId)
  res.json({ ok: true })
})

app.delete('/api/projects/:id', (req, res) => {
  const id = req.params.id
  const proj = db.prepare(`SELECT id FROM projects WHERE id=? AND user_id=?`).get(id, req.userId)
  if (!proj) return res.status(403).json({ error: 'Not found' })
  db.transaction(() => {
    db.prepare(`DELETE FROM attachments WHERE task_id IN (SELECT id FROM tasks WHERE project_id=?)`).run(id)
    db.prepare(`DELETE FROM positions WHERE task_id IN (SELECT id FROM tasks WHERE project_id=?)`).run(id)
    db.prepare(`DELETE FROM tasks WHERE project_id=?`).run(id)
    db.prepare(`DELETE FROM projects WHERE id=?`).run(id)
  })()
  res.json({ ok: true })
})

// ── Tasks (project-scoped) ────────────────────────────────
app.get('/api/projects/:projectId/tasks', (req, res) => {
  const rows = db.prepare(`SELECT * FROM tasks WHERE project_id=? ORDER BY rowid`).all(req.params.projectId)
  const attMap = attachmentsByTask(rows.map(r => r.id))
  res.json(rows.map(r => rowToTask(r, attMap[r.id] ?? [])))
})

app.post('/api/projects/:projectId/tasks', (req, res) => {
  const pid = req.params.projectId
  const { id, title, description, notes, labelColor, createdDate, dueDate, completed, completedDate, dependsOn } = req.body
  db.prepare(`
    INSERT INTO tasks (id, project_id, title, description, notes, label_color, created_date, due_date, completed, completed_date, depends_on)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, pid, title, description ?? '', notes ?? '', labelColor ?? null, createdDate, dueDate, completed ? 1 : 0, completedDate ?? null, JSON.stringify(dependsOn ?? []))
  res.json({ ok: true })
})

// ── Tasks (standalone update / delete) ───────────────────
app.put('/api/tasks/:id', (req, res) => {
  const { title, description, notes, labelColor, createdDate, dueDate, completed, completedDate, dependsOn } = req.body
  db.prepare(`
    UPDATE tasks SET title=?, description=?, notes=?, label_color=?, created_date=?, due_date=?, completed=?, completed_date=?, depends_on=?
    WHERE id=?
  `).run(title, description ?? '', notes ?? '', labelColor ?? null, createdDate, dueDate, completed ? 1 : 0, completedDate ?? null, JSON.stringify(dependsOn ?? []), req.params.id)
  res.json({ ok: true })
})

app.delete('/api/tasks/:id', (req, res) => {
  const id = req.params.id
  db.transaction(() => {
    db.prepare(`DELETE FROM tasks WHERE id=?`).run(id)
    db.prepare(`DELETE FROM positions WHERE task_id=?`).run(id)
    db.prepare(`DELETE FROM attachments WHERE task_id=?`).run(id)
    const others = db.prepare(`SELECT id, depends_on FROM tasks`).all()
    const upd = db.prepare(`UPDATE tasks SET depends_on=? WHERE id=?`)
    for (const row of others) {
      const deps = JSON.parse(row.depends_on).filter(d => d !== id)
      upd.run(JSON.stringify(deps), row.id)
    }
  })()
  res.json({ ok: true })
})

// ── Attachments ──────────────────────────────────────────
app.get('/api/tasks/:taskId/attachments', (req, res) => {
  if (!taskOwnedBy(req.params.taskId, req.userId)) return res.status(404).json({ error: 'Not found' })
  const rows = db.prepare(`SELECT id, filename, mime, size, created_at FROM attachments WHERE task_id=? ORDER BY created_at`).all(req.params.taskId)
  res.json(rows.map(attachmentMeta))
})

app.post('/api/tasks/:taskId/attachments', (req, res) => {
  const taskId = req.params.taskId
  if (!taskOwnedBy(taskId, req.userId)) return res.status(404).json({ error: 'Not found' })
  const { filename, mime, data } = req.body
  if (!filename || typeof data !== 'string') return res.status(400).json({ error: 'filename and data required' })
  // data is a base64 string (no data: prefix)
  const size = Math.floor((data.length * 3) / 4)
  const id = randomBytes(16).toString('hex')
  const createdAt = new Date().toISOString()
  db.prepare(`INSERT INTO attachments (id, task_id, filename, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, taskId, filename, mime ?? '', size, data, createdAt)
  res.json({ id, filename, mime: mime ?? '', size, createdAt })
})

app.get('/api/attachments/:id/download', (req, res) => {
  const row = db.prepare(`
    SELECT a.*, p.user_id FROM attachments a
    JOIN tasks t ON t.id = a.task_id
    JOIN projects p ON p.id = t.project_id
    WHERE a.id = ?
  `).get(req.params.id)
  if (!row || row.user_id !== req.userId) return res.status(404).json({ error: 'Not found' })
  const buf = Buffer.from(row.data, 'base64')
  res.setHeader('Content-Type', row.mime || 'application/octet-stream')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.filename)}"`)
  res.send(buf)
})

app.delete('/api/attachments/:id', (req, res) => {
  const row = db.prepare(`
    SELECT a.id, p.user_id FROM attachments a
    JOIN tasks t ON t.id = a.task_id
    JOIN projects p ON p.id = t.project_id
    WHERE a.id = ?
  `).get(req.params.id)
  if (!row || row.user_id !== req.userId) return res.status(404).json({ error: 'Not found' })
  db.prepare(`DELETE FROM attachments WHERE id=?`).run(req.params.id)
  res.json({ ok: true })
})

// ── Positions ─────────────────────────────────────────────
app.get('/api/projects/:projectId/positions', (req, res) => {
  const rows = db.prepare(`
    SELECT pos.task_id, pos.x, pos.y
    FROM positions pos
    JOIN tasks t ON t.id = pos.task_id
    WHERE t.project_id = ?
  `).all(req.params.projectId)
  const result = {}
  for (const r of rows) result[r.task_id] = { x: r.x, y: r.y }
  res.json(result)
})

app.put('/api/positions/:id', (req, res) => {
  const { x, y } = req.body
  db.prepare(`INSERT OR REPLACE INTO positions (task_id, x, y) VALUES (?, ?, ?)`).run(req.params.id, x, y)
  res.json({ ok: true })
})

app.put('/api/positions', (req, res) => {
  const positions = req.body
  const stmt = db.prepare(`INSERT OR REPLACE INTO positions (task_id, x, y) VALUES (?, ?, ?)`)
  db.transaction(() => {
    for (const [taskId, pos] of Object.entries(positions)) stmt.run(taskId, pos.x, pos.y)
  })()
  res.json({ ok: true })
})

// ── Board atomic replace (undo/redo) ─────────────────────
app.put('/api/projects/:projectId/board', (req, res) => {
  const pid = req.params.projectId
  const { tasks, positions } = req.body
  db.transaction(() => {
    db.prepare(`DELETE FROM positions WHERE task_id IN (SELECT id FROM tasks WHERE project_id=?)`).run(pid)
    db.prepare(`DELETE FROM tasks WHERE project_id=?`).run(pid)
    const ins = db.prepare(`INSERT INTO tasks (id,project_id,title,description,notes,label_color,created_date,due_date,completed,completed_date,depends_on) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    for (const t of tasks)
      ins.run(t.id, pid, t.title, t.description ?? '', t.notes ?? '', t.labelColor ?? null, t.createdDate, t.dueDate, t.completed ? 1 : 0, t.completedDate ?? null, JSON.stringify(t.dependsOn ?? []))
    const insP = db.prepare(`INSERT OR REPLACE INTO positions (task_id,x,y) VALUES (?,?,?)`)
    for (const [id, p] of Object.entries(positions)) insP.run(id, p.x, p.y)
  })()
  res.json({ ok: true })
})

// ── Export ────────────────────────────────────────────────
app.get('/api/export', (req, res) => {
  const projects = db.prepare(`SELECT * FROM projects WHERE user_id=? ORDER BY created_at`).all(req.userId)
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    projects: projects.map(proj => {
      const rows = db.prepare(`SELECT * FROM tasks WHERE project_id=? ORDER BY rowid`).all(proj.id)
      const attMap = attachmentsByTask(rows.map(r => r.id))
      const tasks = rows.map(r => rowToTask(r, attMap[r.id] ?? []))
      // Full attachment blobs (base64) keyed by attachment id, so import can restore them
      const posRows = db.prepare(`SELECT pos.task_id,pos.x,pos.y FROM positions pos JOIN tasks t ON t.id=pos.task_id WHERE t.project_id=?`).all(proj.id)
      const positions = {}
      for (const r of posRows) positions[r.task_id] = { x: r.x, y: r.y }
      const attRows = rows.length
        ? db.prepare(`SELECT id, task_id, filename, mime, size, data, created_at FROM attachments WHERE task_id IN (${rows.map(() => '?').join(',')})`).all(...rows.map(r => r.id))
        : []
      const attachmentData = attRows.map(a => ({
        id: a.id, taskId: a.task_id, filename: a.filename, mime: a.mime, size: a.size, data: a.data, createdAt: a.created_at,
      }))
      return { id: proj.id, name: proj.name, color: proj.color, createdAt: proj.created_at, archived: Boolean(proj.archived), tasks, positions, attachmentData }
    }),
  }
  res.setHeader('Content-Disposition', `attachment; filename="atomic-records-${Date.now()}.json"`)
  res.json(payload)
})

// ── Import (upsert — never deletes pre-existing data) ────
app.post('/api/import', (req, res) => {
  const { projects } = req.body
  if (!Array.isArray(projects)) return res.status(400).json({ error: 'Invalid format' })
  db.transaction(() => {
    for (const proj of projects) {
      db.prepare(`INSERT OR REPLACE INTO projects (id,name,color,created_at,user_id,archived) VALUES (?,?,?,?,?,?)`)
        .run(proj.id, proj.name, proj.color, proj.createdAt, req.userId, proj.archived ? 1 : 0)
      if (Array.isArray(proj.tasks)) {
        const ins = db.prepare(`INSERT OR REPLACE INTO tasks (id,project_id,title,description,notes,label_color,created_date,due_date,completed,completed_date,depends_on) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        for (const t of proj.tasks)
          ins.run(t.id, proj.id, t.title, t.description ?? '', t.notes ?? '', t.labelColor ?? null, t.createdDate, t.dueDate, t.completed ? 1 : 0, t.completedDate ?? null, JSON.stringify(t.dependsOn ?? []))
      }
      if (proj.positions && typeof proj.positions === 'object') {
        const insP = db.prepare(`INSERT OR REPLACE INTO positions (task_id,x,y) VALUES (?,?,?)`)
        for (const [id, p] of Object.entries(proj.positions)) insP.run(id, p.x, p.y)
      }
      if (Array.isArray(proj.attachmentData)) {
        const insA = db.prepare(`INSERT OR REPLACE INTO attachments (id,task_id,filename,mime,size,data,created_at) VALUES (?,?,?,?,?,?,?)`)
        for (const a of proj.attachmentData)
          insA.run(a.id, a.taskId, a.filename, a.mime ?? '', a.size ?? 0, a.data, a.createdAt ?? new Date().toISOString())
      }
    }
  })()
  res.json({ ok: true, imported: projects.length })
})

// ── SPA fallback ──────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(join(__dirname, 'dist', 'index.html')))

const PORT = process.env.PORT ?? 3210
app.listen(PORT, () => console.log(`[server] http://localhost:${PORT}`))
