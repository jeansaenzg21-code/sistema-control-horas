'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { StatusBadge } from './status-badge'
import { useRegistros } from '@/lib/use-registros'
import { duracionAHoras, normalizarFecha } from '@/lib/format'
import type { Actividad } from '@/lib/types'

const POR_PAGINA = 40

function mesKeyActual(): string {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
}

function hoyKey(): string {
  const ahora = new Date()
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(
    ahora.getDate(),
  ).padStart(2, '0')}`
}

function etiquetaMes(mesKey: string): string {
  const [anio, mes] = mesKey.split('-').map(Number)
  return new Date(anio, mes - 1, 1).toLocaleDateString('es-PE', {
    month: 'long',
    year: 'numeric',
  })
}

function mesKeyDeFecha(fecha: string): string | null {
  const norm = normalizarFecha(fecha)
  return norm ? norm.slice(0, 7) : null
}

function etiquetaDia(fecha: string): string {
  const norm = normalizarFecha(fecha)
  const [anio, mes, dia] = norm.split('-').map(Number)
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
    return normalizarFecha(fecha) !== hoyKey()
  }

  const toggleDia = (fecha: string) => {
    setSobrescrito((prev) => ({ ...prev, [fecha]: !esColapsado(fecha) }))
  }

  const delMes = useMemo(() => {
    return registros
      .filter((r) => mesKeyDeFecha(r.fecha) === mes)
      .sort((a, b) => {
        const da = normalizarFecha(a.fecha) ?? ''
        const db = normalizarFecha(b.fecha) ?? ''
        if (da !== db) return da < db ? 1 : -1
        return (a.horaInicio ?? '') < (b.horaInicio ?? '') ? 1 : -1
      })
  }, [registros, mes])

  const filas = useMemo(() => {
    const out: Fila[] = []
    let fechaActual = ''
    let totalDia = 0
    const itemsDia: Actividad[] = []
    const cerrarDia = () => {
      if (itemsDia.length === 0) return
      out.push({
        key: `d-${fechaActual}`,
        tipo: 'encabezado',
        fecha: fechaActual,
        totalHoras: totalDia,
      })
      for (const r of itemsDia) out.push({ key: r.id, tipo: 'registro', registro: r })
    }
    for (const r of delMes) {
      if (r.fecha !== fechaActual) {
        cerrarDia()
        fechaActual = r.fecha
        totalDia = 0
        itemsDia.length = 0
      }
      totalDia += duracionAHoras(r.duracion)
      itemsDia.push(r)
    }
    cerrarDia()
    return out
  }, [delMes])

  const totalMes = useMemo(
    () => delMes.reduce((acc, r) => acc + duracionAHoras(r.duracion), 0),
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
                if (esColapsado(fila.registro.fecha)) return null
                return (
                  <tr
                    key={fila.key}
                    className="border-b border-border/60 transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-2.5">
                      <p className="flex items-center gap-2 font-medium text-foreground">
                        {esNueva(fila.registro) && (
                          <span
                            className="h-2 w-2 flex-none rounded-full bg-blue-500"
                            title="Nuevo registro"
                          />
                        )}
                        <span>{fila.registro.titulo}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fila.registro.tipo}
                        {fila.registro.tipo ? ' · ' : ''}
                        {etiquetaFacturable(fila.registro.facturable)}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {fila.registro.horaInicio}
                    </td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                      {fila.registro.horaFin ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {fila.registro.duracion ?? '—'}
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

function etiquetaFacturable(facturable: boolean | null | undefined): string {
  if (facturable == null) return 'Por definir'
  return facturable ? 'Facturable' : 'No facturable'
}

function esNueva(registro: Actividad): boolean {
  if (!registro.creadaEn) return false
  return Date.now() - registro.creadaEn < 24 * 60 * 60 * 1000
}
