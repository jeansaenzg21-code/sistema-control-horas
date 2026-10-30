'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type Propiedad = 'Propia' | 'Smart Service' | 'Valrex'
export type Estado =
  | 'Asignado / Reservado'
  | 'Disponible'
  | 'En reparación'
  | 'BAJA'
  | 'Vendido'
  | 'No disponible'
  | 'Pendiente'

export type Equipo = {
  id: number | null
  codigo: string
  tipoActivo: string
  usuario: string
  estado: Estado
  propiedad: Propiedad
  area: string
  areaDestino: string
  procesador: string
  marca: string
  modelo: string
  ram: string
  disco: string
  serie: string
  proveedor: string
  mantenimiento: string
  observacion: string
  origenHoja: string
  origenSeccion: string
  origenFila: number | null
  duplicado: boolean
  duplicadoSerie: boolean
}

export type ResumenDuplicados = {
  codigos: number
  series: number
  equipos: number
}

export type RespuestaLaptops = {
  equipos: Equipo[]
  duplicados: ResumenDuplicados
}

const CLAVE_CACHE = 'pc_laptops_cache_v1'
const DUPLICADOS_VACIOS: ResumenDuplicados = { codigos: 0, series: 0, equipos: 0 }

let memoria: RespuestaLaptops | null = null
let peticionEnVuelo: Promise<RespuestaLaptops> | null = null

function texto(valor: unknown): string {
  return valor == null ? '' : String(valor)
}

function normalizarEstado(raw: unknown): Estado {
  const n = (texto(raw) || 'Pendiente').trim()
  if (n === 'Asignado') return 'Asignado / Reservado'
  return (n as Estado) || 'Pendiente'
}

function numeroONull(valor: unknown): number | null {
  if (valor == null || valor === '') return null
  const n = Number(valor)
  return Number.isFinite(n) ? n : null
}

function normalizarEquipo(raw: Record<string, unknown>): Equipo {
  return {
    id: numeroONull(raw.id),
    codigo: texto(raw.codigo),
    tipoActivo: texto(raw.tipoActivo) || 'Laptop',
    usuario: texto(raw.usuario),
    estado: normalizarEstado(raw.estado),
    propiedad: (texto(raw.propiedad) || 'Propia') as Propiedad,
    area: texto(raw.area),
    areaDestino: texto(raw.areaDestino),
    procesador: texto(raw.procesador),
    marca: texto(raw.marca).toUpperCase(),
    modelo: texto(raw.modelo),
    ram: texto(raw.ram),
    disco: texto(raw.disco),
    serie: texto(raw.serie),
    proveedor: texto(raw.proveedor),
    mantenimiento: texto(raw.mantenimiento),
    observacion: texto(raw.observacion),
    origenHoja: texto(raw.origenHoja),
    origenSeccion: texto(raw.origenSeccion),
    origenFila: numeroONull(raw.origenFila),
    duplicado: Boolean(raw.duplicado),
    duplicadoSerie: Boolean(raw.duplicadoSerie),
  }
}

function normalizarRespuesta(raw: unknown): RespuestaLaptops {
  const data = (raw ?? {}) as Record<string, unknown>
  const equipos = Array.isArray(data.equipos)
    ? (data.equipos as Array<Record<string, unknown>>).map(normalizarEquipo)
    : []
  const dup = (data.duplicados ?? {}) as Record<string, unknown>
  return {
    equipos,
    duplicados: {
      codigos: Number(dup.codigos) || 0,
      series: Number(dup.series) || 0,
      equipos: Number(dup.equipos) || 0,
    },
  }
}

export function leerCacheLaptops(): RespuestaLaptops | null {
  if (memoria) return memoria
  if (typeof window === 'undefined') return null
  try {
    const guardado = window.sessionStorage.getItem(CLAVE_CACHE)
    if (!guardado) return null
    const parsed = JSON.parse(guardado) as unknown
    const normalizado = normalizarRespuesta(parsed)
    if (!normalizado.equipos.length) return null
    memoria = normalizado
    return normalizado
  } catch {
    return null
  }
}

function guardarCache(datos: RespuestaLaptops) {
  memoria = datos
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(CLAVE_CACHE, JSON.stringify(datos))
  } catch {
    // sessionStorage puede estar deshabilitado o lleno: la memoria sigue sirviendo.
  }
}

export function invalidarLaptops() {
  memoria = null
  peticionEnVuelo = null
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(CLAVE_CACHE)
  } catch {
    // Sin sessionStorage no hay nada que limpiar.
  }
}

export async function cargarLaptops(forzar = false): Promise<RespuestaLaptops> {
  if (!forzar) {
    const cache = leerCacheLaptops()
    if (cache) return cache
  }
  if (peticionEnVuelo) return peticionEnVuelo

  peticionEnVuelo = (async () => {
    const res = await fetch('/api/laptops', { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(String((data as { error?: string }).error || 'No se pudo cargar el inventario.'))
    }
    const normalizado = normalizarRespuesta(data)
    guardarCache(normalizado)
    return normalizado
  })()

  try {
    return await peticionEnVuelo
  } finally {
    peticionEnVuelo = null
  }
}

export function useLaptops() {
  const inicialRef = useRef<RespuestaLaptops | null>(null)
  if (inicialRef.current === null) inicialRef.current = leerCacheLaptops()

  const [equipos, setEquipos] = useState<Equipo[]>(inicialRef.current?.equipos ?? [])
  const [duplicados, setDuplicados] = useState<ResumenDuplicados>(
    inicialRef.current?.duplicados ?? DUPLICADOS_VACIOS,
  )
  const [cargando, setCargando] = useState(inicialRef.current === null)
  const [error, setError] = useState('')
  const montadoRef = useRef(true)

  const recargar = useCallback(async (forzar = true): Promise<RespuestaLaptops | null> => {
    try {
      const datos = await cargarLaptops(forzar)
      if (!montadoRef.current) return datos
      setEquipos(datos.equipos)
      setDuplicados(datos.duplicados)
      setError('')
      return datos
    } catch (e) {
      if (montadoRef.current) {
        setError(e instanceof Error ? e.message : 'No se pudo cargar el inventario.')
      }
      return null
    } finally {
      if (montadoRef.current) setCargando(false)
    }
  }, [])

  useEffect(() => {
    montadoRef.current = true
    void recargar(inicialRef.current === null)
    return () => {
      montadoRef.current = false
    }
  }, [recargar])

  return { equipos, duplicados, cargando, error, recargar }
}
