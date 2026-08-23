'use client'

import { useMemo } from 'react'
import { useActividad } from './actividad-context'
import { useAuth } from './auth-context'
import type { Actividad } from './types'

export function useRegistros(): Actividad[] {
  const { historial } = useActividad()
  const { usuario } = useAuth()

  return useMemo(() => {
    if (!usuario) return []
    return historial
  }, [historial, usuario])
}
