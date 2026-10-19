'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useAreas } from '@/lib/areas-context'
import type { CumplimientoReporte } from '@/lib/cumplimiento'
import { MatrizCumplimiento } from '@/components/cumplimiento/matriz-cumplimiento'

function token(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
}

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function valorNumerico(valor: string | null, min: number, max: number, fallback: number): number {
  if (valor == null) return fallback
  const n = Number(valor)
  if (!Number.isInteger(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

const estiloControl =
  'h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/40 cursor-pointer'

function MatrizContenido() {
  const searchParams = useSearchParams()
  const { usuarios, usuario } = useAuth()
  const { areas } = useAreas()

  const [anio, setAnio] = useState(() =>
    valorNumerico(searchParams.get('anio'), 2000, 2100, new Date().getFullYear()),
  )
  const [mes, setMes] = useState(() =>
    valorNumerico(searchParams.get('mes'), 1, 12, new Date().getMonth() + 1),
  )
  const [usuarioId, setUsuarioId] = useState(() => searchParams.get('usuario_id') ?? '')
  const [areaId, setAreaId] = useState('')
  useEffect(() => {
    if (usuario?.rol === 'jefe_area' && usuario?.area_id != null) {
      setAreaId(String(usuario.area_id))
    }
  }, [usuario])

  const [datos, setDatos] = useState<CumplimientoReporte | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const divisionFija = usuario?.rol === 'jefe_area' && usuario?.area_id != null
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
      const res = await fetch(`/api/cumplimiento?${params.toString()}`, {
        headers: token() ? { Authorization: `Bearer ${token()}` } : undefined,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'No se pudo cargar la matriz.')
        setDatos(null)
        return
      }
      setDatos(await res.json())
    } catch {
      setError('Error de conexión al cargar la matriz.')
      setDatos(null)
    } finally {
      setCargando(false)
    }
  }, [anio, mes, areaId, usuarioId])

  useEffect(() => {
    cargar()
  }, [cargar])

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
          {divisionFija ? (
            <span className="h-8 rounded-lg border border-border bg-muted/40 px-2 text-xs leading-8 text-foreground">
              {areas.find((a) => a.id === usuario.area_id)?.nombre ?? 'Tu división'}
            </span>
          ) : (
            <select value={areaId} onChange={(e) => { setAreaId(e.target.value); setUsuarioId('') }} className={estiloControl}>
              <option value="">Todas las divisiones</option>
              {areas.filter((a) => a.activo).map((a) => (
                <option key={a.id} value={String(a.id)}>{a.nombre}</option>
              ))}
            </select>
          )}
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
          Calculando matriz...
        </div>
      )}

      {!cargando && error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-400">
          {error}
        </div>
      )}

      {!cargando && !error && datos && <MatrizCumplimiento datos={datos} />}
    </>
  )
}

export default function CumplimientoMatrizPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
          <RefreshCw size={13} className="animate-spin text-[#a78bfa]" />
          Cargando matriz...
        </div>
      }
    >
      <MatrizContenido />
    </Suspense>
  )
}