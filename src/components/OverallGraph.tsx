import { useRef, useState, useEffect, useCallback, useLayoutEffect } from 'react'
import { Task, Project } from '../types'
import TaskCard from './TaskCard'
import { CARD_W } from '../utils'

interface Props {
  projects: Project[]
  allTasksMap: Record<string, Task[]>
}

const COL_STRIDE  = CARD_W + 64   // 344 px per date column
const BAND_PAD    = 28
const ROW_GAP     = 14
const LEFT_GUTTER = 152           // frozen left column width (canvas units)
const TOP_AXIS_H  = 68            // frozen top row height  (canvas units)
const CARD_H_EST  = 155
const MIN_ZOOM    = 0.1
const MAX_ZOOM    = 2.5
const OVF         = 200_000       // bleed so background rects cover any viewport

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

type TaskWithProject = { task: Task; projectId: string }

interface Layout {
  dates: string[]
  bandY: number[]
  bandHeights: number[]
  taskPos: Record<string, { x: number; y: number }>
  totalW: number
  totalH: number
}

function computeLayout(
  projects: Project[],
  allTasksMap: Record<string, Task[]>,
  cardHeights: Record<string, number>,
): Layout {
  const all: TaskWithProject[] = []
  projects.forEach(p => {
    ;(allTasksMap[p.id] ?? []).forEach(t => all.push({ task: t, projectId: p.id }))
  })

  const dateSet = new Set(all.map(({ task }) => task.dueDate))
  const dates = Array.from(dateSet).sort()
  const dateToCol = new Map(dates.map((d, i) => [d, i]))

  const cells = new Map<string, Task[]>()
  all.forEach(({ task, projectId }) => {
    const key = `${projectId}::${task.dueDate}`
    if (!cells.has(key)) cells.set(key, [])
    cells.get(key)!.push(task)
  })
  cells.forEach(arr => arr.sort((a, b) => a.id.localeCompare(b.id)))

  const bandHeights = projects.map(p => {
    let maxStack = 0
    dates.forEach(d => {
      maxStack = Math.max(maxStack, (cells.get(`${p.id}::${d}`) ?? []).length)
    })
    if (maxStack === 0) return BAND_PAD * 2 + CARD_H_EST
    let h = 0
    for (let i = 0; i < maxStack; i++) h += CARD_H_EST + ROW_GAP
    return BAND_PAD * 2 + h - ROW_GAP
  })

  const bandY: number[] = []
  let y = TOP_AXIS_H
  projects.forEach((_, i) => { bandY.push(y); y += bandHeights[i] })

  const taskPos: Record<string, { x: number; y: number }> = {}
  all.forEach(({ task, projectId }) => {
    const pIdx = projects.findIndex(p => p.id === projectId)
    const colIdx = dateToCol.get(task.dueDate) ?? 0
    const cell = cells.get(`${projectId}::${task.dueDate}`) ?? []
    const slotIdx = cell.findIndex(t => t.id === task.id)
    const x = LEFT_GUTTER + colIdx * COL_STRIDE
    let slotY = bandY[pIdx] + BAND_PAD
    for (let i = 0; i < slotIdx; i++) slotY += (cardHeights[cell[i].id] ?? CARD_H_EST) + ROW_GAP
    taskPos[task.id] = { x, y: slotY }
  })

  const totalW = LEFT_GUTTER + Math.max(1, dates.length) * COL_STRIDE + 80
  const totalH = y + 80
  return { dates, bandY, bandHeights, taskPos, totalW, totalH }
}

function fmtDate(iso: string) {
  const [year, m, day] = iso.split('-')
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  return { month: months[parseInt(m) - 1], day, year }
}

export default function OverallGraph({ projects, allTasksMap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cardElsRef   = useRef<Record<string, HTMLDivElement | null>>({})
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({})
  const [vpSize, setVpSize] = useState({ w: 1200, h: 700 })

  const [zoom, setZoom] = useState(1)
  const [pan,  setPan]  = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState<{ startMX: number; startMY: number; startPX: number; startPY: number } | null>(null)
  const [hoveredArrow, setHoveredArrow] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ screenX: number; screenY: number; fromId: string; toId: string } | null>(null)

  const panRef  = useRef(pan)
  const zoomRef = useRef(zoom)
  const setZoomSync = useCallback((v: number) => { zoomRef.current = v; setZoom(v) }, [])
  const setPanSync  = useCallback((v: { x: number; y: number }) => { panRef.current = v; setPan(v) }, [])

  const touchRef = useRef<{
    startDist: number,
    startZoom: number,
    startPan: { x: number, y: number },
    startC: { x: number, y: number }
  } | null>(null)

  // Measure card heights; converges after 1 extra render
  useLayoutEffect(() => {
    const heights: Record<string, number> = {}
    for (const [id, el] of Object.entries(cardElsRef.current)) {
      if (el) heights[id] = el.getBoundingClientRect().height
    }
    setCardHeights(prev => {
      const changed =
        Object.keys(heights).some(id => heights[id] !== prev[id]) ||
        Object.keys(prev).some(id => !(id in heights))
      return changed ? heights : prev
    })
  })

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const prev = zoomRef.current
    const p    = panRef.current
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev * factor))
    zoomRef.current = next
    panRef.current  = { x: mx - (mx - p.x) * (next / prev), y: my - (my - p.y) * (next / prev) }
    setZoom(next); setPan({ ...panRef.current })
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setVpSize({ w: el.clientWidth, h: el.clientHeight })
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setVpSize({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!dragging) return
    const d = dragging
    const onMove = (e: MouseEvent) => {
      const next = { x: d.startPX + (e.clientX - d.startMX), y: d.startPY + (e.clientY - d.startMY) }
      panRef.current = next; setPan(next)
    }
    const onUp = () => setDragging(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging])

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    setCtxMenu(null)
    const t = e.target as HTMLElement
    if (t.closest('button') || t.closest('input')) return
    setDragging({ startMX: e.clientX, startMY: e.clientY, startPX: panRef.current.x, startPY: panRef.current.y })
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const startDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
      const cx = (t1.clientX + t2.clientX) / 2
      const cy = (t1.clientY + t2.clientY) / 2
      touchRef.current = { startDist, startZoom: zoomRef.current, startPan: { ...panRef.current }, startC: { x: cx, y: cy } }
      setCtxMenu(null)
    } else if (e.touches.length === 1) {
      const t = e.touches[0]
      setCtxMenu(null)
      const target = t.target as HTMLElement
      if (target.closest('button') || target.closest('input')) return
      setDragging({ startMX: t.clientX, startMY: t.clientY, startPX: panRef.current.x, startPY: panRef.current.y })
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && touchRef.current) {
      const t1 = e.touches[0]
      const t2 = e.touches[1]
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY)
      const scale = dist / touchRef.current.startDist
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, touchRef.current.startZoom * scale))
      zoomRef.current = nextZoom
      setZoom(nextZoom)

      const cx = (t1.clientX + t2.clientX) / 2
      const cy = (t1.clientY + t2.clientY) / 2

      const dx = cx - touchRef.current.startC.x
      const dy = cy - touchRef.current.startC.y

      const rect = containerRef.current!.getBoundingClientRect()
      const mx = touchRef.current.startC.x - rect.left
      const my = touchRef.current.startC.y - rect.top

      const p = touchRef.current.startPan
      const nextPanX = mx - (mx - p.x) * (nextZoom / touchRef.current.startZoom) + dx
      const nextPanY = my - (my - p.y) * (nextZoom / touchRef.current.startZoom) + dy

      panRef.current = { x: nextPanX, y: nextPanY }
      setPan(panRef.current)

      if (dragging) setDragging(null)
    } else if (e.touches.length === 1 && dragging) {
      const t = e.touches[0]
      const next = { x: dragging.startPX + (t.clientX - dragging.startMX), y: dragging.startPY + (t.clientY - dragging.startMY) }
      panRef.current = next; setPan(next)
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) {
      touchRef.current = null
    }
    if (e.touches.length === 0 && dragging) {
      setDragging(null)
    }
  }

  const allTasks: TaskWithProject[] = []
  projects.forEach(p => {
    ;(allTasksMap[p.id] ?? []).forEach(t => allTasks.push({ task: t, projectId: p.id }))
  })

  const layout = computeLayout(projects, allTasksMap, cardHeights)
  const { dates, bandY, bandHeights, taskPos, totalW, totalH } = layout

  // Ensure canvas covers the full viewport at any pan/zoom so whiteboard never peeks through
  const canvasW = Math.max(totalW, Math.ceil(Math.max(0, vpSize.w - pan.x) / zoom) + 400)
  const canvasH = Math.max(totalH, Math.ceil(Math.max(0, vpSize.h - pan.y) / zoom) + 400)

  // Frozen panel sizes in screen pixels (scale with zoom so they align with canvas content)
  const axisScreenH  = TOP_AXIS_H  * zoom
  const gutterScreenW = LEFT_GUTTER * zoom

  if (allTasks.length === 0) {
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
    <>
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{
          background: '#f5f0e8',
          backgroundImage: 'radial-gradient(circle, #00000018 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          cursor: dragging ? 'grabbing' : 'default',
          userSelect: 'none',
          minHeight: 0,
          touchAction: 'none'
        }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => setCtxMenu(null)}
      >

        {/* ─────────────────────────────────────────────────────────
            LAYER 1 — Main canvas (full pan + zoom transform)
            Contains: band fills, column shading, arrows, task cards.
            Does NOT contain the frozen axis or gutter labels.
        ───────────────────────────────────────────────────────── */}
        <div style={{
          transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: canvasW, height: canvasH,
          position: 'absolute', top: 0, left: 0,
        }}>
          <svg style={{ position: 'absolute', top: 0, left: 0, width: canvasW, height: canvasH, overflow: 'visible' }}>
            {/* Band fills — full width bleed */}
            {projects.map((p, i) => {
              const { r, g, b } = hexToRgb(p.color)
              return (
                <g key={p.id}>
                  <rect x={-OVF} y={bandY[i]} width={OVF + canvasW + OVF} height={bandHeights[i]}
                    fill={`rgba(${r},${g},${b},0.13)`} />
                  <line x1={-OVF} y1={bandY[i]}                   x2={canvasW + OVF} y2={bandY[i]}
                    stroke={`rgba(${r},${g},${b},0.4)`} strokeWidth={2} />
                  <line x1={-OVF} y1={bandY[i] + bandHeights[i]}  x2={canvasW + OVF} y2={bandY[i] + bandHeights[i]}
                    stroke={`rgba(${r},${g},${b},0.4)`} strokeWidth={2} />
                </g>
              )
            })}

            {/* Alternating column shading */}
            {dates.map((d, i) => i % 2 === 0 ? (
              <rect key={`col-${d}`}
                x={LEFT_GUTTER + i * COL_STRIDE} y={-OVF}
                width={COL_STRIDE} height={OVF + canvasH + OVF}
                fill="rgba(0,0,0,0.025)" />
            ) : null)}

            {/* Gutter / content separator */}
            <line x1={LEFT_GUTTER} y1={-OVF} x2={LEFT_GUTTER} y2={canvasH + OVF}
              stroke="rgba(0,0,0,0.10)" strokeWidth={1} />

            {/* Dependency arrows */}
            <defs>
              <marker id="oa-arr"   markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0,10 3.5,0 7" fill="#000" />
              </marker>
              <marker id="oa-arr-h" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                <polygon points="0 0,10 3.5,0 7" fill="#d97706" />
              </marker>
            </defs>

            {allTasks.flatMap(({ task }) =>
              task.dependsOn
                .filter(depId => taskPos[depId] && taskPos[task.id])
                .map(depId => {
                  const key  = `${depId}->${task.id}`
                  const isHov = hoveredArrow === key
                  const from = taskPos[depId]
                  const to   = taskPos[task.id]
                  const fh   = cardHeights[depId]   ?? CARD_H_EST
                  const th   = cardHeights[task.id] ?? CARD_H_EST
                  const x1 = from.x + CARD_W, y1 = from.y + fh / 2
                  const x2 = to.x,            y2 = to.y   + th / 2
                  const mid = (x1 + x2) / 2
                  const d   = `M${x1} ${y1} C${mid} ${y1},${mid} ${y2},${x2} ${y2}`
                  return (
                    <g key={key} style={{ cursor: 'context-menu' }}
                      onMouseEnter={() => setHoveredArrow(key)}
                      onMouseLeave={() => setHoveredArrow(null)}
                      onContextMenu={e => {
                        e.preventDefault(); e.stopPropagation()
                        setCtxMenu({ screenX: e.clientX, screenY: e.clientY, fromId: depId, toId: task.id })
                      }}>
                      <path d={d} stroke="transparent" strokeWidth="14" fill="none" />
                      <path d={d} fill="none"
                        stroke={isHov ? '#d97706' : '#000'}
                        strokeWidth={isHov ? 4 : 3}
                        markerEnd={isHov ? 'url(#oa-arr-h)' : 'url(#oa-arr)'}
                        style={{ transition: 'stroke 0.1s' }} />
                    </g>
                  )
                })
            )}
          </svg>

          {/* Task cards */}
          {allTasks.map(({ task }, i) => {
            const pos = taskPos[task.id]
            if (!pos) return null
            return (
              <div key={task.id} style={{ position: 'absolute', left: pos.x, top: pos.y }}
                ref={el => { cardElsRef.current[task.id] = el }}>
                <TaskCard
                  task={task} index={i}
                  isConnectTarget={false} isConnectSource={false}
                  onEdit={() => {}} onDelete={() => {}} onToggle={() => {}}
                  readOnly
                />
              </div>
            )
          })}
        </div>

        {/* ─────────────────────────────────────────────────────────
            LAYER 2 — Frozen date axis (scrolls X only)
            The inner div has translate(pan.x, 0) scale(zoom) so date
            labels follow horizontal panning but stay pinned to the top.
        ───────────────────────────────────────────────────────── */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: axisScreenH,
          overflow: 'hidden',
          zIndex: 10,
          pointerEvents: 'none',
        }}>
          <div style={{
            transform: `translate(${pan.x}px,0) scale(${zoom})`,
            transformOrigin: '0 0',
            position: 'absolute', top: 0, left: 0,
            width: canvasW, height: TOP_AXIS_H,
          }}>
            <svg style={{ width: canvasW, height: TOP_AXIS_H, overflow: 'visible' }}>
              {/* Dark background — bleeds in all directions */}
              <rect x={-OVF} y={-OVF} width={OVF + canvasW + OVF} height={OVF + TOP_AXIS_H}
                fill="#111" />

              {/* Date labels */}
              {dates.map((d, i) => {
                const cx = LEFT_GUTTER + i * COL_STRIDE + CARD_W / 2
                const { month, day, year } = fmtDate(d)
                return (
                  <g key={`axis-${d}`}>
                    <line x1={cx} y1={TOP_AXIS_H - 8} x2={cx} y2={TOP_AXIS_H} stroke="#444" strokeWidth={1} />
                    <text x={cx} y={TOP_AXIS_H / 2 - 6} textAnchor="middle" dominantBaseline="middle"
                      fontSize={12} fontWeight="900" fontFamily="monospace" fill="#FFE500"
                      style={{ letterSpacing: 1 }}>
                      {month} {day}
                    </text>
                    <text x={cx} y={TOP_AXIS_H / 2 + 12} textAnchor="middle" dominantBaseline="middle"
                      fontSize={9} fontFamily="monospace" fill="#555">
                      {year}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────
            LAYER 3 — Frozen project gutter (scrolls Y only)
            Inner div has translate(0, pan.y) scale(zoom) so band labels
            follow vertical panning but stay pinned to the left.
            Background is light so black text is legible.
        ───────────────────────────────────────────────────────── */}
        <div style={{
          position: 'absolute', top: 0, left: 0, bottom: 0,
          width: gutterScreenW,
          overflow: 'hidden',
          zIndex: 10,
          pointerEvents: 'none',
        }}>
          <div style={{
            transform: `translate(0,${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            position: 'absolute', top: 0, left: 0,
            width: LEFT_GUTTER, height: canvasH,
          }}>
            <svg style={{ width: LEFT_GUTTER, height: canvasH, overflow: 'visible' }}>
              {/* Cream base — same hue as the whiteboard so it feels native */}
              <rect x={-OVF} y={-OVF} width={OVF + LEFT_GUTTER} height={OVF + canvasH + OVF}
                fill="#ece8de" />

              {/* Per-project band sections */}
              {projects.map((p, i) => {
                const { r, g, b } = hexToRgb(p.color)
                return (
                  <g key={p.id}>
                    <rect x={-OVF} y={bandY[i]} width={OVF + LEFT_GUTTER} height={bandHeights[i]}
                      fill={`rgba(${r},${g},${b},0.22)`} />
                    <text
                      x={LEFT_GUTTER / 2}
                      y={bandY[i] + bandHeights[i] / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={10}
                      fontWeight="900"
                      fontFamily="monospace"
                      fill="#000"
                      style={{ letterSpacing: 1, textTransform: 'uppercase' }}
                    >
                      {p.name.length > 12 ? p.name.slice(0, 11) + '…' : p.name}
                    </text>
                  </g>
                )
              })}

              {/* Right border separating gutter from content */}
              <line x1={LEFT_GUTTER} y1={-OVF} x2={LEFT_GUTTER} y2={canvasH + OVF}
                stroke="rgba(0,0,0,0.15)" strokeWidth={1} />
            </svg>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────
            LAYER 4 — Corner cell (fully frozen, top-left)
            Covers the intersection of the date axis and project gutter.
            Size scales with zoom to stay aligned with both panels.
        ───────────────────────────────────────────────────────── */}
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: gutterScreenW, height: axisScreenH,
          background: '#000',
          zIndex: 20,
          pointerEvents: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          <span style={{
            color: '#444',
            fontFamily: 'monospace',
            fontSize: Math.max(7, 8 * zoom),
            fontWeight: 900,
            letterSpacing: 2,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>
            PROJECT
          </span>
        </div>

        {/* ── Controls (always on top) ── */}
        <div className="absolute bottom-4 right-4 z-30 flex flex-col gap-1.5">
          {([
            ['+', () => setZoomSync(Math.min(MAX_ZOOM, +(zoomRef.current * 1.2).toFixed(3)))],
            ['−', () => setZoomSync(Math.max(MIN_ZOOM, +(zoomRef.current * 0.8).toFixed(3)))],
            ['⊡', () => { setZoomSync(1); setPanSync({ x: 0, y: 0 }) }, 'Reset view'],
          ] as [string, () => void, string?][]).map(([label, action, title]) => (
            <button key={label} onMouseDown={e => e.stopPropagation()} onClick={action} title={title}
              className="w-9 h-9 bg-yellow-300 border-4 border-black font-black text-base flex items-center justify-center hover:bg-black hover:text-yellow-300 transition-colors"
              style={{ boxShadow: '4px 4px 0 #000' }}>
              {label}
            </button>
          ))}
        </div>

        <div className="absolute bottom-4 left-4 z-30 bg-white border-4 border-black px-3 py-1 pointer-events-none"
          style={{ boxShadow: '4px 4px 0 #000' }}>
          <span className="text-xs font-black uppercase tracking-widest opacity-60">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {/* Context menu — dependency info only */}
      {ctxMenu && (() => {
        const fromTask = allTasks.find(({ task }) => task.id === ctxMenu.fromId)?.task
        const toTask   = allTasks.find(({ task }) => task.id === ctxMenu.toId)?.task
        return (
          <div style={{ position: 'fixed', left: ctxMenu.screenX, top: ctxMenu.screenY, zIndex: 1000 }}
            onMouseDown={e => e.stopPropagation()}>
            <div className="bg-white border-4 border-black" style={{ boxShadow: '6px 6px 0 #000', minWidth: 220 }}>
              <div className="bg-black text-yellow-300 px-4 py-2 border-b-4 border-black">
                <p className="text-xs font-black uppercase tracking-widest">Dependency</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-xs font-mono opacity-60 truncate">{fromTask?.title ?? ctxMenu.fromId}</p>
                <p className="text-xs font-black my-1">↓ blocks</p>
                <p className="text-xs font-mono opacity-60 truncate">{toTask?.title ?? ctxMenu.toId}</p>
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}
