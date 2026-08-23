'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarClock, Pause, Play, Square, X, ArrowRight } from 'lucide-react'
import { useWidget } from './widget-context'
import { Logo } from './logo'
import { cn, formatHora } from './utils'
import { storage } from './storage'

export const TAMANO_BURBUJA = 50
export const MARGEN_ABIERTO = 24
const ANCHO_TARJETA = 320
const ALTURA_TARJETA_ESTIMADA = 300
const MARGEN = 16
const MARGEN_CERRADO = 24
const ALTO_PANEL_ABIERTO = 360
const CLAVE_POSICION = 'pc_widget_pos'
const CLAVE_CERRADO = 'pc_widget_cerrado'

export interface CompactOverride {
  burbuja: { x: number; y: number }
  panel: { x: number; y: number }
  panelArriba?: boolean
}

export function layoutCompact(abierto: boolean): {
  ventana: { w: number; h: number }
  burbuja: { x: number; y: number }
  alternativa: { x: number; y: number }
} {
  const burbujaCerrada = { x: MARGEN_CERRADO, y: MARGEN_CERRADO }
  return abierto
    ? {
        ventana: { w: ANCHO_TARJETA + MARGEN_ABIERTO * 2, h: ALTO_PANEL_ABIERTO },
        burbuja: { x: MARGEN_ABIERTO, y: MARGEN_ABIERTO },
        alternativa: {
          x: ANCHO_TARJETA + MARGEN_ABIERTO * 2 - TAMANO_BURBUJA - MARGEN_ABIERTO,
          y: ALTO_PANEL_ABIERTO - TAMANO_BURBUJA - MARGEN_ABIERTO,
        },
      }
    : {
        ventana: { w: TAMANO_BURBUJA + MARGEN_CERRADO * 2, h: TAMANO_BURBUJA + MARGEN_CERRADO * 2 },
        burbuja: burbujaCerrada,
        alternativa: burbujaCerrada,
      }
}

interface Posicion {
  x: number
  y: number
}

function posicionPorDefecto(): Posicion {
  return {
    x: window.innerWidth - TAMANO_BURBUJA - MARGEN,
    y: window.innerHeight - TAMANO_BURBUJA - MARGEN,
  }
}

function esPosicionValida(posicion: unknown): posicion is Posicion {
  if (!posicion || typeof posicion !== 'object') return false
  const p = posicion as Record<string, unknown>
  return (
    typeof p.x === 'number' &&
    Number.isFinite(p.x) &&
    typeof p.y === 'number' &&
    Number.isFinite(p.y)
  )
}

function limitar(posicion: Posicion): Posicion {
  const maxX = Math.max(window.innerWidth - TAMANO_BURBUJA, 0)
  const maxY = Math.max(window.innerHeight - TAMANO_BURBUJA, 0)
  return {
    x: Math.min(Math.max(posicion.x, 0), maxX),
    y: Math.min(Math.max(posicion.y, 0), maxY),
  }
}

function formatearTiempo(ms: number): string {
  const totalSegundos = Math.max(0, Math.floor(ms / 1000))
  const horas = Math.floor(totalSegundos / 3600)
  const minutos = Math.floor((totalSegundos % 3600) / 60)
  const segundos = totalSegundos % 60
  const dos = (n: number) => String(n).padStart(2, '0')
  if (horas > 0) return `${horas}:${dos(minutos)}:${dos(segundos)}`
  return `${dos(minutos)}:${dos(segundos)}`
}

export function ActivityWidget({
  onNavigate,
  compact = false,
  onPanelToggle,
  startDrag,
  moveWindow,
  getWindowPos,
  compactOverride = null,
}: {
  onNavigate?: (path: string) => void
  compact?: boolean
  onPanelToggle?: (abierto: boolean) => void | Promise<void>
  startDrag?: () => void | Promise<void>
  moveWindow?: (x: number, y: number) => void | Promise<void>
  getWindowPos?: () => Promise<{ x: number; y: number }>
  compactOverride?: CompactOverride | null
} = {}) {
  const { actividadActual, pausarActividad, reanudarActividad, finalizarActividad } =
    useWidget()
  const [montado, setMontado] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [cerrado, setCerrado] = useState(false)
  const [posicion, setPosicion] = useState<Posicion>({ x: 0, y: 0 })
  const [arrastrando, setArrastrando] = useState(false)
  const [tick, setTick] = useState(0)
  const [alertaVisible, setAlertaVisible] = useState(false)
  const ultimoAvisoRef = useRef(Date.now())

  const inicioArrastre = useRef<{ x: number; y: number } | null>(null)
  const seArrastro = useRef(false)
  const posicionRef = useRef(posicion)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragStarted = useRef(false)
  const toggleLock = useRef(false)

  useEffect(() => {
    storage.get(CLAVE_POSICION).then((guardada) => {
      let parsed: Posicion | null = null
      try { parsed = guardada ? JSON.parse(guardada) : null } catch { parsed = null }
      setPosicion(limitar(esPosicionValida(parsed) ? parsed : posicionPorDefecto()))
    })
    storage.get(CLAVE_CERRADO).then((val) => {
      setCerrado(val === 'true')
    })
    setMontado(true)
  }, [])

  useEffect(() => {
    const manejarResize = () => setPosicion((prev) => limitar(prev))
    window.addEventListener('resize', manejarResize)
    return () => window.removeEventListener('resize', manejarResize)
  }, [])

  useEffect(() => {
    return () => { if (clickTimer.current) clearTimeout(clickTimer.current) }
  }, [])

  useEffect(() => {
    posicionRef.current = posicion
  }, [posicion])

  useEffect(() => {
    if (!actividadActual) return
    const id = window.setInterval(() => setTick((v) => v + 1), 1000)
    return () => window.clearInterval(id)
  }, [actividadActual])

  useEffect(() => {
    ultimoAvisoRef.current = Date.now()
    setAlertaVisible(false)
  }, [actividadActual?.id])

  useEffect(() => {
    if (!actividadActual || actividadActual.estado !== 'EN_CURSO' || alertaVisible) return
    const comprobar = () => {
      if (Date.now() - ultimoAvisoRef.current >= 15 * 60 * 1000) {
        setAlertaVisible(true)
        setAbierto(true)
      }
    }
    const id = window.setInterval(comprobar, 15_000)
    comprobar()
    return () => window.clearInterval(id)
  }, [actividadActual, alertaVisible])

  const continuarAlerta = () => {
    ultimoAvisoRef.current = Date.now()
    setAlertaVisible(false)
  }

  const manejarInicio = (evento: React.PointerEvent) => {
    inicioArrastre.current = { x: evento.clientX, y: evento.clientY }
    seArrastro.current = false
    dragStarted.current = false
    setArrastrando(true)
    ;(evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId)
  }

  const manejarMovimiento = async (evento: React.PointerEvent) => {
    if (!inicioArrastre.current) return
    const dx = evento.clientX - inicioArrastre.current.x
    const dy = evento.clientY - inicioArrastre.current.y
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      seArrastro.current = true
      if (compact && startDrag && !dragStarted.current) {
        dragStarted.current = true
        ;(evento.currentTarget as HTMLElement).releasePointerCapture(evento.pointerId)
        await startDrag()
      } else if (!compact) {
        setPosicion(
          limitar({
            x: posicionRef.current.x + dx,
            y: posicionRef.current.y + dy,
          }),
        )
        inicioArrastre.current = { x: evento.clientX, y: evento.clientY }
      }
    }
  }

  const manejarFin = () => {
    inicioArrastre.current = null
    setArrastrando(false)
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null }
    if (!compact) {
      storage.set(CLAVE_POSICION, JSON.stringify(posicionRef.current))
    }
  }

  const alternar = async () => {
    if (seArrastro.current) {
      seArrastro.current = false
      return
    }
    if (toggleLock.current) return
    toggleLock.current = true
    const nuevoAbierto = !abierto
    try {
      if (!nuevoAbierto) setAbierto(false)
      if (onPanelToggle) await onPanelToggle(nuevoAbierto)
      if (nuevoAbierto) setAbierto(true)
    } finally {
      toggleLock.current = false
    }
  }

  const cerrarPanel = async () => {
    if (toggleLock.current || !abierto) return
    toggleLock.current = true
    setAbierto(false)
    try {
      if (onPanelToggle) await onPanelToggle(false)
    } finally {
      toggleLock.current = false
    }
  }

  const hayActividad = !!actividadActual
  const pausada = actividadActual?.estado === 'PAUSADA'
  const enCurso = actividadActual?.estado === 'EN_CURSO'
  const tiempoTranscurrido = (() => {
    if (!actividadActual) return 0
    if (pausada && actividadActual.duracion_segundos != null) {
      return Math.max(
        0,
        (Number(actividadActual.duracion_segundos) - Number(actividadActual.pausa_acumulada_segundos || 0)) * 1000,
      )
    }
    const inicioMs = new Date(actividadActual.inicio).getTime()
    const ahoraMs = enCurso ? Date.now() : inicioMs
    const finMs = actividadActual.fin ? new Date(actividadActual.fin).getTime() : ahoraMs
    const totalBruto = Math.max(0, finMs - inicioMs)
    return Math.max(0, totalBruto - (actividadActual.pausa_acumulada_segundos || 0) * 1000)
  })()

  if (!montado || (cerrado && !compact)) return null

  const izquierda = Math.max(
    Math.min(posicion.x + TAMANO_BURBUJA - ANCHO_TARJETA / 2, window.innerWidth - ANCHO_TARJETA - MARGEN),
    MARGEN,
  )
  const espacioAbajo = window.innerHeight - (posicion.y + TAMANO_BURBUJA) - MARGEN
  const abrirAbajo = espacioAbajo >= ALTURA_TARJETA_ESTIMADA
  const superior = abrirAbajo
    ? posicion.y + TAMANO_BURBUJA + 8
    : posicion.y - ALTURA_TARJETA_ESTIMADA - 8

  const layout = compact ? layoutCompact(abierto) : null
  const compactBubbleLeft = compactOverride?.burbuja.x ?? layout?.burbuja.x ?? 0
  const compactBubbleTop = compactOverride?.burbuja.y ?? layout?.burbuja.y ?? 0
  const compactPanelLeft = compactOverride?.panel.x ?? compactBubbleLeft
  const compactPanelTop = compactOverride?.panel.y ?? compactBubbleTop + TAMANO_BURBUJA + 10

  return (
    <>
       <style>{`@keyframes pc-pulso{0%{box-shadow:0 0 0 0 rgba(167,139,250,.48),0 0 8px 0 rgba(167,139,250,.22)}70%{box-shadow:0 0 0 9px rgba(167,139,250,0),0 0 16px 3px rgba(167,139,250,.08)}100%{box-shadow:0 0 0 0 rgba(167,139,250,0),0 0 8px 0 rgba(167,139,250,.22)}}`}</style>
      <button
        onPointerDown={manejarInicio}
        onPointerMove={manejarMovimiento}
        onPointerUp={manejarFin}
        onClick={alternar}
        aria-label="Actividad en curso"
        className={cn(
          'no-print fixed z-50 touch-none select-none',
          arrastrando ? 'cursor-grabbing scale-110' : 'cursor-grab hover:scale-[1.09]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]',
        )}
        style={{
          left: compact ? compactBubbleLeft : posicion.x,
          top: compact ? compactBubbleTop : posicion.y,
          width: TAMANO_BURBUJA,
          height: TAMANO_BURBUJA,
          borderRadius: 17,
          background: 'linear-gradient(135deg, #3b0764 0%, #1e1b4b 100%)',
           filter: 'drop-shadow(0 4px 11px rgba(124, 58, 237, 0.28))',
          transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {enCurso && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              inset: -3,
              borderRadius: 19,
              pointerEvents: 'none',
              animation: 'pc-pulso 1.8s ease-out infinite',
            }}
          />
        )}
        {pausada && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              inset: -3,
              borderRadius: 19,
              pointerEvents: 'none',
              boxShadow:
                '0 0 0 1px rgba(107,114,128,.4), inset 0 0 8px 2px rgba(107,114,128,.35)',
            }}
          />
        )}
        <span className="relative z-10 flex" style={{ padding: 1 }}>
          <Logo size={TAMANO_BURBUJA} radius={17} innerRatio={0.9} />
        </span>
      </button>

      {!compact && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            storage.set(CLAVE_CERRADO, 'true')
            setCerrado(true)
          }}
          aria-label="Cerrar widget"
          className="no-print fixed z-[60] flex h-5 w-5 items-center justify-center rounded-full bg-[#7c3aed] text-white shadow-md transition-colors hover:bg-[#7c3aed]/90"
          style={{
            left: posicion.x + TAMANO_BURBUJA - 5,
            top: posicion.y - 5,
          }}
        >
          <X size={12} />
        </button>
      )}

      {abierto && (
        <div
          className="no-print fixed z-50 overflow-hidden rounded-2xl bg-card animate-in fade-in"
          style={{
            left: compact ? compactPanelLeft : izquierda,
            ...(compact && compactOverride?.panelArriba
              ? { bottom: (layout?.ventana.h ?? 0) - compactBubbleTop + 10 }
              : { top: compact ? compactPanelTop : superior }),
            width: ANCHO_TARJETA,
            boxShadow: '0 18px 50px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div className="flex items-center justify-between bg-white/[0.03] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Logo size={26} radius={8} />
              <span className="text-sm font-semibold text-foreground">
                {hayActividad ? 'Actividad en curso' : 'Actividades'}
              </span>
            </div>
            <button
              onClick={cerrarPanel}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>

           <div className={cn('p-4', compact && 'max-h-[220px] overflow-y-auto')}>
            {alertaVisible && actividadActual ? (
              <div className="rounded-xl border border-[#7c3aed]/30 bg-[#7c3aed]/10 p-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#7c3aed]/20 text-[#c4b5fd]">
                    <CalendarClock size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">¿Sigues trabajando?</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Confirma si continúas con esta actividad.</p>
                  </div>
                </div>
                <p className="mt-3 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground">
                  {actividadActual.descripcion || 'Actividad en curso'}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={continuarAlerta}
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-[#7c3aed]/40"
                  >
                    Continuar
                  </button>
                  <button
                    onClick={finalizarActividad}
                    className="flex-1 rounded-lg bg-[#7c3aed] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7c3aed]/90"
                  >
                    Finalizar
                  </button>
                </div>
              </div>
            ) : hayActividad && actividadActual ? (
              <>
                <p className="text-sm font-medium leading-snug text-foreground">
                  {actividadActual.descripcion}
                </p>

                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tiempo transcurrido</span>
                    <span className="font-semibold text-[#c4b5fd] tabular-nums">
                      {formatearTiempo(tiempoTranscurrido)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Hora de inicio</span>
                    <span className="font-semibold text-[#c4b5fd]">{formatHora(actividadActual.inicio)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Estado</span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn('h-2 w-2 rounded-full', pausada ? 'bg-[#6b7280]' : 'bg-[#34d399]')}
                        style={pausada ? undefined : { boxShadow: '0 0 8px 1px rgba(52, 211, 153, 0.8)' }}
                      />
                      <span className={cn('font-medium', pausada ? 'text-[#9ca3af]' : 'text-[#a78bfa]')}>
                        {pausada ? 'Pausada' : 'En curso'}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={pausada ? reanudarActividad : pausarActividad}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                      pausada
                        ? 'border-[#7c3aed]/40 bg-[#7c3aed]/15 text-[#c4b5fd] hover:bg-[#7c3aed]/25'
                        : 'border-border bg-muted text-foreground hover:border-[#7c3aed]/40',
                    )}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      {pausada ? <Play size={15} /> : <Pause size={15} />}
                      {pausada ? 'Reanudar' : 'Pausar'}
                    </span>
                  </button>
                  <button
                    onClick={finalizarActividad}
                    className="flex-1 rounded-lg bg-[#7c3aed] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#7c3aed]/90"
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <Square size={14} />
                      Finalizar
                    </span>
                  </button>
                </div>
              </>
            ) : (
              <div className="py-2">
                <p className="text-sm text-muted-foreground">
                  No tienes una actividad en curso.
                </p>
                {onNavigate && (
                  <button
                    onClick={() => { onNavigate('/actividades'); setAbierto(false) }}
                    className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#7c3aed]/15 px-3 py-2 text-sm font-medium text-[#c4b5fd] transition-colors hover:bg-[#7c3aed]/25"
                  >
                    Ir a actividades
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
