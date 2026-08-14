'use client'

import { useState } from 'react'
import { MainLayout } from '@/components/main-layout'
import { ReportFilters, type FiltrosReporte } from '@/components/report-filters'
import { ReportSummary } from '@/components/report-summary'
import { ReportPreview } from '@/components/report-preview'
import { useAreas } from '@/lib/areas-context'
import { normalizarFecha } from '@/lib/format'
import { exportarExcel } from '@/lib/exporter'
import type { Actividad } from '@/lib/types'

function fechaDemo(diasAtras: number): string {
  const d = new Date()
  d.setDate(d.getDate() - diasAtras)
  return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })
}

function hoyISO(): string {
  const ahora = new Date()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${ahora.getFullYear()}-${mes}-${dia}`
}

const registros: Actividad[] = [
  {
    id: 'r1',
    titulo: 'Elaboración de contrato comercial',
    especialidad: 'Corporativo',
    tipo: 'Redacción de contrato',
    facturable: true,
    fecha: fechaDemo(0),
    horaInicio: '09:00',
    iniciadaEn: 0,
    horaFin: '12:30',
    duracion: '3h 30m',
    estado: 'aprobada',
    usuarioNombre: 'Carlos Mendoza',
  },
  {
    id: 'r2',
    titulo: 'Revisión de documentación tributaria',
    especialidad: 'Tributario',
    tipo: 'Revisión de documentación',
    facturable: true,
    fecha: fechaDemo(1),
    horaInicio: '14:00',
    iniciadaEn: 0,
    horaFin: '16:45',
    duracion: '2h 45m',
    estado: 'aprobada',
    usuarioNombre: 'Carlos Mendoza',
  },
  {
    id: 'r3',
    titulo: 'Consultoría laboral - Empresa XYZ',
    especialidad: 'Laboral',
    tipo: 'Consultoría legal',
    facturable: false,
    fecha: fechaDemo(2),
    horaInicio: '10:30',
    iniciadaEn: 0,
    horaFin: '13:00',
    duracion: '2h 30m',
    estado: 'pendiente_aprobacion',
    usuarioNombre: 'Rosa Gutiérrez',
  },
  {
    id: 'r4',
    titulo: 'Revisión interna de bases de datos',
    especialidad: 'Corporativo',
    tipo: 'Investigación legal',
    facturable: false,
    fecha: fechaDemo(2),
    horaInicio: '15:00',
    iniciadaEn: 0,
    horaFin: '16:15',
    duracion: '1h 15m',
    estado: 'aprobada',
    usuarioNombre: 'Laura Campos',
  },
]

export default function Reportes() {
  const { areas } = useAreas()
  const hoy = hoyISO()
  const [filtros, setFiltros] = useState<FiltrosReporte>({
    areaId: '',
    tipo: 'mensual',
    desde: hoy,
    hasta: hoy,
    especialidad: 'todas',
  })

  const areaPrincipal = areas[0]
  const registrosConArea = registros.map((registro) => ({
    ...registro,
    areaId: areaPrincipal?.id ?? null,
  }))

  const registrosFiltrados = registrosConArea.filter((registro) => {
    if (filtros.areaId && registro.areaId !== filtros.areaId) return false

    const fechaNormalizada = normalizarFecha(registro.fecha)
    if (fechaNormalizada) {
      if (filtros.desde && fechaNormalizada < filtros.desde) return false
      if (filtros.hasta && fechaNormalizada > filtros.hasta) return false
    }

    if (filtros.especialidad === 'todas') return true
    return registro.especialidad.toLowerCase() === filtros.especialidad
  })

  const manejarExcel = () => {
    exportarExcel(
      ['Actividad', 'Usuario', 'Especialidad', 'Duración', 'Facturable', 'Estado', 'Fecha'],
      registrosFiltrados.map((r) => ({
        Actividad: r.titulo,
        Usuario: r.usuarioNombre ?? '',
        Especialidad: r.especialidad,
        Duración: r.duracion ?? '',
        Facturable: r.facturable ? 'Sí' : 'No',
        Estado: etiquetaEstado(r.estado),
        Fecha: r.fecha,
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

function etiquetaEstado(estado: Actividad['estado']): string {
  const etiquetas: Record<Actividad['estado'], string> = {
    en_curso: 'En curso',
    pausada: 'Pausada',
    pendiente_aprobacion: 'Pendiente de aprobación',
    aprobada: 'Aprobada',
    rechazada: 'Rechazada',
  }
  return etiquetas[estado]
}