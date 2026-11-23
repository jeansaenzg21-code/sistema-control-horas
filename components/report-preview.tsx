'use client'

import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { FiltrosReporte } from './report-filters'
import { StatusBadge } from './status-badge'
import { FacturableBadge } from './facturable-badge'
import type { Actividad } from '@/lib/types'
import { fechaLocalISO } from '@/lib/utils'
import { duracionReporte } from '@/lib/reporte-horas'
import styles from './reportes.module.css'

const POR_PAGINA = 8
const fechaVisible = (fecha: string) => fecha.split('-').reverse().join('/')

export function ReportPreview({ filtros, registros, exportando, onExportar }: {
  filtros: FiltrosReporte
  registros: Actividad[]
  exportando: boolean
  onExportar: () => void
}) {
  const [pagina, setPagina] = useState(1)
  const totalPaginas = Math.max(1, Math.ceil(registros.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas)
  const inicio = (paginaActual - 1) * POR_PAGINA
  const final = Math.min(inicio + POR_PAGINA, registros.length)
  const primeraVisible = Math.max(1, Math.min(paginaActual - 2, totalPaginas - 4))
  const paginas = Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => primeraVisible + i)

  return <section className={'print-area ' + styles.panel} aria-label="Vista previa del reporte">
    <div className={styles.heading}>
      <div className={styles.previewTitle}><FileText size={24} /><div><h2>Vista previa</h2><p>{fechaVisible(filtros.desde)} al {fechaVisible(filtros.hasta)}</p></div></div>
      <button type="button" className={styles.export} disabled={!registros.length || exportando} onClick={onExportar}>
        {exportando ? <Loader2 size={18} className="animate-spin" /> : <FileSpreadsheet size={18} />}
        {exportando ? 'Preparando Excel…' : 'Exportar Excel'}
      </button>
    </div>
    {!registros.length ? <p className={styles.empty}>No hay actividades para los filtros elegidos.</p> : <>
      <div className={styles.tableScroll} role="region" aria-label="Registros del reporte" tabIndex={0}>
        <table className={styles.table}>
          <thead><tr>{['Actividad', 'Cliente', 'Usuario', 'Cargo', 'Duración', 'Facturable', 'Estado'].map((encabezado) => <th scope="col" key={encabezado}>{encabezado}</th>)}</tr></thead>
          <tbody>
            {registros.slice(inicio, final).map((r) => <tr key={r.id}>
              <td><strong>{r.tipo_actividad_nombre || r.descripcion || 'Sin descripción'}</strong><small>{fechaLocalISO(r.inicio)}</small></td>
              <td>{r.cliente_nombre ?? '—'}</td><td>{r.usuario_nombre ?? '—'}</td><td>{r.cargo || '—'}</td>
              <td><strong>{duracionReporte(r)}</strong></td>
              <td><FacturableBadge valor={r.facturable} /></td><td><StatusBadge estado={r.estado} /></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <footer className={styles.footer}>
        <span>{inicio + 1}–{final} de {registros.length} registros</span>
        {totalPaginas > 1 && <nav className={styles.pagination} aria-label="Páginas del reporte">
          <button type="button" aria-label="Página anterior" disabled={paginaActual === 1} onClick={() => setPagina(paginaActual - 1)}><ChevronLeft size={17} /></button>
          {paginas.map((numero) => <button type="button" key={numero} aria-label={'Página ' + numero} aria-current={numero === paginaActual ? 'page' : undefined} onClick={() => setPagina(numero)}>{numero}</button>)}
          <button type="button" aria-label="Página siguiente" disabled={paginaActual === totalPaginas} onClick={() => setPagina(paginaActual + 1)}><ChevronRight size={17} /></button>
        </nav>}
      </footer>
    </>}
  </section>
}
