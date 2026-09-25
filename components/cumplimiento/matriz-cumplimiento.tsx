'use client'

import { useEffect, useState } from 'react'
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import type { CumplimientoReporte, EstadoDia } from '@/lib/cumplimiento'
import { formatoHoras } from '@/lib/utils'

interface Props {
  datos: CumplimientoReporte
}

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const LETRAS_DIA = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const COLABORADORES_POR_PAGINA = 10

const NOMBRE_ESTADO: Record<EstadoDia, string> = {
  reportado: 'Reportado',
  pendiente: 'Pendiente (sin registro)',
  incompleto: 'Incompleto — revisar',
  feriado: 'Feriado',
  vacacion: 'Vacaciones',
  no_exigible: 'No exigible (fin de semana)',
}

function claseDia(estado: EstadoDia): string {
  const mapa: Record<EstadoDia, string> = {
    reportado: 'bg-emerald-500/10 text-emerald-400',
    pendiente: 'bg-transparent text-muted-foreground',
    incompleto: 'bg-amber-500/10 text-amber-400',
    feriado: 'bg-purple-500/10 text-purple-400',
    vacacion: 'bg-sky-500/10 text-sky-400',
    no_exigible: 'bg-muted/30 text-muted-foreground/40',
  }
  return mapa[estado]
}

function claseColumnaDia(indice: number, total: number): string {
  if (total === 1) return 'w-7 px-0.5'
  if (indice === 0) return 'w-7 pl-0.5'
  if (indice === total - 1) return 'w-7 pr-0.5'
  return 'w-6 px-0'
}

function nombreCompacto(nombre: string): string {
  const partes = nombre.trim().split(/\s+/)
  if (partes.length >= 3) return `${partes[2]} ${partes[0]}`
  return partes.slice(0, 2).join(' ')
}

const CLASE_BADGE_ESTADO: Record<CumplimientoReporte['colaboradores'][number]['estado'], string> = {
  CUMPLE: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  CUMPLE_PARCIAL: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  NO_CUMPLE: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
}

export function MatrizCumplimiento({ datos }: Props) {
  const dias = datos.periodo.dias.filter((d) => !d.fin_semana)
  const { colaboradores } = datos
  const [pagina, setPagina] = useState(1)
  const totalPaginas = Math.max(1, Math.ceil(colaboradores.length / COLABORADORES_POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const inicio = (paginaActual - 1) * COLABORADORES_POR_PAGINA
  const colaboradoresPagina = colaboradores.slice(inicio, inicio + COLABORADORES_POR_PAGINA)

  useEffect(() => {
    setPagina(1)
  }, [colaboradores])

  const titulo = `Matriz de cumplimiento · ${NOMBRES_MESES[datos.periodo.mes - 1]} ${datos.periodo.anio}`

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-5 py-3">
        <h2 className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
          <CalendarCheck size={16} className="text-[#a78bfa]" />
          {titulo}
        </h2>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{colaboradores.length} colaborador(es)</span>
          <span className="hidden sm:inline">
            · E: exigibles · R: reportados · Inc: incompletos · P: pendientes
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
        <span className="font-medium uppercase tracking-wider text-foreground/70">Leyenda:</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-500/10 text-[10px] font-bold text-emerald-400">✓</span>
          Reportado
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-transparent text-[10px] font-bold text-muted-foreground">·</span>
          Pendiente
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-amber-500/10 text-[10px] font-bold text-amber-400">!</span>
          Incompleto
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-purple-500/10 text-[10px] font-bold text-purple-400">F</span>
          Feriado
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-sky-500/10 text-[10px] font-bold text-sky-400">V</span>
          Vacaciones
        </span>
      </div>

      {colaboradores.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          No hay colaboradores activos para evaluar en este período.
        </p>
      ) : (
        <div className="w-full overflow-x-auto overscroll-x-contain">
          <table className="w-full table-fixed border-separate border-spacing-x-[2px] border-spacing-y-0 text-sm">
            <thead className="bg-muted/20">
              <tr>
                <th className="w-[150px] border-b border-r border-border px-3 py-2.5 text-left text-[11px] font-semibold text-foreground">
                  Colaborador
                </th>
                {dias.map((d, index) => (
                  <th
                    key={d.fecha}
                    title={d.fecha}
                    className={`${claseColumnaDia(index, dias.length)} border-b border-border/70 py-2 text-center text-foreground ${index === dias.length - 1 ? 'border-r border-border' : ''}`}
                  >
                    <span className="mx-auto flex h-6 w-6 flex-col items-center justify-center rounded-md bg-muted/30 px-0">
                      <span className="text-[7px] font-semibold uppercase leading-none text-[#a78bfa]">
                        {LETRAS_DIA[d.dia_semana]}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-bold tabular-nums leading-none text-foreground">
                        {d.dia}
                      </span>
                    </span>
                  </th>
                ))}
                <th className="w-[72px] border-b border-r border-border px-2 py-2.5 text-center text-[11px] font-semibold text-foreground">
                  Cobertura
                </th>
                <th className="w-[86px] min-w-[86px] border-b border-r border-border px-2 py-2.5 text-center text-[11px] font-semibold text-foreground">
                  Estado
                </th>
                <th className="w-[160px] border-b border-border px-3 py-2.5 text-left text-[11px] font-semibold text-foreground">
                  Resumen
                </th>
              </tr>
            </thead>
            <tbody>
              {colaboradoresPagina.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-[#7c3aed]/5">
                  <td className="border-b border-r border-border px-3 py-2">
                    <p className="truncate text-xs font-semibold text-foreground" title={c.nombre}>
                      {nombreCompacto(c.nombre)}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[10px] text-muted-foreground"
                      title={c.area_nombre || 'Sin división'}
                    >
                      {c.area_nombre || 'Sin división'}
                    </p>
                  </td>
                  {dias.map((d, index) => {
                    const celda = c.dias.find((x) => x.dia === d.dia)
                    const estado: EstadoDia = celda?.estado ?? 'pendiente'
                    return (
                      <td
                        key={d.fecha}
                        title={`${d.fecha} — ${NOMBRE_ESTADO[estado]}`}
                        className={`${claseColumnaDia(index, dias.length)} border-b border-border/40 py-1.5 align-middle ${index === dias.length - 1 ? 'border-r border-border' : ''}`}
                      >
                        <span
                          className={`mx-auto flex h-6 w-6 items-center justify-center rounded-md border border-border/60 px-0 text-[13px] font-semibold transition-colors ${claseDia(estado)}`}
                        >
                          {celda?.etiqueta ?? '·'}
                        </span>
                      </td>
                    )
                  })}
                  <td className="w-[72px] border-b border-r border-border px-2 py-2 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <div className="h-1.5 w-10 overflow-hidden rounded-full bg-[#7c3aed]/15">
                        <div
                          className="h-full rounded-full bg-[#7c3aed]"
                          style={{ width: `${Math.min(100, c.cobertura)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold tabular-nums text-foreground">
                        {c.cobertura}%
                      </span>
                    </div>
                  </td>
                  <td className="w-[86px] min-w-[86px] border-b border-r border-border px-2 py-2 text-center align-middle">
                    <span
                      title={c.estado}
                      className={`inline-block max-w-[78px] whitespace-normal rounded-full border px-1.5 py-0.5 text-center text-[10px] font-semibold leading-tight ${CLASE_BADGE_ESTADO[c.estado]}`}
                    >
                      {c.estado === 'CUMPLE_PARCIAL' ? 'PARCIAL' : c.estado}
                    </span>
                  </td>
                  <td className="border-b border-border px-3 py-2" title={c.observacion}>
                    <p className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">E:{c.exigibles}</span> · R:{c.reportados} · Inc:{c.incompletos} · P:{c.pendientes}
                    </p>
                    <p className="mt-0.5 whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
                      {c.registros} reg · {formatoHoras(c.horas_totales)} · Sem {c.semanas_reportadas}/{c.semanas_exigidas}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {colaboradores.length > COLABORADORES_POR_PAGINA && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span>
            Mostrando {inicio + 1}-{Math.min(inicio + COLABORADORES_POR_PAGINA, colaboradores.length)} de {colaboradores.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPagina((valor) => Math.max(1, valor - 1))}
              disabled={paginaActual === 1}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Página anterior"
            >
              <ChevronLeft size={13} />
              Anterior
            </button>
            <span className="px-1 tabular-nums">Página {paginaActual} de {totalPaginas}</span>
            <button
              type="button"
              onClick={() => setPagina((valor) => Math.min(totalPaginas, valor + 1))}
              disabled={paginaActual === totalPaginas}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Página siguiente"
            >
              Siguiente
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}


    </section>
  )
}