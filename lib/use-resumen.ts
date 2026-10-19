'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Lee los AGREGADOS de un periodo desde /api/actividades/resumen.
 *
 * Los paneles no necesitan filas de actividad, necesitan numeros: total de
 * horas, horas por cargo, por division, por dia. Pedir las filas para sumarlas
 * en el navegador era el problema: un administrador bajaba 20 000 filas, 11,9 MB
 * y 40 peticiones para mostrar un handful de tarjetas.
 *
 * Aqui el calculo lo hace MySQL con un GROUP BY y lo que llega al navegador son
 * unas decenas de numeros.
 */

export type ResumenTotales = {
  registros: number
  horas: number
  horas_facturadas: number
  horas_no_facturadas: number
}

export type Resumen = {
  totales: ResumenTotales
  por_cargo: Array<{ cargo: string; registros: number; horas: number }>
  por_cargo_facturable: Array<{ cargo: string; horas: number }>
  por_usuario: Array<{
    usuario_id: number
    nombre: string
    cargo: string | null
    area_nombre: string
    registros: number
    horas: number
  }>
  por_dia: Array<{ dia: string; registros: number; horas: number }>
  /**
   * Registros por estado. Lo usa el panel del jefe de área para el donut de
   * estados y para los contadores de pendientes y observados: con `totales` no
   * basta, porque ahí solo viene el agregado.
   */
  por_estado?: Array<{ estado: string; registros: number; horas: number }>
}

const VACIO: Resumen = {
  totales: { registros: 0, horas: 0, horas_facturadas: 0, horas_no_facturadas: 0 },
  por_cargo: [],
  por_cargo_facturable: [],
  por_usuario: [],
  por_dia: [],
  por_estado: [],
}

export function useResumenActividades(
  opciones: { desde?: string; hasta?: string; areaId?: string; usuarioId?: number | null } = {}
): { resumen: Resumen; cargando: boolean; error: string | null } {
  const { desde = '', hasta = '', areaId = '', usuarioId = null } = opciones
  const [resumen, setResumen] = useState<Resumen>(VACIO)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
    if (!token) return
    setCargando(true)
    setError(null)
    const params = new URLSearchParams()
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    if (areaId) params.set('area_id', areaId)
    if (usuarioId != null) params.set('usuario_id', String(usuarioId))
    try {
      const res = await fetch(`/api/actividades/resumen?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        setError('No se pudo cargar el resumen.')
        setResumen(VACIO)
        return
      }
      setResumen((await res.json()) as Resumen)
    } catch {
      setError('No se pudo conectar con el servidor.')
    } finally {
      setCargando(false)
    }
  }, [desde, hasta, areaId, usuarioId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  return { resumen, cargando, error }
}
