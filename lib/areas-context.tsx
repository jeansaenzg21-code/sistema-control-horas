'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { leerStorage, escribirStorage } from './storage'
import { generarId } from './format'

export interface Area {
  id: string
  nombre: string
  descripcion: string
  especialidades: string[]
}

interface AreaDatos {
  nombre: string
  descripcion: string
  especialidades: string[]
}

interface AreasContextValue {
  areas: Area[]
  areaPorId: (id: string) => Area | undefined
  crearArea: (datos: AreaDatos) => { ok: boolean; error?: string }
  actualizarArea: (id: string, cambios: Partial<AreaDatos>) => { ok: boolean; error?: string }
  eliminarArea: (id: string) => { ok: boolean; error?: string }
}

const CLAVE_AREAS = 'pc_areas'

const AreasContext = createContext<AreasContextValue | null>(null)

function areaPorDefecto(): Area {
  return {
    id: generarId(),
    nombre: 'Área Legal',
    descripcion: 'Área de especialización principal',
    especialidades: ['Corporativo', 'Tributario', 'Laboral'],
  }
}

export function AreasProvider({ children }: { children: ReactNode }) {
  const [areas, setAreas] = useState<Area[]>([])

  // Carga inicial: si no hay áreas, crea el Área Legal por defecto.
  useEffect(() => {
    let guardadas = leerStorage<Area[]>(CLAVE_AREAS) ?? []
    if (guardadas.length === 0) {
      guardadas = [areaPorDefecto()]
      escribirStorage(CLAVE_AREAS, guardadas)
    }
    setAreas(guardadas)
  }, [])

  useEffect(() => {
    if (areas.length > 0) escribirStorage(CLAVE_AREAS, areas)
  }, [areas])

  const areaPorId = useCallback((id: string) => areas.find((a) => a.id === id), [areas])

  const crearArea = useCallback((datos: AreaDatos) => {
    if (!datos.nombre.trim()) return { ok: false, error: 'El nombre del área es obligatorio.' }
    const nueva: Area = {
      id: generarId(),
      nombre: datos.nombre.trim(),
      descripcion: datos.descripcion.trim(),
      especialidades: datos.especialidades.map((e) => e.trim()).filter(Boolean),
    }
    setAreas((prev) => [...prev, nueva])
    return { ok: true }
  }, [])

  const actualizarArea = useCallback((id: string, cambios: Partial<AreaDatos>) => {
    setAreas((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a
        return {
          ...a,
          nombre: cambios.nombre !== undefined ? cambios.nombre.trim() : a.nombre,
          descripcion: cambios.descripcion !== undefined ? cambios.descripcion.trim() : a.descripcion,
          especialidades:
            cambios.especialidades !== undefined
              ? cambios.especialidades.map((e) => e.trim()).filter(Boolean)
              : a.especialidades,
        }
      }),
    )
    return { ok: true }
  }, [])

  const eliminarArea = useCallback((id: string) => {
    setAreas((prev) => prev.filter((a) => a.id !== id))
    return { ok: true }
  }, [])

  return (
    <AreasContext.Provider
      value={{ areas, areaPorId, crearArea, actualizarArea, eliminarArea }}
    >
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
