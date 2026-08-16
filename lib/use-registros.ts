'use client'

import { useMemo } from 'react'
import { useActividad } from './actividad-context'
import { useAreas } from './areas-context'
import { useAuth } from './auth-context'
import { REGISTROS_DEMO } from './demo-data'
import { esJinez, registrosSimulacionJinez } from './simulacion-jinez'
import type { Actividad } from './types'

function esDeUsuario(registro: Actividad, id: string, nombre: string): boolean {
  if (registro.usuarioId) return registro.usuarioId === id
  return (registro.usuarioNombre ?? '') === nombre
}

export function useRegistros(): Actividad[] {
  const { historial } = useActividad()
  const { areas } = useAreas()
  const { usuario } = useAuth()

  return useMemo(() => {
    const base =
      historial.length > 0
        ? historial
        : REGISTROS_DEMO.map((r) => ({ ...r, areaId: r.areaId ?? areas[0]?.id ?? null }))
    let propios = base
    if (usuario?.rol === 'abogado') {
      propios = base.filter((r) => esDeUsuario(r, usuario.id, usuario.nombre))
    }
    if (usuario && esJinez(usuario)) {
      const simulacion = registrosSimulacionJinez(usuario)
      propios = [...propios, ...simulacion.filter((s) => !propios.some((p) => p.id === s.id))]
    }
    return propios
  }, [historial, areas, usuario])
}
