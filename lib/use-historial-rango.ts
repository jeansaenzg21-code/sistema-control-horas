'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Actividad } from './types'

/**
 * Historial COMPLETO de un rango de fechas, paginado en el servidor.
 *
 * Por que existe: `useRegistros()` devuelve el historial paginado del contexto
 * (200 filas por pagina), pensado para la lista de "mis registros". Las
 * pantallas que CALCULAN totales sobre ese array -consolidacion, reportes,
 * facturacion y los graficos del panel- necesitan el conjunto completo. Con solo
 * 200 filas, un trabajador con 250 actividades ve 200: medido, la interfaz
 * omitia 50 registros y 78,79 horas. Los totales salian mal sin avisar.
 *
 * Aqui se piden todas las paginas del rango que la pantalla esta mostrando, y
 * se dice si se pudo traer el conjunto entero.
 */

const PAGINA = 500
// Tope de filas por rango. Si se supera, se avisa en vez de mostrar un total
// incompleto en silencio: es preferible que el usuario sepa que el periodo es
// demasiado grande a que firme un total que no es el real.
export const TOPE_RANGO = 20_000

type Cache = {
  clave: string
  datos: Actividad[]
}

const cacheGlobal = (globalThis as unknown as { __pcHistorialRango?: Cache }).__pcHistorialRango
  ?? { clave: '', datos: [] }
;(globalThis as unknown as { __pcHistorialRango?: Cache }).__pcHistorialRango = cacheGlobal

export type ResultadoRango = {
  registros: Actividad[]
  cargando: boolean
  /** false cuando el rango tiene mas filas que el tope y se ha recortado. */
  completo: boolean
  total: number
  recargar: () => void
}

export function useHistorialRango(
  desde: string,
  hasta: string,
  opciones: { usuarioId?: number | null; soloPropias?: boolean; todaEmpresa?: boolean } = {}
): ResultadoRango {
  const { usuarioId = null, todaEmpresa = false } = opciones
  const [registros, setRegistros] = useState<Actividad[]>([])
  const [cargando, setCargando] = useState(false)
  const [completo, setCompleto] = useState(true)
  const [total, setTotal] = useState(0)
  const [disparo, setDisparo] = useState(0)
  const pedidoRef = useRef(0)

  const clave = `${desde}|${hasta}|${usuarioId ?? ''}|${todaEmpresa ? 'todos' : 'propios'}`

  const cargar = useCallback(async () => {
    // Un rango SIN fechas puede ser de años, y entonces son decenas de miles de
    // filas. Para quien solo necesita numeros esta es la via equivocada: existe
    // /api/actividades/resumen, que devuelve los agregados ya calculados. Para
    // una lista de filas, /api/actividades paginado.
    //
    // Si se pide aqui sin rango y el conjunto es grande, NO se intenta: se avisa
    // por `completo` en vez de colgar el navegador bajando 12 MB.
    if (!desde || !hasta) {
      setRegistros([])
      setTotal(0)
      setCompleto(false)
      return
    }

    const token = typeof window !== 'undefined' ? localStorage.getItem('pc_token') : null
    if (!token) return

    const pedido = pedidoRef.current + 1
    pedidoRef.current = pedido
    setCargando(true)

    // Si el rango es identico al de otra pantalla, se reutiliza: el panel, la
    // consolidacion y los graficos miran a menudo el mismo periodo y no tiene
    // sentido bajarlo tres veces.
    if (cacheGlobal.clave === clave) {
      setRegistros(cacheGlobal.datos)
      setTotal(cacheGlobal.datos.length)
      setCompleto(cacheGlobal.datos.length < TOPE_RANGO)
      setCargando(false)
      return
    }

    // Sin rango indicado la pantalla quiere TODO el historial, que es lo que
    // hacia antes de que existiera la paginacion. Se piden todas las paginas
    // hasta el tope, y si se llega al tope se marca como incompleto en vez de
    // fingir que el total es ese.
    const acumuladas: Actividad[] = []
    let hayMas = true
    let recortado = false

    try {
      while (hayMas && acumuladas.length < TOPE_RANGO) {
        // Igual que en lib/actividad-context.tsx: la query se arma con
        // URLSearchParams. Antes se concatenaba a una base que con `todaEmpresa`
        // no llevaba '?', y la URL caía en 404 en vez de devolver filas.
        const params = new URLSearchParams({
          limite: String(PAGINA),
          offset: String(acumuladas.length),
        })
        if (desde && hasta) {
          params.set('desde', desde)
          params.set('hasta', hasta)
        }
        if (!todaEmpresa && usuarioId != null) params.set('usuario_id', String(usuarioId))
        const url = `/api/actividades?${params.toString()}`
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) break
        const lote = (await res.json()) as Actividad[]
        if (lote.length === 0) break

        // Dedup por id: entre paginas, si una actividad entra con la misma
        // fecha que otra, el offset puede desplazar una fila.
        const vistos = new Set(acumuladas.map((a) => a.id))
        for (const a of lote) if (!vistos.has(a.id)) acumuladas.push(a)

        if (lote.length < PAGINA) hayMas = false
        else if (acumuladas.length >= TOPE_RANGO) {
          recortado = true
          hayMas = false
        }
      }
      if (pedido !== pedidoRef.current) return

      cacheGlobal.clave = clave
      cacheGlobal.datos = acumuladas
      setRegistros(acumuladas)
      setTotal(acumuladas.length)
      setCompleto(!recortado)
    } catch {
      if (pedido === pedidoRef.current) {
        setRegistros([])
        setTotal(0)
        setCompleto(true)
      }
    } finally {
      if (pedido === pedidoRef.current) setCargando(false)
    }
  }, [clave, desde, hasta, usuarioId, todaEmpresa])

  useEffect(() => {
    void cargar()
  }, [cargar, disparo])

  return { registros, cargando, completo, total, recargar: () => setDisparo((d) => d + 1) }
}
