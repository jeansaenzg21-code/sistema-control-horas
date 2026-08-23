'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { StatusBadge } from './status-badge'
import { useRegistros } from '@/lib/use-registros'
import type { Actividad } from '@/lib/types'
import { esFacturable, esNoFacturable, fechaLocalISO } from '@/lib/utils'

const POR_PAGINA = 40

function mesKeyActual(): string {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
}

function etiquetaMes(mesKey: string): string {
  const [anio, mes] = mesKey.split('-').map(Number)
  return new Date(anio, mes - 1, 1).toLocaleDateString('es-PE', {
    month: 'long',
    year: 'numeric',
  })
}

function mesKeyDeFecha(fecha: string): string | null {
  if (!fecha) return null
  return fecha.slice(0, 7)
}

function etiquetaDia(fecha: string): string {
  if (!fecha) return ''
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function moverMes(mesKey: string, delta: number): string {
  const [anio, mes] = mesKey.split('-').map(Number)
  const fecha = new Date(anio, mes - 1 + delta, 1)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

function hoyKey(): string {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`
}

function fechaDeInicio(inicio: string): string {
  return fechaLocalISO(inicio)
}

function horaDeInicio(inicio: string): string {
  return String(inicio).split('T')[1]?.slice(0, 5) || ''
}

type Fila =
  | { key: string; tipo: 'encabezado'; fecha: string; totalHoras: number }
  | { key: string; tipo: 'registro'; registro: Actividad }

export function MisRegistros() {
  const registros = useRegistros()
  const [mes, setMes] = useState(mesKeyActual)
  const [visibles, setVisibles] = useState(POR_PAGINA)
  const [sobrescrito, setSobrescrito] = useState<Record<string, boolean>>({})

  const esColapsado = (fecha: string) => {
    if (fecha in sobrescrito) return sobrescrito[fecha]
    return fecha !== hoyKey()
  }

  const toggleDia = (fecha: string) => {
    setSobrescrito((prev) => ({ ...prev, [fecha]: !esColapsado(fecha) }))
  }

  const delMes = useMemo(() => {
    return registros
      .filter((r) => mesKeyDeFecha(fechaDeInicio(r.inicio)) === mes)
      .sort((a, b) => fechaDeInicio(b.inicio).localeCompare(fechaDeInicio(a.inicio)) || horaDeInicio(b.inicio).localeCompare(horaDeInicio(a.inicio)))
  }, [registros, mes])

  const filas = useMemo(() => {
    const out: Fila[] = []
    let fechaActual = ''
    let totalDia = 0
    const itemsDia: Actividad[] = []
    const cerrarDia = () => {
      if (itemsDia.length === 0) return
      out.push({ key: `d-${fechaActual}`, tipo: 'encabezado', fecha: fechaActual, totalHoras: totalDia })
      for (const r of itemsDia) out.push({ key: String(r.id), tipo: 'registro', registro: r })
    }
    for (const r of delMes) {
      const fechaReg = fechaDeInicio(r.inicio)
      if (fechaReg !== fechaActual) {
        cerrarDia()
        fechaActual = fechaReg
        totalDia = 0
        itemsDia.length = 0
      }
      totalDia += calcularHoras(r)
      itemsDia.push(r)
    }
    cerrarDia()
    return out
  }, [delMes])

  const totalMes = useMemo(
    () => delMes.reduce((acc, r) => acc + calcularHoras(r), 0),
    [delMes],
  )

  const visiblesAhora = filas.slice(0, visibles)
  const cambiarMes = (nuevo: string) => {
    setMes(nuevo)
    setVisibles(POR_PAGINA)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <div>
          <p className="text-xs text-muted-foreground">
            {delMes.length}{' '}
            {delMes.length === 1 ? 'registro en' : 'registros en'} ·{' '}
            <span className="font-semibold text-foreground">{totalMes.toFixed(1)}h</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => cambiarMes(moverMes(mes, -1))}
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-[#7c3aed]/40 hover:text-foreground"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-32 text-center text-sm font-semibold capitalize text-foreground">
            {etiquetaMes(mes)}
          </span>
          <button
            onClick={() => cambiarMes(moverMes(mes, 1))}
            className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-[#7c3aed]/40 hover:text-foreground"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={16} />
          </button>
          {mes !== mesKeyActual() && (
            <button
              onClick={() => cambiarMes(mesKeyActual())}
              className="ml-1 rounded-lg border border-[#7c3aed]/40 bg-[#7c3aed]/10 px-3 py-1.5 text-sm font-medium text-[#c4b5fd] transition-colors hover:bg-[#7c3aed]/20"
            >
              Mes actual
            </button>
          )}
        </div>
      </div>

      {delMes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-5 py-10 text-center">
          <Inbox size={28} className="mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No tienes registros en {etiquetaMes(mes)}.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Inicia una actividad para comenzar a registrar tu tiempo.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <tbody>
              {visiblesAhora.map((fila) => {
                if (fila.tipo === 'encabezado') {
                  const abierto = !esColapsado(fila.fecha)
                  return (
                    <tr key={fila.key} className="border-b border-border bg-muted/40">
                      <td colSpan={5} className="px-2 py-1">
                        <button
                          onClick={() => toggleDia(fila.fecha)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                        >
                          <span className="flex items-center gap-2">
                            {abierto ? (
                              <ChevronDown size={15} className="text-muted-foreground" />
                            ) : (
                              <ChevronRight size={15} className="text-muted-foreground" />
                            )}
                            <span className="text-xs font-semibold capitalize text-foreground">
                              {etiquetaDia(fila.fecha)}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {fila.totalHoras.toFixed(1)}h
                          </span>
                        </button>
                      </td>
                    </tr>
                  )
                }
                const fechaReg = fechaDeInicio(fila.registro.inicio)
                if (esColapsado(fechaReg)) return null
                return (
                  <tr
                    key={fila.key}
                    className="border-b border-border/60 transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-2.5">
                      <p className="flex items-center gap-2 font-medium text-foreground">
                        <span>{fila.registro.descripcion}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fila.registro.tipo_actividad_nombre || ''}
                        {esFacturable(fila.registro.facturable)
                          ? ' · Facturable'
                          : esNoFacturable(fila.registro.facturable)
                            ? ' · No facturable'
                            : ''}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {horaDeInicio(fila.registro.inicio)}
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                      {fila.registro.fin ? String(fila.registro.fin).split('T')[1]?.slice(0, 5) || '—' : '—'}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {formatDuracion(fila.registro)}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge estado={fila.registro.estado} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {visibles < filas.length && (
            <div className="border-t border-border p-3 text-center">
              <button
                onClick={() => setVisibles((v) => v + POR_PAGINA)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-[#7c3aed]/40 hover:text-[#7c3aed]"
              >
                Cargar más registros
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function calcularHoras(r: Actividad): number {
  if (!r.fin || !r.inicio) return 0
  const diff = (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 1000
  return Math.max(0, (diff - (r.pausa_acumulada_segundos || 0)) / 3600)
}

function formatDuracion(r: Actividad): string {
  if (!r.fin || !r.inicio) return '—'
  const segs = Math.max(0, (new Date(r.fin).getTime() - new Date(r.inicio).getTime()) / 1000 - (r.pausa_acumulada_segundos || 0))
  const h = Math.floor(segs / 3600)
  const m = Math.floor((segs % 3600) / 60)
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}
