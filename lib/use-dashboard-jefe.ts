'use client'

import { useQuery } from '@tanstack/react-query'
import { useAuth } from './auth-context'
import { useCartera } from './use-cartera'
import { opcionesApi } from './api-cliente'
import type { Actividad } from './types'
import type { Resumen } from './use-resumen'
import type { CumplimientoReporte } from './cumplimiento'

/** Rango por defecto: el mes en curso, del día 1 a hoy. */
export function rangoDelMes(date = new Date()): { desde: string; hasta: string } {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const ultimo = new Date(y, m, 0).getDate()
  const dd = (d: number) => String(d).padStart(2, '0')
  return {
    desde: `${y}-${dd(m)}-01`,
    hasta: `${y}-${dd(m)}-${dd(Math.min(date.getDate(), ultimo))}`,
  }
}

/**
 * El rango anterior, de la MISMA duración, inmediatamente antes.
 *
 * Comparar "este mes" contra "el mes pasado" miente cuando el mes va a medias:
 * el 3 de diciembre apenas hay tres días y contra un mes completo siempre sale
 * una caída. Con la misma duración, el porcentaje sí significa algo.
 */
export function rangoAnterior(
  desde: string,
  hasta: string,
): { desde: string; hasta: string } | null {
  const d = new Date(`${desde}T00:00:00`)
  const h = new Date(`${hasta}T00:00:00`)
  if (Number.isNaN(d.getTime()) || Number.isNaN(h.getTime()) || h < d) return null
  const dias = Math.round((h.getTime() - d.getTime()) / 86_400_000) + 1
  const fin = new Date(d)
  fin.setDate(fin.getDate() - 1)
  const ini = new Date(fin)
  ini.setDate(ini.getDate() - (dias - 1))
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return { desde: iso(ini), hasta: iso(fin) }
}

async function consultar<T>(url: string, signal: AbortSignal): Promise<T | null> {
  try {
    const respuesta = await fetch(url, opcionesApi({ signal }))
    return respuesta.ok ? await respuesta.json() as T : null
  } catch (error) {
    if (signal.aborted) throw error
    return null
  }
}

export function useDatosJefeArea({ desde, hasta }: { desde: string; hasta: string }) {
  const { usuario, empresaActiva } = useAuth()
  const cartera = useCartera()
  const consulta = useQuery({
    queryKey: ['dashboard-jefe', empresaActiva?.id, usuario?.id, usuario?.area_id, desde, hasta],
    enabled: Boolean(empresaActiva && usuario?.rol === 'jefe_area' && usuario.area_id != null && desde && hasta),
    queryFn: async ({ signal }) => {
      const anterior = rangoAnterior(desde, hasta)
      const mesCierre = hasta.slice(0, 7)
      const parametros = new URLSearchParams({ desde, hasta })
      const periodoCumplimiento = new URLSearchParams({
        anio: hasta.slice(0, 4), mes: hasta.slice(5, 7),
        desde: desde.slice(0, 7) === mesCierre ? desde : mesCierre + '-01',
        hasta,
      })
      const [resumen, resumenAnterior, cumplimiento, recientes] = await Promise.all([
        consultar<Resumen>('/api/actividades/resumen?' + parametros, signal),
        anterior ? consultar<Resumen>('/api/actividades/resumen?' + new URLSearchParams(anterior), signal) : null,
        consultar<CumplimientoReporte>('/api/cumplimiento?' + periodoCumplimiento, signal),
        consultar<Actividad[]>('/api/actividades?' + parametros + '&limite=8', signal),
      ])
      return { resumen, resumenAnterior, cumplimiento, recientes }
    },
  })
  const datos = consulta.data
  return {
    resumen: datos?.resumen,
    resumenAnterior: datos?.resumenAnterior,
    cumplimiento: datos?.cumplimiento,
    recientes: datos?.recientes ?? [],
    cartera: cartera.data,
    inicial: (consulta.isPending && consulta.fetchStatus !== 'idle') || (cartera.isPending && cartera.fetchStatus !== 'idle'),
    cargando: consulta.isFetching || cartera.isFetching,
    error: consulta.isError || cartera.isError || Boolean(datos && (!datos.resumen || !datos.cumplimiento || !datos.recientes)),
  }
}
