'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { MainLayout } from '@/components/main-layout'
import { ReportFilters, type FiltrosReporte } from '@/components/report-filters'
import { ReportSummary } from '@/components/report-summary'
import { ReportPreview } from '@/components/report-preview'
import { useAreas } from '@/lib/areas-context'
import { useAuth } from '@/lib/auth-context'
import type { Actividad } from '@/lib/actividad-context'
import { exportarExcel } from '@/lib/exporter'
import { esFacturable, esNoFacturable, fechaLocalISO } from '@/lib/utils'
import { opcionesApi } from '@/lib/api-cliente'

function iso(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

/**
 * Rango por defecto: el mes en curso, no el dia de hoy.
 *
 * Antes venia `desde = hasta = hoy`, asi que abrir Reportes un dia sin horas
 * registradas mostraba una pantalla vacia sin explicacion, y parecia un fallo.
 * El mes completo es lo que se quiere ver de un reporte mensual.
 */
function rangoDelMes(): { desde: string; hasta: string } {
  const ahora = new Date()
  return {
    desde: iso(new Date(ahora.getFullYear(), ahora.getMonth(), 1)),
    hasta: iso(ahora),
  }
}

export default function Reportes() {
  const { areas } = useAreas()
  const { usuario, cargando } = useAuth()
  const router = useRouter()
  const [inicial] = useState(rangoDelMes)
  const [filtros, setFiltros] = useState<FiltrosReporte>({
    areaId: '',
    tipo: 'mensual',
    desde: inicial.desde,
    hasta: inicial.hasta,
    cargo: 'todas',
  })

  // Los datos del reporte se piden al servidor con el rango aplicado. Antes se
  // armaba el reporte filtrando `historial` en el navegador, y ese historial es
  // una PAGINA de 200 filas (la mas reciente): con 687 actividades el reporte
  // salia incompleto en silencio, sin avisar. Ademas el rango se aplicaba en el
  // cliente, asi que una fecha fuera de esas 200 filas era invisible.
  const [registros, setRegistros] = useState<Actividad[]>([])
  const [cargandoReporte, setCargandoReporte] = useState(false)
  const [errorReporte, setErrorReporte] = useState<string | null>(null)

  const puedeVerReportes = usuario?.rol === 'admin' || usuario?.rol === 'jefe_area' || usuario?.rol === 'socio'

  const cargarReporte = useCallback(async () => {
    if (!usuario) return
    setCargandoReporte(true)
    setErrorReporte(null)
    try {
      const params = new URLSearchParams()
      // El jefe de área solo puede consultar la suya, así que se le manda
      // siempre la misma. La API lo acota a su área de todos modos, así que
      // mandarlo o no da el mismo resultado; se manda para que la petición
      // refleje lo que se ve en pantalla.
      const divisionEfectiva = usuario.rol === 'jefe_area' ? String(usuario.area_id ?? '') : filtros.areaId
      if (divisionEfectiva) params.set('area_id', divisionEfectiva)
      if (filtros.desde) params.set('desde', filtros.desde)
      if (filtros.hasta) params.set('hasta', filtros.hasta)
      // `todo=1` pide el rango completo sin paginar: un reporte parcial daria
      // numeros que no cuadran con la realidad.
      params.set('todo', '1')
      const res = await fetch(`/api/actividades?${params.toString()}`, opcionesApi())
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        throw new Error(Array.isArray(data) ? 'No se pudieron cargar los registros.' : data?.error || 'No se pudieron cargar los registros.')
      }
      if (!Array.isArray(data)) throw new Error('La respuesta del reporte no es válida.')
      setRegistros(data as Actividad[])
    } catch (e) {
      setRegistros([])
      setErrorReporte(e instanceof Error ? e.message : 'No se pudieron cargar los registros.')
    } finally {
      setCargandoReporte(false)
    }
  }, [usuario, filtros.areaId, filtros.desde, filtros.hasta])

  useEffect(() => {
    if (cargando || !usuario) return
    if (!puedeVerReportes) {
      router.replace('/')
      return
    }
    void cargarReporte()
  }, [cargando, usuario, puedeVerReportes, router, cargarReporte])

  if (cargando || !usuario || !puedeVerReportes) return null

  // El cargo se filtra aqui porque la API no lo expone como parametro y son solo
  // unas decenas de valores sobre un rango acotado.
  const registrosFiltrados = registros.filter((registro) =>
    filtros.cargo === 'todas' ? true : (registro.cargo || '').toLowerCase() === filtros.cargo,
  )

  const manejarExcel = () => {
    const calcularHoras = (r: typeof registrosFiltrados[0]): string => {
      if (!r.fin || !r.inicio) return '�?"'
      const inicioMs = new Date(r.inicio).getTime()
      const finMs = new Date(r.fin).getTime()
      const totalSeg = Math.max(0, Math.floor((finMs - inicioMs) / 1000) - (r.pausa_acumulada_segundos || 0))
      const h = Math.floor(totalSeg / 3600)
      const m = Math.floor((totalSeg % 3600) / 60)
      if (h === 0) return `${m}min`
      if (m === 0) return `${h}h`
      return `${h}h ${m}min`
    }

    exportarExcel(
      ['Actividad', 'Cliente', 'Usuario', 'Cargo', 'Duración', 'Facturable', 'Estado', 'Fecha'],
      registrosFiltrados.map((r) => ({
        Actividad: r.descripcion ?? '',
        Cliente: r.cliente_nombre ?? '',
        Usuario: r.usuario_nombre ?? '',
        Cargo: r.cargo ?? '',
        Duración: calcularHoras(r),
        Facturable: esFacturable(r.facturable) ? 'Sí' : esNoFacturable(r.facturable) ? 'No' : 'Por definir',
        Estado: etiquetaEstado(r.estado),
        Fecha: fechaLocalISO(r.inicio),
      })),
      `reporte-paredes-cano-${filtros.tipo}`,
    )
  }

  return (
    <MainLayout title="Reportes" subtitle="Genera, previsualiza y exporta reportes">
      <div className="space-y-5">
        <ReportFilters filtros={filtros} onChange={setFiltros} />

        {errorReporte && (
          <p className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
            {errorReporte}
          </p>
        )}

        {cargandoReporte ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-8 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            Calculando el reporte...
          </div>
        ) : (
          <>
            <ReportSummary registros={registrosFiltrados} />
            <ReportPreview
              filtros={filtros}
              registros={registrosFiltrados}
              onExportar={manejarExcel}
            />
          </>
        )}
      </div>
    </MainLayout>
  )
}

function etiquetaEstado(estado: string): string {
  const etiquetas: Record<string, string> = {
    EN_CURSO: 'En curso',
    PAUSADA: 'Pausada',
    PENDIENTE_APROBACION: 'Pendiente de aprobación',
    APROBADA: 'Aprobada',
    RECHAZADA: 'Rechazada',
  }
  return etiquetas[estado] ?? estado
}
