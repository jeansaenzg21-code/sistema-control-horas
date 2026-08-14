'use client'

import { useMemo } from 'react'
import { useActividad } from './actividad-context'
import { useAreas } from './areas-context'
import { REGISTROS_DEMO } from './demo-data'
import type { Actividad } from './types'

export function useRegistros(): Actividad[] {
  const { historial } = useActividad()
  const { areas } = useAreas()

  return useMemo(() => {
    if (historial.length > 0) return historial
    const principalId = areas[0]?.id ?? null
    return REGISTROS_DEMO.map((r) => ({ ...r, areaId: r.areaId ?? principalId }))
  }, [historial, areas])
}
