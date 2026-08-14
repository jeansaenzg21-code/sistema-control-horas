'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Pause, Play, Square, X, ArrowRight } from 'lucide-react'
import { useActividad } from '@/lib/actividad-context'
import { obtenerEstiloEstado } from '@/lib/estado'
import { formatearTiempoTranscurrido } from '@/lib/format'
import { leerStorage, escribirStorage } from '@/lib/storage'
import { Logo } from './logo'
import { cn } from '@/lib/utils'

const TAMANO_BURBUJA = 46
const ANCHO_TARJETA = 320
const ALTURA_TARJETA_ESTIMADA = 300
const MARGEN = 16
const CLAVE_POSICION = 'pc_widget_pos'
const CLAVE_CERRADO = 'pc_widget_cerrado'

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

export function ActivityWidget() {
  const { actividadActual, pausarActividad, reanudarActividad, finalizarActividad } =
    useActividad()
  const [montado, setMontado] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const [cerrado, setCerrado] = useState(false)
  const [posicion, setPosicion] = useState<Posicion>({ x: 0, y: 0 })
  const [arrastrando, setArrastrando] = useState(false)
  const [tick, setTick] = useState(0)

  const inicioArrastre = useRef<{ x: number; y: number } | null>(null)
  const seArrastro = useRef(false)
  const posicionRef = useRef(posicion)

  // Carga y restauración de la posición guardada
  useEffect(() => {
    const guardada = leerStorage<Posicion>(CLAVE_POSICION)
    setPosicion(limitar(esPosicionValida(guardada) ? guardada : posicionPorDefecto()))
    setCerrado(leerStorage<boolean>(CLAVE_CERRADO) === true)
    setMontado(true)
  }, [])

  // Re-encaje de la posición si la ventana cambia de tamaño
  useEffect(() => {
    const manejarResize = () => setPosicion((prev) => limitar(prev))
    window.addEventListener('resize', manejarResize)
    return () => window.removeEventListener('resize', manejarResize)
  }, [])

  useEffect(() => {
    posicionRef.current = posicion
  }, [posicion])

  // Cronómetro: repinta cada segundo mientras haya actividad activa
  useEffect(() => {
    if (!actividadActual) return
    const id = window.setInterval(() => setTick((v) => v + 1), 1000)
    return () => window.clearInterval(id)
  }, [actividadActual])

  const manejarInicio = (evento: React.PointerEvent) => {
    inicioArrastre.current = { x: evento.clientX, y: evento.clientY }
    seArrastro.current = false
    setArrastrando(true)
    ;(evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId)
  }

  const manejarMovimiento = (evento: React.PointerEvent) => {
    if (!inicioArrastre.current) return
    const dx = evento.clientX - inicioArrastre.current.x
    const dy = evento.clientY - inicioArrastre.current.y
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) seArrastro.current = true
    setPosicion(
      limitar({
        x: posicionRef.current.x + dx,
        y: posicionRef.current.y + dy,
      }),
    )
    inicioArrastre.current = { x: evento.clientX, y: evento.clientY }
  }

  const manejarFin = () => {
    inicioArrastre.current = null
    setArrastrando(false)
    escribirStorage(CLAVE_POSICION, posicionRef.current)
  }

  const alternar = () => {
    if (seArrastro.current) {
      seArrastro.current = false
      return
    }
    setAbierto((valor) => !valor)
  }

  const hayActividad = !!actividadActual
  const pausada = actividadActual?.estado === 'pausada'
  const enCurso = actividadActual?.estado === 'en_curso'
  const estadoEstilo = actividadActual ? obtenerEstiloEstado(actividadActual.estado) : null
  const tiempoTranscurrido = actividadActual
    ? (actividadActual.acumuladoMs || 0) + (enCurso ? Date.now() - actividadActual.iniciadaEn : 0)
    : 0

  if (!montado || cerrado) return null

  const izquierda = Math.max(
    Math.min(posicion.x + TAMANO_BURBUJA - ANCHO_TARJETA / 2, window.innerWidth - ANCHO_TARJETA - MARGEN),
    MARGEN,
  )
  const espacioAbajo = window.innerHeight - (posicion.y + TAMANO_BURBUJA) - MARGEN
  const abrirAbajo = espacioAbajo >= ALTURA_TARJETA_ESTIMADA
  const superior = abrirAbajo
    ? posicion.y + TAMANO_BURBUJA + 8
    : posicion.y - ALTURA_TARJETA_ESTIMADA - 8

  return (
    <>
      {/* Burbuja flotante arrastrable */}
      <button
        onPointerDown={manejarInicio}
        onPointerMove={manejarMovimiento}
        onPointerUp={manejarFin}
        onClick={alternar}
        aria-label="Actividad en curso"
        className={cn(
          'no-print fixed z-50 touch-none select-none rounded-full transition-shadow duration-150',
          arrastrando ? 'cursor-grabbing scale-105' : 'cursor-grab hover:scale-105',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]',
        )}
        style={{ left: posicion.x, top: posicion.y, width: TAMANO_BURBUJA, height: TAMANO_BURBUJA }}
      >
        <Logo size={TAMANO_BURBUJA} />
        {hayActividad && !pausada && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#a78bfa] opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-[#a78bfa]" />
          </span>
        )}
      </button>

      {/* Botón para cerrar el widget */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          escribirStorage(CLAVE_CERRADO, true)
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

      {/* Tarjeta desplegable */}
      {abierto && (
        <div
          className="no-print fixed z-50 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/50 animate-in slide-in-from-bottom-4"
          style={{ left: izquierda, top: superior, width: ANCHO_TARJETA }}
        >
          {/* Cabecera */}
          <div className="flex items-center justify-between border-b border-border bg-header px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Logo size={26} />
              <span className="text-sm font-semibold text-foreground">
                {hayActividad ? 'Actividad en curso' : 'Actividades'}
              </span>
            </div>
            <button
              onClick={() => setAbierto(false)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>

          <div className="p-4">
            {hayActividad && actividadActual ? (
              <>
                <p className="text-sm font-medium leading-snug text-foreground">
                  {actividadActual.titulo}
                </p>

                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tiempo transcurrido</span>
                    <span className="font-semibold text-[#c4b5fd] tabular-nums">
                      {formatearTiempoTranscurrido(tiempoTranscurrido)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Hora de inicio</span>
                    <span className="font-semibold text-[#c4b5fd]">{actividadActual.horaInicio}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Estado</span>
                    <span className="flex items-center gap-1.5">
                      <span className={cn('h-2 w-2 rounded-full', estadoEstilo?.dot)} />
                      <span className={cn('font-medium', estadoEstilo?.text)}>
                        {estadoEstilo?.label}
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
                  No tienes una actividad en curso. Inicia una desde el módulo de actividades.
                </p>
                <Link
                  href="/actividades"
                  onClick={() => setAbierto(false)}
                  className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#7c3aed]/15 px-3 py-2 text-sm font-medium text-[#c4b5fd] transition-colors hover:bg-[#7c3aed]/25"
                >
                  Ir a actividades
                  <ArrowRight size={15} />
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}