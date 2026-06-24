import { useRef, useState, useEffect, useCallback } from 'react'
import { Task } from '../types'
import TaskCard from './TaskCard'
import { CARD_W, CARD_H, Positions, findCardAt } from '../utils'

interface Props {
  tasks: Task[]
  positions: Positions
  onTaskMove: (id: string, x: number, y: number) => void
  onConnect: (fromId: string, toId: string) => void
  onDisconnect: (fromId: string, toId: string) => void
  onAutoArrange: () => void
  onUndo: () => void
  onRedo: () => void
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
  onToggle: (id: string) => void
  onNoteClick?: (task: Task) => void
}

type DragKind =
  | { kind: 'pan'; startMX: number; startMY: number; startPX: number; startPY: number }
  | { kind: 'card'; taskId: string; startMX: number; startMY: number; startCX: number; startCY: number }
  | { kind: 'pending-card'; taskId: string; startMX: number; startMY: number; startPX: number; startPY: number; startCX: number; startCY: number }
  | { kind: 'connect'; fromId: string }

interface ConnectPreview { fromId: string; curX: number; curY: number }
interface CtxMenu { screenX: number; screenY: number; fromId: string; toId: string }

const MIN_ZOOM = 0.15
const MAX_ZOOM = 2.5
const PORT_OFFSET = 2

export default function TaskGraph({ tasks, positions, onTaskMove, onConnect, onDisconnect, onAutoArrange, onUndo, onRedo, onEdit, onDelete, onToggle, onNoteClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cardElsRef = useRef<Record<string, HTMLDivElement | null>>({})
  const [cardHeights, setCardHeights] = useState<Record<string, number>>({})

  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 60, y: 60 })
  const [drag, setDrag] = useState<DragKind | null>(null)
  const [draggingPos, setDraggingPos] = useState<{ taskId: string; x: number; y: number } | null>(null)
  const [connectPreview, setConnectPreview] = useState<ConnectPreview | null>(null)
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [hoveredArrow, setHoveredArrow] = useState<string | null>(null)

  const panRef = useRef(pan)
  const zoomRef = useRef(zoom)
  const cardHeightsRef = useRef(cardHeights)

  const setZoomSync = useCallback((v: number) => { zoomRef.current = v; setZoom(v) }, [])
  const setPanSync = useCallback((v: { x: number; y: number }) => { panRef.current = v; setPan(v) }, [])

  const touchRef = useRef<{
    startDist: number,
    startZoom: number,
    startPan: { x: number, y: number },
    startC: { x: number, y: number }
  } | null>(null)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Measure all card heights after tasks update (covers add/edit/delete)
  useEffect(() => {
    // Clean up refs for removed tasks
    const ids = new Set(tasks.map(t => t.id))
    for (const id of Object.keys(cardElsRef.current)) {
      if (!ids.has(id)) delete cardElsRef.current[id]
    }
    const heights: Record<string, number> = {}
    for (const [id, el] of Object.entries(cardElsRef.current)) {
      if (el) heights[id] = el.getBoundingClientRect().height
    }
    cardHeightsRef.current = heights
    setCardHeights(heights)
  }, [tasks])

  function cardH(id: string) { return cardHeightsRef.current[id] ?? CARD_H }

  function screenToGraph(screenX: number, screenY: number) {
    const rect = containerRef.current!.getBoundingClientRect()
    return {
      x: (screenX - rect.left - panRef.current.x) / zoomRef.current,
      y: (screenY - rect.top - panRef.current.y) / zoomRef.current,
    }
  }

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const prevZoom = zoomRef.current
    const p = panRef.current
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * factor))
    zoomRef.current = nextZoom
    panRef.current = { x: mx - (mx - p.x) * (nextZoom / prevZoom), y: my - (my - p.y) * (nextZoom / prevZoom) }
    setZoom(nextZoom)
    setPan({ ...panRef.current })
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  useEffect(() => {
    if (!drag) return
    const activeDrag = drag

    function onMove(e: MouseEvent) {
      if (activeDrag.kind === 'pan') {
        const next = { x: activeDrag.startPX + (e.clientX - activeDrag.startMX), y: activeDrag.startPY + (e.clientY - activeDrag.startMY) }
        panRef.current = next; setPan(next)
      } else if (activeDrag.kind === 'card') {
        const dx = (e.clientX - activeDrag.startMX) / zoomRef.current
        const dy = (e.clientY - activeDrag.startMY) / zoomRef.current
        setDraggingPos({ taskId: activeDrag.taskId, x: activeDrag.startCX + dx, y: activeDrag.startCY + dy })
      } else if (activeDrag.kind === 'connect') {
        const g = screenToGraph(e.clientX, e.clientY)
        setConnectPreview({ fromId: activeDrag.fromId, curX: g.x, curY: g.y })
        setHoveredCard(findCardAt(g.x, g.y, tasks, positions, cardHeightsRef.current) ?? null)
      }
    }

    function onUp(e: MouseEvent) {
      if (activeDrag.kind === 'card') {
        setDraggingPos(prev => { if (prev) onTaskMove(prev.taskId, prev.x, prev.y); return null })
      }
      if (activeDrag.kind === 'connect') {
        const g = screenToGraph(e.clientX, e.clientY)
        const targetId = findCardAt(g.x, g.y, tasks, positions, cardHeightsRef.current)
        if (targetId && targetId !== activeDrag.fromId) onConnect(activeDrag.fromId, targetId)
        setConnectPreview(null); setHoveredCard(null)
      }
      setDrag(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, tasks, positions])

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    setCtxMenu(null)
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('textarea')) return

    const portEl = target.closest('[data-port]') as HTMLElement | null
    if (portEl) {
      const fromId = portEl.dataset.port!
      setDrag({ kind: 'connect', fromId })
      const pos = positions[fromId]
      if (pos) setConnectPreview({ fromId, curX: pos.x + CARD_W, curY: pos.y + cardH(fromId) / 2 })
      e.preventDefault(); return
    }

    const cardEl = target.closest('[data-card]') as HTMLElement | null
    if (cardEl) {
      const taskId = cardEl.dataset.card!
      const pos = positions[taskId] ?? { x: 60, y: 60 }
      setDrag({ kind: 'card', taskId, startMX: e.clientX, startMY: e.clientY, startCX: pos.x, startCY: pos.y })
      e.preventDefault(); return
    }

    setDrag({ kind: 'pan', startMX: e.clientX, startMY: e.clientY, startPX: panRef.current.x, startPY: panRef.current.y })
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
      if (target.closest('button') || target.closest('input') || target.closest('select') || target.closest('textarea')) return

      const portEl = target.closest('[data-port]') as HTMLElement | null
      if (portEl) {
        const fromId = portEl.dataset.port!
        setDrag({ kind: 'connect', fromId })
        const pos = positions[fromId]
        if (pos) setConnectPreview({ fromId, curX: pos.x + CARD_W, curY: pos.y + cardH(fromId) / 2 })
        return
      }

      const cardEl = target.closest('[data-card]') as HTMLElement | null
      if (cardEl) {
        const taskId = cardEl.dataset.card!
        const pos = positions[taskId] ?? { x: 60, y: 60 }
        setDrag({ kind: 'pending-card', taskId, startMX: t.clientX, startMY: t.clientY, startPX: panRef.current.x, startPY: panRef.current.y, startCX: pos.x, startCY: pos.y })
        
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = setTimeout(() => {
          setDrag(prev => {
            if (prev?.kind === 'pending-card' && prev.taskId === taskId) {
               return { kind: 'card', taskId, startMX: prev.startMX, startMY: prev.startMY, startCX: prev.startCX, startCY: prev.startCY }
            }
            return prev
          })
        }, 500)
        return
      }

      setDrag({ kind: 'pan', startMX: t.clientX, startMY: t.clientY, startPX: panRef.current.x, startPY: panRef.current.y })
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

      if (drag) setDrag(null)
    } else if (e.touches.length === 1 && drag) {
      const t = e.touches[0]
      if (drag.kind === 'pan') {
        const next = { x: drag.startPX + (t.clientX - drag.startMX), y: drag.startPY + (t.clientY - drag.startMY) }
        panRef.current = next; setPan(next)
      } else if (drag.kind === 'card') {
        const dx = (t.clientX - drag.startMX) / zoomRef.current
        const dy = (t.clientY - drag.startMY) / zoomRef.current
        setDraggingPos({ taskId: drag.taskId, x: drag.startCX + dx, y: drag.startCY + dy })
      } else if (drag.kind === 'pending-card') {
        const dist = Math.hypot(t.clientX - drag.startMX, t.clientY - drag.startMY)
        if (dist > 10) {
          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
          const next = { x: drag.startPX + (t.clientX - drag.startMX), y: drag.startPY + (t.clientY - drag.startMY) }
          panRef.current = next; setPan(next)
          setDrag({ kind: 'pan', startMX: drag.startMX, startMY: drag.startMY, startPX: drag.startPX, startPY: drag.startPY })
        }
      } else if (drag.kind === 'connect') {
        const g = screenToGraph(t.clientX, t.clientY)
        setConnectPreview({ fromId: drag.fromId, curX: g.x, curY: g.y })
        setHoveredCard(findCardAt(g.x, g.y, tasks, positions, cardHeightsRef.current) ?? null)
      }
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2) {
      touchRef.current = null
    }
    if (e.touches.length === 0 && drag) {
      if (drag.kind === 'pending-card') {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
      } else if (drag.kind === 'card') {
        setDraggingPos(prev => { if (prev) onTaskMove(prev.taskId, prev.x, prev.y); return null })
      } else if (drag.kind === 'connect') {
        const t = e.changedTouches[0]
        const g = screenToGraph(t.clientX, t.clientY)
        const targetId = findCardAt(g.x, g.y, tasks, positions, cardHeightsRef.current)
        if (targetId && targetId !== drag.fromId) onConnect(drag.fromId, targetId)
        setConnectPreview(null); setHoveredCard(null)
      }
      setDrag(null)
    }
  }

  function effectivePos(id: string) {
    if (draggingPos?.taskId === id) return { x: draggingPos.x, y: draggingPos.y }
    return positions[id] ?? { x: 60, y: 60 }
  }

  let maxX = 800, maxY = 500
  tasks.forEach(t => {
    const p = effectivePos(t.id)
    const h = cardH(t.id)
    maxX = Math.max(maxX, p.x + CARD_W + 80)
    maxY = Math.max(maxY, p.y + h + 80)
  })

  const cursor = drag ? (drag.kind === 'connect' ? 'crosshair' : 'grabbing') : 'default'

  return (
    <>
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        style={{
          background: '#f5f0e8',
          backgroundImage: 'radial-gradient(circle, #00000018 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          cursor, userSelect: 'none', minHeight: 0,
          touchAction: 'none'
        }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => setCtxMenu(null)}
      >
        {tasks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white border-4 border-black p-12 text-center" style={{ boxShadow: '8px 8px 0 #000' }}>
              <div className="text-5xl mb-4 opacity-20">◈</div>
              <p className="font-black uppercase tracking-widest text-gray-500">NO TASKS YET</p>
            </div>
          </div>
        )}

        {/* Undo / redo */}
        <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1.5">
          {([
            ['⟲', onUndo, 'Undo (Ctrl+Z)'],
            ['⟳', onRedo, 'Redo (Ctrl+Y)'],
          ] as [string, () => void, string][]).map(([label, action, title]) => (
            <button key={label} onMouseDown={e => e.stopPropagation()} onClick={action} title={title}
              className="w-9 h-9 bg-white border-4 border-black font-black text-base flex items-center justify-center hover:bg-black hover:text-white transition-colors"
              style={{ boxShadow: '4px 4px 0 #000' }}
            >{label}</button>
          ))}

          {/* Spacer */}
          <div className="h-1" />

          {/* Zoom / arrange controls */}
          {([
            ['+', () => setZoomSync(Math.min(MAX_ZOOM, +(zoomRef.current * 1.2).toFixed(3)))],
            ['−', () => setZoomSync(Math.max(MIN_ZOOM, +(zoomRef.current * 0.8).toFixed(3)))],
            ['⊡', () => { setZoomSync(1); setPanSync({ x: 60, y: 60 }) }, 'Reset view'],
            ['⊞', () => { onAutoArrange(); setZoomSync(1); setPanSync({ x: 60, y: 60 }) }, 'Auto arrange'],
          ] as [string, () => void, string?][]).map(([label, action, title]) => (
            <button key={label} onMouseDown={e => e.stopPropagation()} onClick={action} title={title}
              className="w-9 h-9 bg-yellow-300 border-4 border-black font-black text-base flex items-center justify-center hover:bg-black hover:text-yellow-300 transition-colors"
              style={{ boxShadow: '4px 4px 0 #000' }}
            >{label}</button>
          ))}
        </div>

        <div className="absolute bottom-4 left-4 z-20 bg-white border-4 border-black px-3 py-1 pointer-events-none" style={{ boxShadow: '4px 4px 0 #000' }}>
          <span className="text-xs font-black uppercase tracking-widest opacity-60">{Math.round(zoom * 100)}%</span>
        </div>

        {drag?.kind === 'connect' && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-black text-yellow-300 border-4 border-yellow-300 px-4 py-2 pointer-events-none">
            <span className="text-xs font-black uppercase tracking-widest">Release over a task to connect</span>
          </div>
        )}

        {/* Canvas */}
        <div style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', width: maxX, height: maxY, position: 'absolute', top: 0, left: 0 }}>
          <svg style={{ position: 'absolute', top: 0, left: 0, width: maxX, height: maxY, pointerEvents: 'none', overflow: 'visible' }}>
            {tasks.flatMap(task =>
              task.dependsOn.filter(depId => positions[depId] && tasks.some(t => t.id === depId)).map(depId => {
                const key = `${depId}->${task.id}`
                const isHovered = hoveredArrow === key
                const fromTask = tasks.find(t => t.id === depId)!
                const edgeColor = fromTask?.labelColor || '#000'
                const strokeColor = isHovered ? '#d97706' : edgeColor
                const from = effectivePos(depId)
                const to = effectivePos(task.id)
                const x1 = from.x + CARD_W + PORT_OFFSET, y1 = from.y + cardH(depId) / 2
                const x2 = to.x - 14, y2 = to.y + cardH(task.id) / 2
                const mid = (x1 + x2) / 2
                const d = `M${x1} ${y1} C${mid} ${y1},${mid} ${y2},${x2} ${y2}`
                return (
                  <g key={key} style={{ pointerEvents: 'all', cursor: 'context-menu' }}
                    onMouseEnter={() => setHoveredArrow(key)}
                    onMouseLeave={() => setHoveredArrow(null)}
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ screenX: e.clientX, screenY: e.clientY, fromId: depId, toId: task.id }) }}>
                    <path d={d} stroke="transparent" strokeWidth="14" fill="none" />
                    <path d={d} fill="none"
                      stroke={strokeColor}
                      strokeWidth={isHovered ? 4 : 3}
                      style={{ transition: 'stroke 0.1s, stroke-width 0.1s' }} />
                    <polygon points={`${x2},${y2-5} ${x2+14},${y2} ${x2},${y2+5}`}
                      fill={strokeColor}
                      style={{ transition: 'fill 0.1s' }} />
                  </g>
                )
              })
            )}

            {connectPreview && positions[connectPreview.fromId] && (() => {
              const from = effectivePos(connectPreview.fromId)
              const fromTask = tasks.find(t => t.id === connectPreview.fromId)
              const edgeColor = fromTask?.labelColor || '#2563eb'
              const x1 = from.x + CARD_W + PORT_OFFSET, y1 = from.y + cardH(connectPreview.fromId) / 2
              const x2 = connectPreview.curX - 14, y2 = connectPreview.curY
              const mid = (x1 + x2) / 2
              return (
                <g style={{ pointerEvents: 'none' }}>
                  <path d={`M${x1} ${y1} C${mid} ${y1},${mid} ${y2},${x2} ${y2}`}
                    stroke={edgeColor} strokeWidth="3" strokeDasharray="8 4" fill="none" />
                  <polygon points={`${x2},${y2-5} ${x2+14},${y2} ${x2},${y2+5}`}
                    fill={edgeColor} />
                </g>
              )
            })()}
          </svg>

          {tasks.map((task, i) => {
            const pos = effectivePos(task.id)
            return (
              <div
                key={task.id}
                style={{ position: 'absolute', left: pos.x, top: pos.y }}
                ref={el => { cardElsRef.current[task.id] = el }}
              >
                <TaskCard
                  task={task} index={i}
                  isConnectTarget={connectPreview !== null && hoveredCard === task.id && hoveredCard !== connectPreview.fromId}
                  isConnectSource={connectPreview?.fromId === task.id}
                  onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} onNoteClick={onNoteClick}
                />
              </div>
            )
          })}
        </div>
      </div>

      {ctxMenu && (() => {
        const fromTask = tasks.find(t => t.id === ctxMenu.fromId)
        const toTask = tasks.find(t => t.id === ctxMenu.toId)
        return (
          <div style={{ position: 'fixed', left: ctxMenu.screenX, top: ctxMenu.screenY, zIndex: 1000 }} onMouseDown={e => e.stopPropagation()}>
            <div className="bg-white border-4 border-black" style={{ boxShadow: '6px 6px 0 #000', minWidth: 220 }}>
              <div className="bg-black text-yellow-300 px-4 py-2 border-b-4 border-black">
                <p className="text-xs font-black uppercase tracking-widest">Dependency</p>
              </div>
              <div className="px-4 py-2 border-b-4 border-black">
                <p className="text-xs font-mono opacity-60 truncate">{fromTask?.title ?? ctxMenu.fromId}</p>
                <p className="text-xs font-black">↓ blocks</p>
                <p className="text-xs font-mono opacity-60 truncate">{toTask?.title ?? ctxMenu.toId}</p>
              </div>
              <button onClick={() => { onDisconnect(ctxMenu.fromId, ctxMenu.toId); setCtxMenu(null) }}
                className="w-full px-4 py-3 text-xs font-black uppercase tracking-widest text-left hover:bg-red-500 hover:text-white transition-colors">
                ✕ Remove Dependency
              </button>
            </div>
          </div>
        )
      })()}
    </>
  )
}
