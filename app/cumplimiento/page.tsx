'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import type { ColaboradorCumplimiento, CumplimientoReporte } from '@/lib/cumplimiento'
import type { CumplimientoObservacion } from '@/lib/observaciones-ui'
import { normalizarEstadoAtencion, normalizarVisibilidad } from '@/lib/observaciones-ui'
import { ResumenColaboradores } from '@/components/cumplimiento/resumen-colaboradores'
import { ObservacionesCumplimientoPanel } from '@/components/cumplimiento/observaciones-panel'
import { useAuth } from '@/lib/auth-context'
import { useAreas } from '@/lib/areas-context'

function token(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
}

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const estiloControl =
  'h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/40 cursor-pointer'

function filaObservacion(valor: unknown): CumplimientoObservacion | null {
  if (!valor || typeof valor !== 'object') return null
  const fila = valor as Record<string, unknown>
  const id = Number(fila.id ?? fila.observacion_id)
  const usuarioId = Number(fila.usuario_id ?? fila.usuario_destino_id)
  const contenido = String(fila.contenido ?? fila.texto ?? '').trim()
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(usuarioId) || usuarioId <= 0 || !contenido) return null
  const createdAt = fila.created_at ?? fila.updated_at
  return {
    id,
    usuario_id: usuarioId,
    contenido,
    visibilidad: normalizarVisibilidad(fila.visibilidad),
    tipo: String(fila.tipo ?? 'OBSERVACION') as CumplimientoObservacion['tipo'],
    estado_atencion: normalizarEstadoAtencion(fila.estado_atencion),
    parent_id: fila.parent_id == null ? null : Number(fila.parent_id),
    autor_nombre: fila.autor_nombre == null ? null : String(fila.autor_nombre),
    usuario_nombre: fila.usuario_nombre == null ? null : String(fila.usuario_nombre),
    created_at: createdAt == null ? new Date().toISOString() : String(createdAt),
  }
}

function agruparObservaciones(valor: unknown): Record<number, CumplimientoObservacion[]> {
  const filas = Array.isArray(valor)
    ? valor
    : valor && typeof valor === 'object' && Array.isArray((valor as Record<string, unknown>).observaciones)
      ? (valor as Record<string, unknown>).observaciones
      : []
  const agrupadas: Record<number, CumplimientoObservacion[]> = {}
  for (const item of filas as unknown[]) {
    const observacion = filaObservacion(item)
    if (!observacion) continue
    const actuales = agrupadas[observacion.usuario_id] ?? []
    if (!actuales.some((existente) => existente.id === observacion.id)) {
      agrupadas[observacion.usuario_id] = [observacion, ...actuales]
    }
  }
  for (const lista of Object.values(agrupadas)) {
    lista.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }
  return agrupadas
}

export default function CumplimientoResumen() {
  const { usuarios } = useAuth()
  const { areas } = useAreas()

  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [areaId, setAreaId] = useState('')
  const [usuarioId, setUsuarioId] = useState('')

  const [datos, setDatos] = useState<CumplimientoReporte | null>(null)
  const [observaciones, setObservaciones] = useState<Record<number, CumplimientoObservacion[]>>({})
  const [colaboradorObservaciones, setColaboradorObservaciones] = useState<ColaboradorCumplimiento | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const colaboradores = usuarios.filter(
    (u) => u.rol === 'personal' && u.activo && (!areaId || String(u.area_id) === areaId),
  )

  const pasarMes = (delta: number) => {
    const total = anio * 12 + (mes - 1) + delta
    setAnio(Math.floor(total / 12))
    setMes((((total % 12) + 12) % 12) + 1)
  }

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const params = new URLSearchParams({ anio: String(anio), mes: String(mes) })
      if (areaId) params.set('area_id', areaId)
      if (usuarioId) params.set('usuario_id', usuarioId)
      const headers = token() ? { Authorization: `Bearer ${token()}` } : undefined
      const [res, resObs] = await Promise.all([
        fetch(`/api/cumplimiento?${params.toString()}`, { headers }),
        fetch(`/api/cumplimiento/observaciones?anio=${anio}&mes=${mes}`, { headers }),
      ])
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'No se pudo cargar el cumplimiento.')
        setDatos(null)
        setObservaciones({})
        return
      }
      setDatos(await res.json())
      if (resObs.ok) {
        setObservaciones(agruparObservaciones(await resObs.json()))
      } else {
        setObservaciones({})
      }
    } catch {
      setError('Error de conexión al cargar el cumplimiento.')
      setDatos(null)
      setObservaciones({})
    } finally {
      setCargando(false)
    }
  }, [anio, mes, areaId, usuarioId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    if (!colaboradorObservaciones || !datos) return
    const actualizado = datos.colaboradores.find((colaborador) => colaborador.id === colaboradorObservaciones.id)
    if (actualizado && actualizado !== colaboradorObservaciones) setColaboradorObservaciones(actualizado)
  }, [datos, colaboradorObservaciones])

  const metricas = useMemo(() => ({
    registros: colaboradorObservaciones?.registros ?? 0,
    horas_totales: colaboradorObservaciones?.horas_totales ?? 0,
    cobertura: colaboradorObservaciones?.cobertura ?? 0,
    semanas_reportadas: colaboradorObservaciones?.semanas_reportadas ?? 0,
    semanas_exigidas: colaboradorObservaciones?.semanas_exigidas ?? 0,
  }), [colaboradorObservaciones])

  const observacionesIniciales = useMemo(
    () => colaboradorObservaciones ? observaciones[colaboradorObservaciones.id] ?? [] : [],
    [colaboradorObservaciones, observaciones],
  )

  const registrarObservacion = (observacion: CumplimientoObservacion) => {
    setObservaciones((prev) => ({
      ...prev,
      [observacion.usuario_id]: [
        observacion,
        ...(prev[observacion.usuario_id] ?? []).filter((item) => item.id !== observacion.id),
      ],
    }))
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => pasarMes(-1)}
          aria-label="Mes anterior"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:border-[#7c3aed]/50 hover:text-[#7c3aed]"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-[130px] text-center text-sm font-semibold text-foreground">
          {NOMBRES_MESES[mes - 1]} {anio}
        </span>
        <button
          onClick={() => pasarMes(1)}
          aria-label="Mes siguiente"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:border-[#7c3aed]/50 hover:text-[#7c3aed]"
        >
          <ChevronRight size={16} />
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={areaId} onChange={(e) => { setAreaId(e.target.value); setUsuarioId('') }} className={estiloControl}>
            <option value="">Todas las divisiones</option>
            {areas.filter((a) => a.activo).map((a) => (
              <option key={a.id} value={String(a.id)}>{a.nombre}</option>
            ))}
          </select>
          <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} className={estiloControl}>
            <option value="">Todos los colaboradores</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={String(c.id)}>{c.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {cargando && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          <RefreshCw size={13} className="animate-spin text-[#a78bfa]" />
          Calculando cumplimiento...
        </div>
      )}

      {!cargando && error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-400">
          {error}
        </div>
      )}

      {!cargando && !error && datos && (
        <ResumenColaboradores
          colaboradores={datos.colaboradores}
          observaciones={observaciones}
          onAbrirObservaciones={setColaboradorObservaciones}
        />
      )}

      <ObservacionesCumplimientoPanel
        abierto={colaboradorObservaciones != null}
        colaborador={colaboradorObservaciones}
        periodo={{ anio, mes }}
        metricas={metricas}
        observacionesIniciales={observacionesIniciales}
        onCerrar={() => setColaboradorObservaciones(null)}
        onObservacionCreada={registrarObservacion}
      />
    </>
  )
}
