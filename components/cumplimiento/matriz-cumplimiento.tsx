'use client'

import { useEffect, useState } from 'react'
import { CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import type { CumplimientoReporte, EstadoDia } from '@/lib/cumplimiento'
import styles from './cumplimiento.module.css'
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
  if (total === 1) return 'px-0.5'
  if (indice === 0) return 'pl-0.5'
  if (indice === total - 1) return 'pr-0.5'
  return 'px-0'
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
    <section className={styles.panel}>
      <div className={styles.heading}>
        <h2 className={styles.headingTitle}>
          <CalendarCheck size={22} aria-hidden="true" />
          {titulo}
        </h2>
        <span className={styles.count}>{colaboradores.length} colaborador(es)</span>
      </div>

      <div className={styles.matrixLegend}>
        <span className="font-medium uppercase tracking-wider text-foreground/70">Leyenda:</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-emerald-500/10 text-[10px] font-bold text-emerald-400">●</span>
          Reportado
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">●</span>
          Pendiente
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-amber-500/10 text-[10px] font-bold text-amber-400">●</span>
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
        <div className={styles.matrixScroll} role="region" aria-label="Matriz de cumplimiento" tabIndex={0}>
          <table className={styles.matrix} style={{ minWidth: 540 + dias.length * 30 }}>
            <thead className="bg-muted/20">
              <tr>
                <th scope="col" className="w-[185px] border-b border-r border-border px-3 py-2.5 text-left text-[11px] font-semibold text-foreground">
                  Colaborador
                </th>
                {dias.map((d, index) => (
                  <th
                    scope="col"
                    key={d.fecha}
                    title={d.fecha}
                    className={`${claseColumnaDia(index, dias.length)} border-b border-border/70 py-2 text-center text-foreground ${index === dias.length - 1 ? 'border-r border-border' : ''}`}
                  >
                    <span className={styles.matrixDay}>
                      <span className="text-[7px] font-semibold uppercase leading-none text-[#a78bfa]">
                        {LETRAS_DIA[d.dia_semana]}
                      </span>
                      <span className="mt-0.5 block text-[10px] font-bold tabular-nums leading-none text-foreground">
                        {d.dia}
                      </span>
                    </span>
                  </th>
                ))}
                <th scope="col" className="w-[82px] border-b border-r border-border px-2 py-2.5 text-center text-[11px] font-semibold text-foreground">
                  Cobertura
                </th>
                <th scope="col" className="w-[107px] border-b border-r border-border px-2 py-2.5 text-center text-[11px] font-semibold text-foreground">
                  Estado
                </th>
                <th scope="col" className="w-[147px] border-b border-border px-2.5 py-2.5 text-center text-[11px] font-semibold text-foreground">
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
                          className={`${styles.matrixCell} ${claseDia(estado)}`} data-estado={estado}
                        >
                          {estado === 'pendiente' ? '●' : celda?.etiqueta ?? '·'}
                        </span>
                      </td>
                    )
                  })}
                  <td className="w-[82px] border-b border-r border-border px-2 py-2 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <div className={styles.coverage}>
                        <div
                          className={styles.coverageFill}
                          style={{ width: `${Math.min(100, c.cobertura)}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold tabular-nums text-foreground">
                        {c.cobertura}%
                      </span>
                    </div>
                  </td>
                  <td className="w-[107px] border-b border-r border-border px-2 py-2 text-center align-middle">
                    <span
                      title={c.estado}
                      className={`inline-block max-w-[78px] whitespace-normal rounded-full border px-1.5 py-0.5 text-center text-[10px] font-semibold leading-tight ${CLASE_BADGE_ESTADO[c.estado]}`}
                    >
                      {c.estado === 'CUMPLE_PARCIAL' ? 'PARCIAL' : c.estado.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className={styles.matrixSummary} title={[c.observacion, "E: exigibles · R: reportados · Inc: incompletos · P: pendientes"].filter(Boolean).join(" · ")}>
                    <p className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                      <span className="font-semibold text-foreground">E:{c.exigibles}</span> · R:{c.reportados} · Inc:{c.incompletos} · P:{c.pendientes}
                    </p>
                    <p className="whitespace-nowrap tabular-nums text-muted-foreground">
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