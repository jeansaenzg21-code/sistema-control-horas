'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { MainLayout } from '@/components/main-layout'
import { ReportFilters, type FiltrosReporte } from '@/components/report-filters'
import { ReportSummary } from '@/components/report-summary'
import { ReportPreview } from '@/components/report-preview'
import { useAuth } from '@/lib/auth-context'
import type { Actividad } from '@/lib/types'
import { esFacturable, esNoFacturable, fechaLocalISO } from '@/lib/utils'
import { opcionesApi } from '@/lib/api-cliente'
import { duracionReporte } from '@/lib/reporte-horas'
import { obtenerEstiloEstado } from '@/lib/estado'
import styles from '@/components/reportes.module.css'

const FILAS_POR_CONSULTA = 1000
const TOPE_REPORTE = 20_000

function rangoDelMes(): FiltrosReporte {
  const hasta = fechaLocalISO(new Date())
  return { areaId: '', desde: hasta.slice(0, 7) + '-01', hasta }
}

export default function Reportes() {
  const { usuario, empresaActiva, cargando } = useAuth()
  const router = useRouter()
  const [filtros, setFiltros] = useState(rangoDelMes)
  const [exportando, setExportando] = useState(false)
  const [errorExportacion, setErrorExportacion] = useState('')
  const area = usuario?.rol === 'admin' || usuario?.rol === 'socio' ? filtros.areaId : ''
  const rangoValido = Boolean(filtros.desde && filtros.hasta && filtros.desde <= filtros.hasta)

  useEffect(() => {
    if (cargando) return
    if (!usuario) router.replace('/login')
    else if (usuario.rol === 'personal') router.replace('/actividades')
  }, [cargando, usuario, router])

  const consulta = useQuery({
    queryKey: ['reportes', empresaActiva?.id, usuario?.id, usuario?.rol, usuario?.area_id, area, filtros.desde, filtros.hasta],
    enabled: Boolean(empresaActiva && usuario && usuario.rol !== 'personal' && rangoValido),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta, limite: String(FILAS_POR_CONSULTA) })
      if (area) params.set('area_id', area)
      const registros = new Map<number, Actividad>()
      for (let offset = 0; offset <= TOPE_REPORTE; offset += FILAS_POR_CONSULTA) {
        params.set('offset', String(offset))
        const res = await fetch('/api/actividades?' + params, opcionesApi({ signal }))
        const datos = await res.json()
        if (!res.ok) throw new Error(datos.error || 'No se pudieron cargar los registros.')
        if (!Array.isArray(datos)) throw new Error('La respuesta del reporte no es válida.')
        const total = Number(res.headers.get('X-Total'))
        if (total > TOPE_REPORTE || (offset === TOPE_REPORTE && datos.length)) {
          throw new Error('El período supera los 20.000 registros. Elige un rango más corto.')
        }
        for (const fila of datos as Actividad[]) registros.set(fila.id, fila)
        if (datos.length < FILAS_POR_CONSULTA || (total && offset + datos.length >= total)) return [...registros.values()]
      }
      return [...registros.values()]
    },
  })

  const registros = consulta.data
  if (cargando || !usuario || usuario.rol === 'personal') return null
  const subtitulo = usuario.rol === 'supervisor' ? 'Consulta y exporta los registros de tu equipo'
      : usuario.rol === 'jefe_area' ? 'Consulta y exporta los registros de tu división'
        : 'Genera, previsualiza y exporta reportes de la empresa'

  const manejarExcel = async () => {
    if (!registros?.length || exportando) return
    setExportando(true)
    setErrorExportacion('')
    try {
      const { utils, writeFile } = await import('xlsx')
      const hoja = utils.aoa_to_sheet([
        ['Actividad', 'Cliente', 'Usuario', 'Cargo', 'Duración', 'Facturable', 'Estado', 'Fecha'],
        ...registros.map((r) => [
          r.descripcion ?? r.tipo_actividad_nombre ?? '', r.cliente_nombre ?? '', r.usuario_nombre ?? '',
          r.cargo ?? '', duracionReporte(r), esFacturable(r.facturable) ? 'Sí' : esNoFacturable(r.facturable) ? 'No' : 'Por definir',
          obtenerEstiloEstado(r.estado).label, fechaLocalISO(r.inicio),
        ]),
      ])
      const libro = utils.book_new()
      utils.book_append_sheet(libro, hoja, 'Registros')
      writeFile(libro, 'reporte-paredes-cano-' + filtros.desde + '-al-' + filtros.hasta + '.xlsx')
    } catch {
      setErrorExportacion('No se pudo generar el archivo Excel.')
    } finally {
      setExportando(false)
    }
  }

  return (
    <MainLayout ancho="ancho" title="Reportes" subtitle={subtitulo}>
      <div className={styles.view}>
        <ReportFilters filtros={filtros} onChange={(valor) => { setFiltros(valor); setErrorExportacion('') }} />
        {!rangoValido ? <p className={styles.message} role="status">Selecciona una fecha de inicio y una fecha final igual o posterior.</p>
          : consulta.isError ? <p className={styles.message} role="alert">{consulta.error.message} <button type="button" onClick={() => void consulta.refetch()}>Reintentar</button></p>
            : !registros ? <p className={styles.message} role="status"><Loader2 size={17} className="animate-spin" /> Cargando reporte…</p>
              : <>
                <ReportSummary registros={registros} />
                {errorExportacion && <p className={styles.message} role="alert">{errorExportacion}</p>}
                <ReportPreview key={[area, filtros.desde, filtros.hasta].join('|')} filtros={filtros} registros={registros}
                  exportando={exportando} onExportar={() => void manejarExcel()} />
              </>}
      </div>
    </MainLayout>
  )
}
