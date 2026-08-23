'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MainLayout } from '@/components/main-layout'
import { ReportFilters, type FiltrosReporte } from '@/components/report-filters'
import { ReportSummary } from '@/components/report-summary'
import { ReportPreview } from '@/components/report-preview'
import { useAreas } from '@/lib/areas-context'
import { useActividad } from '@/lib/actividad-context'
import { useAuth } from '@/lib/auth-context'
import { exportarExcel } from '@/lib/exporter'
import { esFacturable, esNoFacturable, fechaLocalISO } from '@/lib/utils'

function hoyISO(): string {
  const ahora = new Date()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${ahora.getFullYear()}-${mes}-${dia}`
}

export default function Reportes() {
  const { areas } = useAreas()
  const { usuario, cargando } = useAuth()
  const { historial } = useActividad()
  const router = useRouter()
  const hoy = hoyISO()
  const [filtros, setFiltros] = useState<FiltrosReporte>({
    areaId: '',
    tipo: 'mensual',
    desde: hoy,
    hasta: hoy,
    especialidad: 'todas',
  })

  useEffect(() => {
    if (!cargando && usuario?.rol !== 'admin') {
      router.replace('/')
    }
  }, [cargando, usuario, router])

  if (cargando || !usuario || usuario.rol !== 'admin') return null

  const registrosFiltrados = historial.filter((registro) => {
    if (filtros.areaId && String(registro.area_id) !== filtros.areaId) return false

    const fechaReg = fechaLocalISO(registro.inicio)
    if (filtros.desde && fechaReg < filtros.desde) return false
    if (filtros.hasta && fechaReg > filtros.hasta) return false

    if (filtros.especialidad === 'todas') return true
    return (registro.especialidad || '').toLowerCase() === filtros.especialidad
  })

  const manejarExcel = () => {
    const calcularHoras = (r: typeof registrosFiltrados[0]): string => {
      if (!r.fin || !r.inicio) return '—'
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
      ['Actividad', 'Cliente', 'Usuario', 'Especialidad', 'Duración', 'Facturable', 'Estado', 'Fecha'],
      registrosFiltrados.map((r) => ({
        Actividad: r.descripcion ?? '',
        Cliente: r.cliente_nombre ?? '',
        Usuario: r.usuario_nombre ?? '',
        Especialidad: r.especialidad ?? '',
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

        <ReportSummary registros={registrosFiltrados} />

        <ReportPreview
          filtros={filtros}
          registros={registrosFiltrados}
          onExportar={manejarExcel}
        />
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
