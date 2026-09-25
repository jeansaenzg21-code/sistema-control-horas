'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './auth-context'

export interface Area {
  id: number
  empresa_id: number
  nombre: string
  descripcion: string | null
  activo: boolean
  jefe_id: number | null
  jefe_nombre: string | null
  jefe_rol: string | null
  total_usuarios: number
}

interface AreasContextValue {
  areas: Area[]
  cargando: boolean
  error: string | null
  cargarAreas: () => Promise<void>
  crearArea: (datos: { nombre: string; descripcion?: string }) => Promise<{ ok: boolean; error?: string }>
  actualizarArea: (id: number, cambios: { nombre?: string; descripcion?: string; jefe_id?: number | null }) => Promise<{ ok: boolean; error?: string }>
  eliminarArea: (id: number) => Promise<{ ok: boolean; error?: string }>
}

const AreasContext = createContext<AreasContextValue | null>(null)

export function AreasProvider({ children }: { children: ReactNode }) {
  const { empresaActiva } = useAuth()
  const empresaId = empresaActiva?.id ?? null
  const [areas, setAreas] = useState<Area[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const getHeaders = useCallback(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  }, [])

  const cargarAreas = useCallback(async () => {
    if (!empresaId) {
      setAreas([])
      setError(null)
      return
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
      const res = await fetch('/api/areas', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (res.ok) {
        const data = await res.json()
        setAreas(Array.isArray(data) ? data : [])
        setError(null)
      } else {
        const data = await res.json().catch(() => ({}))
        setAreas([])
        setError(data.error || 'No se pudieron cargar las divisiones.')
      }
    } catch {
      setAreas([])
      setError('No se pudo conectar con el servidor para cargar las divisiones.')
    }
  }, [empresaId])

  useEffect(() => {
    if (!empresaId) {
      setAreas([])
      setError(null)
      setCargando(false)
      return
    }

    setCargando(true)
    void cargarAreas().finally(() => setCargando(false))
  }, [empresaId, cargarAreas])

  const crearArea = useCallback(async (datos: { nombre: string; descripcion?: string }) => {
    if (!empresaId) return { ok: false, error: 'No hay una empresa activa.' }
    try {
      const res = await fetch('/api/areas', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(datos),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data.error }
      await cargarAreas()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Error de conexión.' }
    }
  }, [empresaId, getHeaders, cargarAreas])

  const actualizarArea = useCallback(async (id: number, cambios: { nombre?: string; descripcion?: string; jefe_id?: number | null }) => {
    if (!empresaId) return { ok: false, error: 'No hay una empresa activa.' }
    try {
      const res = await fetch('/api/areas', {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ id, ...cambios }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: data.error || 'Error al actualizar.' }
      await cargarAreas()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Error de conexión.' }
    }
  }, [empresaId, getHeaders, cargarAreas])

  const eliminarArea = useCallback(async (id: number) => {
    if (!empresaId) return { ok: false, error: 'No hay una empresa activa.' }
    try {
      const res = await fetch('/api/areas', {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: data.error || 'Error al eliminar.' }
      await cargarAreas()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Error de conexión.' }
    }
  }, [empresaId, getHeaders, cargarAreas])

  return (
    <AreasContext.Provider value={{
      areas,
      cargando,
      error,
      cargarAreas,
      crearArea,
      actualizarArea,
      eliminarArea,
    }}>
      {children}
    </AreasContext.Provider>
  )
}

export function useAreas(): AreasContextValue {
  const contexto = useContext(AreasContext)
  if (!contexto) {
    throw new Error('useAreas debe usarse dentro de AreasProvider')
  }
  return contexto
}
