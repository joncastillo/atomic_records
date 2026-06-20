# Atomic Records

A task management app with a visual dependency graph that I **VIBE CODED**. Tasks are cards on a canvas; draw arrows between them to model dependencies. Each user has their own isolated set of projects.

 ![Atomic Records](./atomic_records_screenshot.png)

## Features

- **Dependency graph** — drag cards to move, drag the port handle (→) on the right edge to connect tasks, right-click an arrow to remove it
- **Projects** — sidebar with named, colour-coded projects; each project has its own independent canvas (pan/zoom state resets per project)
- **Archive projects** — archive a project to tuck it out of the way; archived projects collapse into their own sidebar section and can be restored (un-archived) any time
- **Task notes & label colours** — every task has a free-form notes field and an optional accent label colour, both editable from the task modal
- **Attachments** — attach files to a task; download or remove them from the task modal, the cards, or the Overall Notes view
- **Overall** — a read-only consolidated graph of every active project aligned on a shared date axis
- **Overall Notes** — a collapsible project → task → notes hierarchy summarising all projects; notes are editable inline and expanded nodes persist across sessions
- **Multi-user auth** — login/register with password; users only see their own projects
- **Undo / Redo** — Ctrl+Z / Ctrl+Y, or the ⟲ ⟳ buttons on the canvas
- **Auto-arrange** — topological layout based on dependency order
- **Export / Import** — full JSON dump (including notes, labels, archive flag and attachment data); import upserts projects/tasks, never deletes existing data
- **Zoom & pan** — scroll to zoom, drag background to pan

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Tailwind CSS, Vite |
| Backend | Express, better-sqlite3 |
| Auth | SQLite sessions, `crypto.scryptSync` password hashing |
| Deploy | Docker (multi-stage Alpine build) |

## Development

```bash
npm install
npm run dev        # starts Express (port 3210) + Vite dev server concurrently
```

Vite proxies `/api` to `http://localhost:3210`. The SQLite database is created at `data/records.db` on first run.

On first launch, the app will prompt you to create an admin account. That account automatically inherits any pre-existing projects in the database.

## Build

```bash
npm run build      # TypeScript check + Vite production build → dist/
npm run server     # serve production build on port 3210
```

## Docker

```bash
docker build -t dev_atomic_records .
docker run -d -p 3210:3210 -v /your/data/path:/app/data dev_atomic_records
```

The `data/` volume persists the SQLite database across container restarts.

> **Note:** The multi-stage Dockerfile compiles `better-sqlite3` natively for Alpine/musl inside the builder stage so the final image is self-contained.

## Deploy

```bash
bash deploy.sh
```

Rsyncs the project to `joncastillo@192.168.50.199:/mnt/sda/opt/dev_atomic_records`, then SSH-rebuilds and restarts the Docker container via `start_dev_atomic.sh`.

## Data model

```
users       id, username, password_hash, created_at
sessions    id, user_id, created_at
projects    id, user_id, name, color, created_at, archived
tasks       id, project_id, title, description, notes, label_color,
            created_date, due_date, completed, completed_date,
            depends_on (JSON array of task IDs)
positions   task_id, x, y
attachments id, task_id, filename, mime, size, data (base64), created_at
```

Task status is derived at runtime: **pending** (incomplete, not overdue), **overdue** (incomplete, past due date), **completed**.
