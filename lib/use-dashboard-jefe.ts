'use client'

// Datos del panel del jefe de área.
//
// CUATRO peticiones, todas agrupadas y todas en paralelo. La decisión es
// deliberada: con 200+ colaboradores, pedir una cosa por persona o una por
// cliente son cientos de viajes y el panel tarda minutos. Aquí nada depende de
// un id que haya que resolver antes, así que van todas juntas.
//
// El recorte por ÁREA no se pide: lo pone el servidor.
//   - /api/actividades/resumen fuerza `u.area_id` cuando quien llama es jefe.
//   - /api/clientes/cartera filtra `c.area_id`.
//   - /api/cumplimiento fuerza `areaId` y da 403 si se pide otra.
// Enviar un area_id distinto no serviría de nada: en esas tres rutas no se
// respeta, se ignora o se rechaza.

import { useCallback, useEffect, useState } from 'react'

import type { Actividad } from './types'
import type { Resumen } from './use-resumen'
import type { CumplimientoReporte } from './cumplimiento'
import type { AlertaCartera, ClienteCartera } from '@/components/cartera-ui'
import { subscribeClientesChanges } from './events'
import { opcionesApi } from '@/lib/api-cliente'

export type TotalesCartera = {
  clientes: number
  contratadas: number
  consumidas: number
  disponibles: number
  excedidas: number
  porAprobar: number
}

export type RespuestaCartera = {
  totales: TotalesCartera
  clientes: ClienteCartera[]
  alertas: AlertaCartera[]
}

/** Filas recientes de la actividad del equipo. */
const RECIENTES_LIMITE = 12

export type DatosJefeArea = {
  rango: { desde: string; hasta: string }
  /** Agregados del rango elegido. */
  resumen: Resumen | null
  /** Agregados del rango inmediatamente anterior, de la MISMA duración. */
  resumenAnterior: Resumen | null
  cartera: RespuestaCartera | null
  cumplimiento: CumplimientoReporte | null
  recientes: Actividad[]
  cargando: boolean
  error: string | null
}

const VACIO: DatosJefeArea = {
  rango: { desde: '', hasta: '' },
  resumen: null,
  resumenAnterior: null,
  cartera: null,
  cumplimiento: null,
  recientes: [],
  cargando: false,
  error: null,
}

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

export function useDatosJefeArea(rango: { desde: string; hasta: string }): DatosJefeArea {
  const [datos, setDatos] = useState<DatosJefeArea>(VACIO)
  const { desde, hasta } = rango

  const cargar = useCallback(async () => {
    if (typeof window === 'undefined') return
    if (!desde || !hasta) {
      setDatos(VACIO)
      return
    }
    setDatos((d) => ({ ...d, cargando: true, error: null }))
    const anterior = rangoAnterior(desde, hasta)
    const mes = hasta.slice(5, 7)
    const anio = hasta.slice(0, 4)

    const qs = `desde=${desde}&hasta=${hasta}`
    // El resumen del mes en curso se usa para el cumplimiento, que la API exige
    // por mes (`anio` y `mes` son obligatorios). No sigue al filtro de fechas a
    // propósito: mezclar "cumplimiento de mayo" con un rango de marzo daría dos
    // escalas distintas en la misma pantalla sin avisar.
    const [resumen, cartera, cumplimiento, recientes] = await Promise.all([
      fetch(`/api/actividades/resumen?${qs}`, opcionesApi())
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch('/api/clientes/cartera', opcionesApi())
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/cumplimiento?anio=${anio}&mes=${mes}`, opcionesApi())
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/actividades?${qs}&limite=${RECIENTES_LIMITE}`, opcionesApi())
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ])

    const resumenPrevio = anterior
      ? await fetch(`/api/actividades/resumen?desde=${anterior.desde}&hasta=${anterior.hasta}`, opcionesApi())
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      : null

    setDatos({
      rango: { desde, hasta },
      resumen: resumen as Resumen | null,
      resumenAnterior: resumenPrevio as Resumen | null,
      cartera: cartera as RespuestaCartera | null,
      cumplimiento: cumplimiento as CumplimientoReporte | null,
      recientes: Array.isArray(recientes) ? (recientes as Actividad[]) : [],
      cargando: false,
      error: null,
    })
  }, [desde, hasta])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // La cartera que pinta este panel sale de /api/clientes/cartera, que se pidió
  // una vez al montar. Si alguien da de alta un cliente (o lo edita, o lo borra)
  // mientras el panel está abierto, esas cifras quedan viejas hasta recargar la
  // página a mano. El aviso llega del contexto de clientes, que es quien escribe.
  useEffect(() => {
    return subscribeClientesChanges(() => {
      void cargar()
    })
  }, [cargar])

  return datos
}
