'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export interface Area {
  id: number
  nombre: string
  descripcion: string | null
  activo: boolean
  total_usuarios: number
  especialidades: string[]
}

export interface Especialidad {
  id: number
  area_id: number
  nombre: string
  activo: boolean
  tipos_actividad: string[]
}

interface AreasContextValue {
  areas: Area[]
  especialidades: Especialidad[]
  cargando: boolean
  cargarAreas: () => Promise<void>
  cargarEspecialidades: (areaId?: number) => Promise<void>
  crearArea: (datos: { nombre: string; descripcion?: string }) => Promise<{ ok: boolean; error?: string }>
  actualizarArea: (id: number, cambios: { nombre?: string; descripcion?: string }) => Promise<{ ok: boolean; error?: string }>
  eliminarArea: (id: number) => Promise<{ ok: boolean; error?: string }>
  crearEspecialidad: (areaId: number, nombre: string) => Promise<{ ok: boolean; error?: string }>
  eliminarEspecialidad: (id: number) => Promise<{ ok: boolean; error?: string }>
}

const AreasContext = createContext<AreasContextValue | null>(null)

export function AreasProvider({ children }: { children: ReactNode }) {
  const [areas, setAreas] = useState<Area[]>([])
  const [especialidades, setEspecialidades] = useState<Especialidad[]>([])
  const [cargando, setCargando] = useState(true)

  const cargarAreas = useCallback(async () => {
    try {
      const res = await fetch('/api/areas')
      if (res.ok) {
        const data = await res.json()
        setAreas(data)
      }
    } catch {
      // Sin conexión
    }
  }, [])

  const cargarEspecialidades = useCallback(async (areaId?: number) => {
    try {
      const url = areaId ? `/api/especialidades?area_id=${areaId}` : '/api/especialidades'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setEspecialidades(data)
      }
    } catch {
      // Sin conexión
    }
  }, [])

  useEffect(() => {
    Promise.all([cargarAreas(), cargarEspecialidades()]).then(() => setCargando(false))
  }, [cargarAreas, cargarEspecialidades])

  const crearArea = useCallback(async (datos: { nombre: string; descripcion?: string }) => {
    try {
      const res = await fetch('/api/areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data.error }
      await cargarAreas()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Error de conexión.' }
    }
  }, [cargarAreas])

  const actualizarArea = useCallback(async (id: number, cambios: { nombre?: string; descripcion?: string }) => {
    try {
      const res = await fetch('/api/areas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...cambios }),
      })
      if (!res.ok) return { ok: false, error: 'Error al actualizar.' }
      await cargarAreas()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Error de conexión.' }
    }
  }, [cargarAreas])

  const eliminarArea = useCallback(async (id: number) => {
    try {
      const res = await fetch('/api/areas', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) return { ok: false, error: 'Error al eliminar.' }
      await cargarAreas()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Error de conexión.' }
    }
  }, [cargarAreas])

  const crearEspecialidad = useCallback(async (areaId: number, nombre: string) => {
    try {
      const res = await fetch('/api/especialidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area_id: areaId, nombre }),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data.error }
      await cargarEspecialidades(areaId)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Error de conexión.' }
    }
  }, [cargarEspecialidades])

  const eliminarEspecialidad = useCallback(async (id: number) => {
    try {
      const res = await fetch('/api/especialidades', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) return { ok: false, error: 'Error al eliminar.' }
      await cargarEspecialidades()
      return { ok: true }
    } catch {
      return { ok: false, error: 'Error de conexión.' }
    }
  }, [cargarEspecialidades])

  return (
    <AreasContext.Provider value={{
      areas, especialidades, cargando,
      cargarAreas, cargarEspecialidades,
      crearArea, actualizarArea, eliminarArea,
      crearEspecialidad, eliminarEspecialidad,
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
